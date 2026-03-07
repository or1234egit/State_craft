// src/firebase.js
// All Firebase initialization and database operations are here.
// Replace the firebaseConfig object with your own project credentials.

import { initializeApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  get,
  update,
  push,
  onValue,
  runTransaction,
  serverTimestamp,
  off,
} from 'firebase/database';

// ─── REPLACE THIS WITH YOUR FIREBASE PROJECT CONFIG ───────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAfqDIcanOsVoUzCLcg2PIiEhFTfGSW8s",
  authDomain: "statecraft-8c38c.firebaseapp.com",
  databaseURL: "https://statecraft-8c38c-default-rtdb.firebaseio.com",
  projectId: "statecraft-8c38c",
  storageBucket: "statecraft-8c38c.firebasestorage.app",
  messagingSenderId: "4316691071",
  appId: "1:4316691071:web:ea9a171f7c795d75261d4a"
};
// ──────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function roomRef(roomCode) {
  return ref(db, `rooms/${roomCode}`);
}
function metaRef(roomCode) {
  return ref(db, `rooms/${roomCode}/meta`);
}
function playersRef(roomCode) {
  return ref(db, `rooms/${roomCode}/players`);
}
function publicStateRef(roomCode) {
  return ref(db, `rooms/${roomCode}/publicState`);
}
function financeRef(roomCode) {
  return ref(db, `rooms/${roomCode}/private/finance`);
}
function defenceRef(roomCode) {
  return ref(db, `rooms/${roomCode}/private/defence`);
}
function logRef(roomCode) {
  return ref(db, `rooms/${roomCode}/log`);
}

// ─── ROOM OPERATIONS ──────────────────────────────────────────────────────────

/**
 * Creates a new room with initial game state.
 * Uses a transaction to prevent two clients creating the same room simultaneously.
 * Returns { success: boolean, error?: string }
 */
export async function createRoom(roomCode, sessionId) {
  const mRef = metaRef(roomCode);
  let created = false;

  await runTransaction(mRef, (current) => {
    if (current !== null) {
      // Room already exists — abort
      return undefined;
    }
    created = true;
    return {
      createdAt: Date.now(),
      hostSessionId: sessionId,
      status: 'waiting', // waiting | playing | finished
    };
  });

  if (!created) {
    return { success: false, error: 'Room already exists. Try a different code.' };
  }

  // Initialise game state nodes
  await set(publicStateRef(roomCode), buildInitialPublicState());
  await set(financeRef(roomCode), buildInitialFinanceState());
  await set(defenceRef(roomCode), buildInitialDefenceState());
  await set(playersRef(roomCode), {});
  await set(logRef(roomCode), {});

  await addLogEntry(roomCode, 'Room created. Waiting for second player…');
  return { success: true };
}

/**
 * Joins an existing room.
 * Returns { success: boolean, error?: string }
 */
export async function joinRoom(roomCode) {
  const snap = await get(metaRef(roomCode));
  if (!snap.exists()) {
    return { success: false, error: 'Room not found. Check the code and try again.' };
  }
  const meta = snap.val();
  if (meta.status === 'finished') {
    return { success: false, error: 'That game has already ended.' };
  }
  return { success: true };
}

// ─── ROLE OPERATIONS ──────────────────────────────────────────────────────────

/**
 * Claims a role ('finance' | 'defence') in a room.
 * Uses a transaction to ensure each role is claimed by at most one session.
 * Returns { success: boolean, error?: string }
 */
export async function claimRole(roomCode, role, sessionId) {
  const pRef = playersRef(roomCode);
  let claimed = false;

  await runTransaction(pRef, (current) => {
    const players = current || {};
    // Check if this session already has a role
    for (const [sid, data] of Object.entries(players)) {
      if (sid === sessionId) {
        claimed = true; // already claimed
        return players; // no change
      }
    }
    // Check if the desired role is taken by someone else
    for (const [sid, data] of Object.entries(players)) {
      if (data.role === role && sid !== sessionId) {
        return undefined; // abort — role taken
      }
    }
    claimed = true;
    players[sessionId] = { role, joinedAt: Date.now(), connected: true };
    return players;
  });

  if (!claimed) {
    return { success: false, error: `The ${role} role is already taken.` };
  }

  // Check if both roles are now filled → start the game
  const snap = await get(playersRef(roomCode));
  const players = snap.val() || {};
  const roles = Object.values(players).map((p) => p.role);
  if (roles.includes('finance') && roles.includes('defence')) {
    await update(metaRef(roomCode), { status: 'playing' });
    await addLogEntry(roomCode, 'Both ministers have joined. The game begins!');
  } else {
    await addLogEntry(roomCode, `Minister of ${capitalize(role)} has joined. Waiting for partner…`);
  }

  return { success: true };
}

