// src/firebase.js — v2
// All Firebase initialization and database operations.
// Replace firebaseConfig with your real credentials.

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set, get, update, push, onValue, runTransaction, off } from 'firebase/database';
import { calcEnemyPower, resolveBattle, calcIncome, calcUpkeep, calcStaticDefence, WIN_TURNS, BUILDINGS, UNITS, blacksmithDiscount, granaryDiscount } from './game.js';

// ─── REPLACE WITH YOUR FIREBASE CONFIG ───────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAfqDIcanOsVoUzCLcg2PIiEhFTfGSW8s",
  authDomain: "statecraft-8c38c.firebaseapp.com",
  databaseURL: "https://statecraft-8c38c-default-rtdb.firebaseio.com",
  projectId: "statecraft-8c38c",
  storageBucket: "statecraft-8c38c.firebasestorage.app",
  messagingSenderId: "4316691071",
  appId: "1:4316691071:web:ea9a171f7c795d75261d4a"
};
// ─────────────────────────────────────────────────────────────────────────────

const app = initializeApp(firebaseConfig);
const db  = getDatabase(app);

// ─── REF HELPERS ─────────────────────────────────────────────────────────────
const metaRef       = (r) => ref(db, `rooms/${r}/meta`);
const playersRef    = (r) => ref(db, `rooms/${r}/players`);
const publicRef     = (r) => ref(db, `rooms/${r}/publicState`);
const financeRef    = (r) => ref(db, `rooms/${r}/private/finance`);
const defenceRef    = (r) => ref(db, `rooms/${r}/private/defence`);
const logRef        = (r) => ref(db, `rooms/${r}/log`);
const battleRef     = (r) => ref(db, `rooms/${r}/lastBattle`);

// ─── ROOM ─────────────────────────────────────────────────────────────────────
export async function createRoom(roomCode, sessionId) {
  let created = false;
  await runTransaction(metaRef(roomCode), (cur) => {
    if (cur !== null) return undefined; // exists — abort
    created = true;
    return { createdAt: Date.now(), hostSessionId: sessionId, status: 'waiting' };
  });
  if (!created) return { success: false, error: 'Room already exists. Try a different code.' };

  await set(publicRef(roomCode),  buildInitialPublic());
  await set(financeRef(roomCode), buildInitialFinance());
  await set(defenceRef(roomCode), buildInitialDefence());
  await set(playersRef(roomCode), {});
  await set(logRef(roomCode), {});
  await addLog(roomCode, 'Room created. Waiting for second player…');
  return { success: true };
}

export async function joinRoom(roomCode) {
  const snap = await get(metaRef(roomCode));
  if (!snap.exists()) return { success: false, error: 'Room not found. Check the code and try again.' };
  if (snap.val().status === 'finished') return { success: false, error: 'That game has already ended.' };
  return { success: true };
}

export async function claimRole(roomCode, role, sessionId) {
  let claimed = false;
  await runTransaction(playersRef(roomCode), (cur) => {
    const players = cur || {};
    if (players[sessionId]) { claimed = true; return players; }
    for (const [sid, d] of Object.entries(players)) {
      if (d.role === role && sid !== sessionId) return undefined; // taken
    }
    claimed = true;
    players[sessionId] = { role, joinedAt: Date.now() };
    return players;
  });
  if (!claimed) return { success: false, error: `The ${role} role is already taken.` };

  const snap = await get(playersRef(roomCode));
  const roles = Object.values(snap.val()||{}).map(p=>p.role);
  if (roles.includes('finance') && roles.includes('defence')) {
    await update(metaRef(roomCode), { status: 'playing' });
    await addLog(roomCode, 'Both ministers have joined. The game begins!');
  } else {
    await addLog(roomCode, `Minister of ${cap(role)} joined. Waiting for partner…`);
  }
  return { success: true };
}

export async function getMyRole(roomCode, sessionId) {
  const snap = await get(playersRef(roomCode));
  return snap.val()?.[sessionId]?.role || null;
}

