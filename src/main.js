// src/main.js
// Orchestrates the application lifecycle:
//  - Manages local session state (sessionId, roomCode, role)
//  - Subscribes to Firebase and re-renders on change
//  - Routes actions to firebase.js
//  - Reconnects correctly on page refresh

import {
  createRoom,
  joinRoom,
  claimRole,
  getMyRole,
  buildCity,
  transferResources,
  recruitSoldiers,
  deploySoldiers,
  financeEndPhase,
  defenceEndPhase,
  subscribePublicState,
  subscribeMeta,
  subscribePlayers,
  subscribeFinance,
  subscribeDefence,
  subscribeLog,
  resolveAttack,
} from './firebase.js';

import {
  renderHome,
  renderRoleSelect,
  renderWaiting,
  renderGameLayout,
  renderGameOver,
  showHomeError,
  showRoleError,
  showFeedback,
  renderAttackOverlay,
  removeAttackOverlay,
  showExitConfirm,
} from './ui.js';

import { newToken } from './game.js';

// ─── SESSION PERSISTENCE ──────────────────────────────────────────────────────

function getSessionId() {
  let id = localStorage.getItem('statecraft_session');
  if (!id) {
    id = 'sess_' + Math.random().toString(36).slice(2, 12);
    localStorage.setItem('statecraft_session', id);
  }
  return id;
}

function saveRoomSession(roomCode, role) {
  localStorage.setItem('statecraft_room', roomCode);
  localStorage.setItem('statecraft_role', role || '');
}

function loadRoomSession() {
  return {
    roomCode: localStorage.getItem('statecraft_room') || null,
    role: localStorage.getItem('statecraft_role') || null,
  };
}

function clearRoomSession() {
  localStorage.removeItem('statecraft_room');
  localStorage.removeItem('statecraft_role');
}

// ─── APPLICATION STATE ────────────────────────────────────────────────────────

const SESSION_ID = getSessionId();

// Live state from Firebase subscriptions
let state = {
  screen: 'home',      // home | role | waiting | game | gameover
  roomCode: null,
  myRole: null,
  meta: null,
  players: {},
  publicState: null,
  financeState: null,
  defenceState: null,
  logEntries: [],
};

// Cleanup functions for active subscriptions
const unsubscribers = [];

function unsubAll() {
  unsubscribers.forEach((fn) => fn());
  unsubscribers.length = 0;
}

// ─── BOOT ─────────────────────────────────────────────────────────────────────

async function boot() {
  const { roomCode, role } = loadRoomSession();

  if (roomCode) {
    // Try to reconnect to saved room
    const result = await joinRoom(roomCode);
    if (result.success) {
      state.roomCode = roomCode;
      if (role) {
        // Verify role is still ours in Firebase
        const existingRole = await getMyRole(roomCode, SESSION_ID);
        if (existingRole === role) {
          state.myRole = role;
          enterRoom(roomCode, role);
          return;
        }
      }
      // Room exists but no confirmed role — go to role select
      enterRoomNoRole(roomCode);
      return;
    }
    // Saved room no longer valid
    clearRoomSession();
  }

  renderHome({ onCreateRoom: handleCreateRoom, onJoinRoom: handleJoinRoom });
}

// ─── HOME ACTIONS ─────────────────────────────────────────────────────────────

async function handleCreateRoom(code) {
  const result = await createRoom(code, SESSION_ID);
  if (!result.success) {
    showHomeError('create', result.error);
    return;
  }
  state.roomCode = code;
  saveRoomSession(code, '');
  enterRoomNoRole(code);
}

async function handleJoinRoom(code) {
  const result = await joinRoom(code);
  if (!result.success) {
    showHomeError('join', result.error);
    return;
  }
  state.roomCode = code;
  saveRoomSession(code, '');
  enterRoomNoRole(code);
}

// ─── ROLE SELECTION ───────────────────────────────────────────────────────────

function enterRoomNoRole(roomCode) {
  unsubAll();

  // Subscribe to players to update role UI in real time
  const unsubPlayers = subscribePlayers(roomCode, (players) => {
    state.players = players;
    // If this session now has a role in Firebase, advance
    const myEntry = players[SESSION_ID];
    if (myEntry?.role) {
      state.myRole = myEntry.role;
      saveRoomSession(roomCode, myEntry.role);
      enterRoom(roomCode, myEntry.role);
      return;
    }
    renderRoleSelect({
      roomCode,
      players,
      onClaimRole: handleClaimRole,
    });
  });
  unsubscribers.push(unsubPlayers);
}