/**
 * Returns the role ('finance'|'defence'|null) of a given sessionId in a room.
 */
export async function getMyRole(roomCode, sessionId) {
  const snap = await get(playersRef(roomCode));
  if (!snap.exists()) return null;
  const players = snap.val();
  return players[sessionId]?.role || null;
}

// ─── FINANCE ACTIONS ──────────────────────────────────────────────────────────

/**
 * Build a city: costs 50 resources, adds 1 city.
 * Idempotent per action token.
 */
export async function buildCity(roomCode, actionToken) {
  let result = { success: false, error: '' };

  await runTransaction(financeRef(roomCode), (finance) => {
    if (!finance) return undefined;
    if (finance.lastActionToken === actionToken) {
      result = { success: true, alreadyDone: true };
      return finance; // idempotent — no change
    }
    if (finance.resources < 50) {
      result = { success: false, error: 'Not enough resources. A city costs 50.' };
      return undefined; // abort
    }
    result = { success: true };
    return {
      ...finance,
      resources: finance.resources - 50,
      cities: finance.cities + 1,
      lastActionToken: actionToken,
    };
  });

  if (result.success && !result.alreadyDone) {
    await addLogEntry(roomCode, 'Finance built a new city. (-50 resources, +1 city)');
  }
  return result;
}

/**
 * Transfer resources from Finance to Defence budget.
 * amount must be a positive integer.
 */
export async function transferResources(roomCode, amount, actionToken) {
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) return { success: false, error: 'Enter a positive amount to transfer.' };

  let result = { success: false, error: '' };

  // We need to update both finance and defence atomically using a multi-path update.
  // Read both first, validate, then write.
  const [finSnap, defSnap] = await Promise.all([
    get(financeRef(roomCode)),
    get(defenceRef(roomCode)),
  ]);

  if (!finSnap.exists() || !defSnap.exists()) {
    return { success: false, error: 'Game state not found.' };
  }

  const finance = finSnap.val();
  const defence = defSnap.val();

  if (finance.lastTransferToken === actionToken) {
    return { success: true, alreadyDone: true };
  }
  if (finance.resources < amt) {
    return { success: false, error: `Not enough resources. You have ${finance.resources}.` };
  }

  await update(ref(db, `rooms/${roomCode}`), {
    'private/finance/resources': finance.resources - amt,
    'private/finance/lastTransferToken': actionToken,
    'private/defence/defenceBudget': defence.defenceBudget + amt,
  });

  await addLogEntry(roomCode, `Finance transferred ${amt} resources to Defence.`);
  return { success: true };
}

/**
 * Finance ends their phase.
 */
export async function financeEndPhase(roomCode, turnNumber) {
  let changed = false;
  await runTransaction(publicStateRef(roomCode), (pub) => {
    if (!pub) return undefined;
    if (pub.phase !== 'finance') return undefined; // already moved on
    if (pub.turnNumber !== turnNumber) return undefined;
    changed = true;
    return { ...pub, phase: 'defence' };
  });

  if (changed) {
    await addLogEntry(roomCode, 'Finance phase ended. Defence phase begins.');
  }
  return { success: changed };
}

// ─── DEFENCE ACTIONS ──────────────────────────────────────────────────────────

/**
 * Recruit soldiers: costs 10 resources per soldier from defenceBudget.
 */