// ─── FINANCE ACTIONS ─────────────────────────────────────────────────────────
export async function buildBuilding(roomCode, buildingId, actionToken) {
  
  const bld = BUILDINGS[buildingId];
  if (!bld) return { success: false, error: 'Unknown building.' };

  let result = { success: false, error: '' };
  await runTransaction(financeRef(roomCode), (fin) => {
    if (!fin) return undefined;
    if (fin.lastBuildToken === actionToken) { result={success:true,alreadyDone:true}; return fin; }
    const discount = blacksmithDiscount(fin.buildings||{});
    const cost = Math.max(0, bld.cost - discount);
    if (fin.resources < cost) { result={success:false,error:`Need ${cost} gold. You have ${fin.resources}.`}; return undefined; }
    result = { success: true };
    const buildings = { ...(fin.buildings||{}) };
    buildings[buildingId] = (buildings[buildingId]||0) + 1;
    return { ...fin, resources: fin.resources - cost, buildings, lastBuildToken: actionToken };
  });
  if (result.success && !result.alreadyDone)
    await addLog(roomCode, `Finance built a ${bld.label}. ${bld.icon}`);
  return result;
}

export async function transferResources(roomCode, amount, actionToken) {
  const amt = parseInt(amount, 10);
  if (!amt || amt <= 0) return { success: false, error: 'Enter a positive amount.' };

  const [finSnap, defSnap] = await Promise.all([get(financeRef(roomCode)), get(defenceRef(roomCode))]);
  if (!finSnap.exists()||!defSnap.exists()) return { success: false, error: 'State missing.' };
  const fin = finSnap.val(), def = defSnap.val();
  if (fin.lastTransferToken === actionToken) return { success: true, alreadyDone: true };
  if (fin.resources < amt) return { success: false, error: `Only ${fin.resources} gold available.` };

  await update(ref(db, `rooms/${roomCode}`), {
    'private/finance/resources': fin.resources - amt,
    'private/finance/lastTransferToken': actionToken,
    'private/defence/budget': (def.budget||0) + amt,
  });
  await addLog(roomCode, `Finance transferred ${amt} gold to Defence.`);
  return { success: true };
}

export async function financeEndPhase(roomCode, turnNumber) {
  let ok = false;
  await runTransaction(publicRef(roomCode), (pub) => {
    if (!pub || pub.phase !== 'finance' || pub.turnNumber !== turnNumber) return undefined;
    ok = true;
    return { ...pub, phase: 'defence' };
  });
  if (ok) await addLog(roomCode, 'Finance phase ended. Defence phase begins.');
  return { success: ok };
}

// ─── DEFENCE ACTIONS ─────────────────────────────────────────────────────────
export async function recruitUnit(roomCode, unitId, count, actionToken) {
  
  const unit = UNITS[unitId];
  if (!unit) return { success: false, error: 'Unknown unit.' };
  const cnt = parseInt(count, 10);
  if (!cnt || cnt <= 0) return { success: false, error: 'Enter a positive count.' };

  // Need finance buildings for discounts — read separately
  const finSnap = await get(financeRef(roomCode));
  const finBuildings = finSnap.val()?.buildings || {};
  const bDiscount = blacksmithDiscount(finBuildings);
  const gDiscount = granaryDiscount(finBuildings);
  const costEach = Math.max(1, unit.cost - bDiscount - gDiscount);
  const totalCost = costEach * cnt;

  let result = { success: false, error: '' };
  await runTransaction(defenceRef(roomCode), (def) => {
    if (!def) return undefined;
    if (def.lastRecruitToken === actionToken) { result={success:true,alreadyDone:true}; return def; }
    if ((def.budget||0) < totalCost) { result={success:false,error:`Need ${totalCost} budget. Have ${def.budget||0}.`}; return undefined; }
    result = { success: true };
    const unitCounts = { ...(def.unitCounts||{}) };
    unitCounts[unitId] = (unitCounts[unitId]||0) + cnt;
    return { ...def, unitCounts, budget: (def.budget||0) - totalCost, lastRecruitToken: actionToken };
  });
  if (result.success && !result.alreadyDone)
    await addLog(roomCode, `Defence recruited ${cnt}× ${unit.label} ${unit.icon} for ${totalCost} gold.`);
  return result;
}


export async function defenceEndPhase(roomCode, turnNumber) {
  let ok = false;
  await runTransaction(publicRef(roomCode), (pub) => {
    if (!pub || pub.phase !== 'defence' || pub.turnNumber !== turnNumber) return undefined;
    ok = true;
    return { ...pub, phase: 'attack' };
  });
  if (ok) {
    await addLog(roomCode, 'Defence phase ended. The enemy advances!');
    await resolveAttack(roomCode);
  }
  return { success: ok };
}