async function handleClaimRole(role) {
  const result = await claimRole(state.roomCode, role, SESSION_ID);
  if (!result.success) {
    showRoleError(result.error);
  }
  // On success, the players subscription fires and enterRoom is called
}

// ─── GAME SUBSCRIPTIONS ───────────────────────────────────────────────────────

function enterRoom(roomCode, myRole) {
  unsubAll();
  state.roomCode = roomCode;
  state.myRole = myRole;

  const unsubMeta = subscribeMeta(roomCode, (meta) => {
    state.meta = meta;
    handleStateChange();
  });

  const unsubPlayers = subscribePlayers(roomCode, (players) => {
    state.players = players;
    handleStateChange();
  });

  const unsubPub = subscribePublicState(roomCode, (pub) => {
    state.publicState = pub;
    handleStateChange();

    // If phase just became 'attack', render the attack overlay
    if (pub?.phase === 'attack') {
      renderAttackOverlay();
    } else {
      removeAttackOverlay();
    }
  });

  const unsubFin = subscribeFinance(roomCode, (fin) => {
    state.financeState = fin;
    handleStateChange();
  });

  const unsubDef = subscribeDefence(roomCode, (def) => {
    state.defenceState = def;
    handleStateChange();
  });

  const unsubLog = subscribeLog(roomCode, (entries) => {
    state.logEntries = entries;
    handleStateChange();
  });

  unsubscribers.push(unsubMeta, unsubPlayers, unsubPub, unsubFin, unsubDef, unsubLog);
}

// ─── STATE → SCREEN ───────────────────────────────────────────────────────────

function handleStateChange() {
  const { meta, players, publicState, financeState, defenceState, logEntries, myRole, roomCode } = state;

  if (!meta) return;

  // Waiting for partner
  const bothJoined = Object.values(players).some((p) => p.role === 'finance') &&
                     Object.values(players).some((p) => p.role === 'defence');

  if (meta.status === 'waiting' || !bothJoined) {
    renderWaiting({ roomCode, myRole, players, onExit: handleExitRequest });
    return;
  }

  if (meta.status === 'finished' || publicState?.phase === 'gameover') {
    renderGameOver({
      publicState,
      financeState,
      defenceState,
      myRole,
      onNewGame: handleNewGame,
    });
    return;
  }

  // Main game
  renderGameLayout({
    myRole,
    roomCode,
    publicState,
    financeState,
    defenceState,
    logEntries,
    onAction: handleAction,
    onExit: handleExitRequest,
  });
}

// ─── GAME ACTIONS ─────────────────────────────────────────────────────────────

async function handleAction(actionType, payload) {
  const { roomCode, publicState } = state;
  let result;

  switch (actionType) {
    case 'buildCity':
      result = await buildCity(roomCode, newToken());
      break;

    case 'transfer':
      result = await transferResources(roomCode, payload.amount, newToken());
      break;

    case 'financeEnd':
      result = await financeEndPhase(roomCode, publicState.turnNumber);
      break;

    case 'recruit':
      result = await recruitSoldiers(roomCode, payload.count, newToken());
      break;

    case 'deploy':
      result = await deploySoldiers(roomCode, payload.count, newToken());
      break;

    case 'defenceEnd':
      result = await defenceEndPhase(roomCode, publicState.turnNumber);
      break;

    default:
      return;
  }

  if (result && !result.success) {
    showFeedback(result.error, true);
  } else if (result?.success && !result?.alreadyDone) {
    showFeedback('✓', false);
  }
}

// ─── EXIT TO HOME (with confirmation) ────────────────────────────────────────

function handleExitRequest() {
  showExitConfirm(() => {
    handleNewGame();
  });
}

// ─── NEW GAME ─────────────────────────────────────────────────────────────────

function handleNewGame() {
  unsubAll();
  clearRoomSession();
  state = {
    screen: 'home',
    roomCode: null,
    myRole: null,
    meta: null,
    players: {},
    publicState: null,
    financeState: null,
    defenceState: null,
    logEntries: [],
  };
  renderHome({ onCreateRoom: handleCreateRoom, onJoinRoom: handleJoinRoom });
}

// ─── START ────────────────────────────────────────────────────────────────────

boot();