export async function recruitSoldiers(roomCode, count, actionToken) {
  const cnt = parseInt(count, 10);
  if (!cnt || cnt <= 0) return { success: false, error: 'Enter a positive number of soldiers.' };
  const cost = cnt * 10;

  let result = { success: false, error: '' };

  await runTransaction(defenceRef(roomCode), (defence) => {
    if (!defence) return undefined;
    if (defence.lastRecruitToken === actionToken) {
      result = { success: true, alreadyDone: true };
      return defence;
    }
    if (defence.defenceBudget < cost) {
      result = { success: false, error: `Need ${cost} budget. You have ${defence.defenceBudget}.` };
      return undefined;
    }
    result = { success: true };
    return {
      ...defence,
      soldiers: defence.soldiers + cnt,
      defenceBudget: defence.defenceBudget - cost,
      lastRecruitToken: actionToken,
    };
  });

  if (result.success && !result.alreadyDone) {
    await addLogEntry(roomCode, `Defence recruited ${cnt} soldier${cnt > 1 ? 's' : ''}. (-${cost} budget)`);
  }
  return result;
}

/**
 * Deploy soldiers to the defensive line.
 * Cannot deploy more than available soldiers.
 */
export async function deploySoldiers(roomCode, count, actionToken) {
  const cnt = parseInt(count, 10);
  if (!cnt || cnt <= 0) return { success: false, error: 'Enter a positive number to deploy.' };

  let result = { success: false, error: '' };

  await runTransaction(defenceRef(roomCode), (defence) => {
    if (!defence) return undefined;
    if (defence.lastDeployToken === actionToken) {
      result = { success: true, alreadyDone: true };
      return defence;
    }
    const available = defence.soldiers - defence.deployedSoldiers;
    if (cnt > available) {
      result = { success: false, error: `Only ${available} soldiers available to deploy.` };
      return undefined;
    }
    result = { success: true };
    return {
      ...defence,
      deployedSoldiers: defence.deployedSoldiers + cnt,
      lastDeployToken: actionToken,
    };
  });

  if (result.success && !result.alreadyDone) {
    await addLogEntry(roomCode, `Defence deployed ${cnt} soldier${cnt > 1 ? 's' : ''} to the front line.`);
  }
  return result;
}

/**
 * Defence ends their phase — triggers the enemy attack resolution.
 */
export async function defenceEndPhase(roomCode, turnNumber) {
  let changed = false;
  await runTransaction(publicStateRef(roomCode), (pub) => {
    if (!pub) return undefined;
    if (pub.phase !== 'defence') return undefined;
    if (pub.turnNumber !== turnNumber) return undefined;
    changed = true;
    return { ...pub, phase: 'attack' };
  });

  if (changed) {
    await addLogEntry(roomCode, 'Defence phase ended. Enemy attacks!');
    // Resolve immediately
    await resolveAttack(roomCode);
  }
  return { success: changed };
}

// ─── ATTACK RESOLUTION ────────────────────────────────────────────────────────

/**
 * Resolves enemy attack. Idempotent — skips if phase is not 'attack'.
 * All state updates in a single multi-path write after reading current state.
 */