// ─── ATTACK RESOLUTION ───────────────────────────────────────────────────────
export async function resolveAttack(roomCode) {
  try {
    const [pubSnap, defSnap, finSnap] = await Promise.all([
      get(publicRef(roomCode)), get(defenceRef(roomCode)), get(financeRef(roomCode))
    ]);
    if (!pubSnap.exists()||!defSnap.exists()||!finSnap.exists()) return;
    const pub = pubSnap.val(), def = defSnap.val(), fin = finSnap.val();
    if (pub.phase !== 'attack') return;

    const turn = pub.turnNumber;
    const rawPower = calcEnemyPower(turn);

    // Firebase stores empty objects as null — always coerce to {}
    const unitCounts = def.unitCounts  && typeof def.unitCounts  === 'object' ? def.unitCounts  : {};
    const buildings  = fin.buildings   && typeof fin.buildings   === 'object' ? fin.buildings   : {};

    const battle = resolveBattle({ units: unitCounts, buildings, enemyPowerRaw: rawPower });

    // Apply unit losses — unitLosses is always a plain object from resolveBattle
    const newUnitCounts = { ...unitCounts };
    for (const [id, lost] of Object.entries(battle.unitLosses || {})) {
      newUnitCounts[id] = Math.max(0, (newUnitCounts[id]||0) - lost);
      if (newUnitCounts[id] === 0) delete newUnitCounts[id];
    }

    const newHealth = Math.max(0, Math.min(100, (pub.countryHealth||100) - battle.countryDamage + battle.heal));
    const gameOver  = newHealth <= 0;
    const gameWon   = !gameOver && turn >= WIN_TURNS;
    const nextPhase = gameOver ? 'gameover' : gameWon ? 'victory' : 'finance';
    const nextTurn  = (gameOver||gameWon) ? turn : turn + 1;

    const income       = calcIncome(buildings);
    const upkeep       = calcUpkeep(newUnitCounts);
    const newResources = Math.max(0, (fin.resources||0) + (gameOver ? 0 : income + battle.spoils - upkeep));

    // Store battle result for the modal (best-effort — don't let this block the phase update)
    try {
      await set(battleRef(roomCode), {
        turn,
        win:           battle.win,
        adjEnemy:      battle.adjEnemy,
        arrows:        battle.arrows,
        staticDef:     battle.staticDef,
        unitPower:     battle.unitPower,
        totalDef:      battle.totalDef,
        unitLosses:    battle.unitLosses || {},
        countryDamage: battle.countryDamage,
        spoils:        battle.spoils,
        heal:          battle.heal,
        income:        battle.win ? income : 0,
        upkeep,
        newHealth,
        ts: Date.now(),
      });
    } catch(e) { console.warn('Battle modal save failed (non-fatal):', e); }

    const outcome = battle.win ? '⚔️ Enemy repelled!' : '💥 Defence broken!';
    const lossStr = Object.entries(battle.unitLosses||{}).map(([id,n])=>`${n} ${id}`).join(', ') || 'none';

    try { await addLog(roomCode, `Turn ${turn} — ${outcome} Enemy: ${battle.adjEnemy}, Defence: ${battle.totalDef}. Losses: ${lossStr}.${battle.spoils>0?' Spoils: +'+battle.spoils+' gold.':''}`); }
    catch(e) { console.warn('Log write failed (non-fatal):', e); }

    if (gameOver || gameWon) {
      try { await update(metaRef(roomCode), { status: 'finished' }); } catch(e) {}
    }

    // ── THIS IS THE CRITICAL WRITE — always runs ──────────────────────────────
    // lastBattle is written as flat leaf paths inside publicState so both clients
    // receive it atomically with the phase change. Nested objects are NOT allowed
    // in Firebase multi-path update() — each field must be a scalar path.
    const updates = {
      'publicState/countryHealth':            newHealth,
      'publicState/phase':                    nextPhase,
      'publicState/turnNumber':               nextTurn,
      'publicState/lastEnemyPower':           rawPower,
      'publicState/lastBattle/turn':          turn,
      'publicState/lastBattle/win':           battle.win,
      'publicState/lastBattle/adjEnemy':      battle.adjEnemy,
      'publicState/lastBattle/arrows':        battle.arrows,
      'publicState/lastBattle/staticDef':     battle.staticDef,
      'publicState/lastBattle/unitPower':     battle.unitPower,
      'publicState/lastBattle/totalDef':      battle.totalDef,
      'publicState/lastBattle/countryDamage': battle.countryDamage,
      'publicState/lastBattle/spoils':        battle.spoils,
      'publicState/lastBattle/heal':          battle.heal,
      'publicState/lastBattle/income':        battle.win ? income : 0,
      'publicState/lastBattle/upkeep':        upkeep,
      'publicState/lastBattle/newHealth':     newHealth,
      'publicState/lastBattle/ts':            Date.now(),
      'private/defence/unitCounts': Object.keys(newUnitCounts).length > 0 ? newUnitCounts : null,
      'private/defence/budget':     0,
    };
    // unitLosses is itself an object — each entry needs its own flat path
    const losses = battle.unitLosses || {};
    if (Object.keys(losses).length > 0) {
      Object.entries(losses).forEach(([id, n]) => { updates[`publicState/lastBattle/unitLosses/${id}`] = n; });
    } else {
      updates['publicState/lastBattle/unitLosses'] = null;
    }
    if (!gameOver && !gameWon) {
      updates['private/finance/resources'] = newResources;
    }
    await update(ref(db, `rooms/${roomCode}`), updates);
    // ─────────────────────────────────────────────────────────────────────────

    if (!gameOver && !gameWon) {
      try {
        if (income > 0 || battle.spoils > 0 || upkeep > 0)
          await addLog(roomCode, `Turn ${nextTurn} starts — Income: +${income}${battle.spoils>0?' Spoils: +'+battle.spoils:''}${upkeep>0?' Upkeep: −'+upkeep:''} = net +${income+battle.spoils-upkeep} gold.`);
      } catch(e) {}
    }

  } catch (err) {
    // Last-resort safety net: if anything above threw, force the phase out of 'attack'
    // so the game is never permanently stuck.
    console.error('resolveAttack crashed — forcing phase to finance:', err);
    try {
      await update(ref(db, `rooms/${roomCode}`), {
        'publicState/phase': 'finance',
        'private/defence/budget': 0,
      });
      await addLog(roomCode, '⚠️ Battle resolution error. Turn advanced automatically.');
    } catch (e2) {
      console.error('Emergency phase reset also failed:', e2);
    }
  }
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
export async function addLog(roomCode, message) {
  await push(logRef(roomCode), { message, ts: Date.now() });
}

// ─── SUBSCRIPTIONS ───────────────────────────────────────────────────────────
export function subscribePublicState(r, cb) { const x=publicRef(r); onValue(x,s=>cb(s.val())); return ()=>off(x); }
export function subscribeMeta(r, cb)        { const x=metaRef(r);   onValue(x,s=>cb(s.val())); return ()=>off(x); }
export function subscribePlayers(r, cb)     { const x=playersRef(r); onValue(x,s=>cb(s.val()||{})); return ()=>off(x); }
export function subscribeFinance(r, cb)     { const x=financeRef(r); onValue(x,s=>cb(s.val())); return ()=>off(x); }
export function subscribeDefence(r, cb)     { const x=defenceRef(r); onValue(x,s=>cb(s.val())); return ()=>off(x); }
export function subscribeBattle(r, cb)      { const x=battleRef(r);  onValue(x,s=>cb(s.val())); return ()=>off(x); }
export function subscribeLog(r, cb) {
  const x = logRef(r);
  onValue(x, s => {
    const raw = s.val()||{};
    cb(Object.values(raw).sort((a,b)=>a.ts-b.ts).slice(-25));
  });
  return () => off(x);
}

// ─── INITIAL STATE ────────────────────────────────────────────────────────────
function buildInitialPublic() {
  return { turnNumber:1, phase:'finance', countryHealth:100, lastEnemyPower:0 };
}
function buildInitialFinance() {
  return { resources:200, buildings:{ farm:1, city:1 }, lastBuildToken:null, lastTransferToken:null };
}
function buildInitialDefence() {
  return { unitCounts:{ infantry:5, militia:10 }, budget:0, lastRecruitToken:null };
}

function cap(s) { return s.charAt(0).toUpperCase()+s.slice(1); }