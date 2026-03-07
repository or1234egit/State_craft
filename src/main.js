// src/main.js — v2
// Orchestrates app lifecycle, subscriptions, and action routing.

import {
  createRoom, joinRoom, claimRole, getMyRole,
  buildBuilding, transferResources, financeEndPhase,
  recruitUnit, deployUnit, recallUnit, defenceEndPhase,
  subscribePublicState, subscribeMeta, subscribePlayers,
  subscribeFinance, subscribeDefence, subscribeLog, subscribeBattle,
} from './firebase.js';

import {
  renderHome, renderRoleSelect, renderWaiting, renderGameLayout,
  renderGameOver, showHomeError, showRoleError, showFeedback,
  renderAttackOverlay, removeAttackOverlay, showExitConfirm, renderBattleModal,
  resetMapInit,
} from './ui.js';

import { newToken } from './game.js';

// ─── SESSION ──────────────────────────────────────────────────────────────────
function getSessionId() {
  let id = localStorage.getItem('sc_session');
  if (!id) { id='sess_'+Math.random().toString(36).slice(2,12); localStorage.setItem('sc_session',id); }
  return id;
}
function saveSession(room, role) {
  localStorage.setItem('sc_room', room);
  localStorage.setItem('sc_role', role||'');
}
function loadSession() {
  return { roomCode: localStorage.getItem('sc_room'), role: localStorage.getItem('sc_role') };
}
function clearSession() {
  localStorage.removeItem('sc_room');
  localStorage.removeItem('sc_role');
}

const SESSION_ID = getSessionId();

// ─── STATE ────────────────────────────────────────────────────────────────────
let state = {
  roomCode:null, myRole:null,
  meta:null, players:{},
  publicState:null, financeState:null, defenceState:null,
  logEntries:[], lastBattle:null,
};
const unsubs = [];
function unsubAll() { unsubs.forEach(fn=>fn()); unsubs.length=0; }

// ─── BOOT ─────────────────────────────────────────────────────────────────────
async function boot() {
  const { roomCode, role } = loadSession();
  if (roomCode) {
    const res = await joinRoom(roomCode);
    if (res.success) {
      state.roomCode = roomCode;
      if (role) {
        const existing = await getMyRole(roomCode, SESSION_ID);
        if (existing === role) { state.myRole=role; enterRoom(roomCode, role); return; }
      }
      enterRoomNoRole(roomCode); return;
    }
    clearSession();
  }
  renderHome({ onCreateRoom: handleCreateRoom, onJoinRoom: handleJoinRoom });
}

// ─── HOME ─────────────────────────────────────────────────────────────────────
async function handleCreateRoom(code) {
  const res = await createRoom(code, SESSION_ID);
  if (!res.success) { showHomeError('create', res.error); return; }
  state.roomCode = code;
  saveSession(code, '');
  enterRoomNoRole(code);
}
async function handleJoinRoom(code) {
  const res = await joinRoom(code);
  if (!res.success) { showHomeError('join', res.error); return; }
  state.roomCode = code;
  saveSession(code, '');
  enterRoomNoRole(code);
}

// ─── ROLE SELECT ──────────────────────────────────────────────────────────────
function enterRoomNoRole(roomCode) {
  unsubAll();
  const u = subscribePlayers(roomCode, (players) => {
    state.players = players;
    const mine = players[SESSION_ID];
    if (mine?.role) {
      state.myRole = mine.role;
      saveSession(roomCode, mine.role);
      enterRoom(roomCode, mine.role);
      return;
    }
    renderRoleSelect({ roomCode, players, onClaimRole: handleClaimRole });
  });
  unsubs.push(u);
}
async function handleClaimRole(role) {
  const res = await claimRole(state.roomCode, role, SESSION_ID);
  if (!res.success) showRoleError(res.error);
}

// ─── GAME SUBSCRIPTIONS ───────────────────────────────────────────────────────
function enterRoom(roomCode, myRole) {
  unsubAll();
  state.roomCode = roomCode;
  state.myRole   = myRole;

  unsubs.push(subscribeMeta(roomCode,        m  => { state.meta=m;            handleStateChange(); }));
  unsubs.push(subscribePlayers(roomCode,     p  => { state.players=p;         handleStateChange(); }));
  unsubs.push(subscribePublicState(roomCode, pub=> { state.publicState=pub;
    if (pub?.phase==='attack') renderAttackOverlay();
    else removeAttackOverlay();
    handleStateChange();
  }));
  unsubs.push(subscribeFinance(roomCode,     fin=> { state.financeState=fin;  handleStateChange(); }));
  unsubs.push(subscribeDefence(roomCode,     def=> { state.defenceState=def;  handleStateChange(); }));
  unsubs.push(subscribeLog(roomCode,         log=> { state.logEntries=log;    handleStateChange(); }));
  unsubs.push(subscribeBattle(roomCode,      b  => {
    state.lastBattle = b;
    // Show battle modal once when a new battle result arrives and phase has moved on
    if (b && state.publicState?.phase !== 'attack') {
      renderBattleModal(b, null);
    }
  }));
}

// ─── STATE → SCREEN ───────────────────────────────────────────────────────────
function handleStateChange() {
  const { meta, players, publicState, financeState, defenceState, logEntries, myRole, roomCode } = state;
  if (!meta) return;

  const bothJoined = Object.values(players).some(p=>p.role==='finance') &&
                     Object.values(players).some(p=>p.role==='defence');

  if (!bothJoined || meta.status==='waiting') {
    renderWaiting({ roomCode, myRole, players, onExit: handleExitRequest });
    return;
  }

  const phase = publicState?.phase;
  if (phase==='gameover' || phase==='victory' || meta.status==='finished') {
    renderGameOver({
      publicState, financeState, defenceState, myRole,
      won: phase==='victory',
      onNewGame: handleNewGame,
    });
    return;
  }

  renderGameLayout({
    myRole, roomCode, publicState, financeState, defenceState, logEntries,
    onAction: handleAction,
    onExit:   handleExitRequest,
  });
}

// ─── ACTIONS ─────────────────────────────────────────────────────────────────
async function handleAction(type, payload) {
  const { roomCode, publicState } = state;
  let result;

  switch (type) {
    case 'build':      result = await buildBuilding(roomCode, payload.id, newToken()); break;
    case 'transfer':   result = await transferResources(roomCode, payload.amount, newToken()); break;
    case 'financeEnd': result = await financeEndPhase(roomCode, publicState.turnNumber); break;
    case 'recruit':    result = await recruitUnit(roomCode, payload.id, payload.count, newToken()); break;
    case 'deploy':     result = await deployUnit(roomCode, payload.id, payload.count, newToken()); break;
    case 'recall':     result = await recallUnit(roomCode, payload.id, payload.count, newToken()); break;
    case 'defenceEnd': result = await defenceEndPhase(roomCode, publicState.turnNumber); break;
    default: return;
  }

  if (result && !result.success)           showFeedback(result.error, true);
  else if (result?.success && !result?.alreadyDone) showFeedback('✓', false);
}

// ─── EXIT ─────────────────────────────────────────────────────────────────────
function handleExitRequest() {
  showExitConfirm(() => handleNewGame());
}
function handleNewGame() {
  unsubAll();
  clearSession();
  resetMapInit();
  state = { roomCode:null, myRole:null, meta:null, players:{},
            publicState:null, financeState:null, defenceState:null,
            logEntries:[], lastBattle:null };
  renderHome({ onCreateRoom: handleCreateRoom, onJoinRoom: handleJoinRoom });
}

boot();