export async function resolveAttack(roomCode) {
  const [pubSnap, defSnap] = await Promise.all([
    get(publicStateRef(roomCode)),
    get(defenceRef(roomCode)),
  ]);

  if (!pubSnap.exists() || !defSnap.exists()) return;
  const pub = pubSnap.val();
  const defence = defSnap.val();

  if (pub.phase !== 'attack') return; // already resolved

  const turn = pub.turnNumber;
  const enemyPower = 10 + turn * 5 + Math.floor(Math.random() * 11);
  const defenceStrength = defence.deployedSoldiers;
  const defenceWins = defenceStrength >= enemyPower;

  let soldierLosses, countryDamage;
  if (defenceWins) {
    soldierLosses = Math.max(1, Math.floor(enemyPower / 8));
    countryDamage = 0;
  } else {
    soldierLosses = Math.max(2, Math.floor(enemyPower / 5));
    countryDamage = Math.max(0, enemyPower - defenceStrength);
  }

  // Survivors return from deployment; losses taken from deployed first, then total
  const newDeployed = Math.max(0, defenceStrength - soldierLosses);
  const lostFromDeployed = defenceStrength - newDeployed;
  const newSoldiers = Math.max(0, defence.soldiers - lostFromDeployed);
  const newHealth = Math.max(0, pub.countryHealth - countryDamage);
  const gameOver = newHealth <= 0;

  const outcome = defenceWins ? '⚔️ Enemy repelled!' : '💥 Defence line broken!';
  const logMsg = `Turn ${turn} — ${outcome} Enemy power: ${enemyPower}, Defence: ${defenceStrength}. ` +
    `Losses: ${lostFromDeployed} soldier${lostFromDeployed !== 1 ? 's' : ''}. ` +
    (countryDamage > 0 ? `Country took ${countryDamage} damage.` : 'Country unharmed.');

  await addLogEntry(roomCode, logMsg);

  // Determine next phase / game over
  const nextPhase = gameOver ? 'gameover' : 'finance';
  const nextTurn = gameOver ? turn : turn + 1;

  // Apply income for next turn (cities * 20) if not game over
  const finSnap = await get(financeRef(roomCode));
  const finance = finSnap.val();
  const income = gameOver ? 0 : finance.cities * 20;

  const updates = {
    'publicState/countryHealth': newHealth,
    'publicState/phase': nextPhase,
    'publicState/turnNumber': nextTurn,
    'publicState/lastEnemyPower': enemyPower,
    'private/defence/soldiers': newSoldiers,
    'private/defence/deployedSoldiers': 0, // survivors return to pool
    'private/defence/defenceBudget': 0,    // budget resets each turn
  };

  if (!gameOver) {
    updates['private/finance/resources'] = finance.resources + income;
    if (income > 0) {
      await addLogEntry(roomCode, `Turn ${nextTurn} begins. Income: +${income} resources (${finance.cities} cit${finance.cities === 1 ? 'y' : 'ies'}).`);
    }
  } else {
    await update(metaRef(roomCode), { status: 'finished' });
    await addLogEntry(roomCode, `The country has fallen! Game over after ${turn} turn${turn !== 1 ? 's' : ''}.`);
  }

  await update(ref(db, `rooms/${roomCode}`), updates);
}

// ─── LOG ──────────────────────────────────────────────────────────────────────

export async function addLogEntry(roomCode, message) {
  await push(logRef(roomCode), {
    message,
    ts: Date.now(),
  });
}

// ─── REAL-TIME LISTENERS ──────────────────────────────────────────────────────

export function subscribePublicState(roomCode, callback) {
  const r = publicStateRef(roomCode);
  onValue(r, (snap) => callback(snap.val()));
  return () => off(r);
}

export function subscribeMeta(roomCode, callback) {
  const r = metaRef(roomCode);
  onValue(r, (snap) => callback(snap.val()));
  return () => off(r);
}

export function subscribePlayers(roomCode, callback) {
  const r = playersRef(roomCode);
  onValue(r, (snap) => callback(snap.val() || {}));
  return () => off(r);
}

export function subscribeFinance(roomCode, callback) {
  const r = financeRef(roomCode);
  onValue(r, (snap) => callback(snap.val()));
  return () => off(r);
}

export function subscribeDefence(roomCode, callback) {
  const r = defenceRef(roomCode);
  onValue(r, (snap) => callback(snap.val()));
  return () => off(r);
}

export function subscribeLog(roomCode, callback) {
  const r = logRef(roomCode);
  onValue(r, (snap) => {
    const raw = snap.val() || {};
    const entries = Object.values(raw)
      .sort((a, b) => a.ts - b.ts)
      .slice(-20); // keep last 20 entries in memory
    callback(entries);
  });
  return () => off(r);
}

// ─── INITIAL STATE BUILDERS ───────────────────────────────────────────────────

function buildInitialPublicState() {
  return {
    turnNumber: 1,
    phase: 'finance',        // finance | defence | attack | gameover
    countryHealth: 100,
    lastEnemyPower: 0,
  };
}

function buildInitialFinanceState() {
  return {
    resources: 100,
    cities: 1,
    lastActionToken: null,
    lastTransferToken: null,
  };
}

function buildInitialDefenceState() {
  return {
    soldiers: 20,
    deployedSoldiers: 0,
    defenceBudget: 0,
    lastRecruitToken: null,
    lastDeployToken: null,
  };
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
