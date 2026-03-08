// src/ui.js — v3
// All DOM rendering. No Firebase. Calls map.js for the world view.

import { phaseName, phaseDescription, isMyPhase, threatLevel, threatClass,
         estimateEnemyPower, treasuryHint, armyHint, calcIncome, calcStaticDefence,
         calcDeployedPower, calcUpkeep, blacksmithDiscount, granaryDiscount,
         BUILDINGS, UNITS, WIN_TURNS,
         unlockedBuildings, unlockedUnits, nextUnlockBuilding, nextUnlockUnit,
         BUILDING_UNLOCK_TURN, UNIT_UNLOCK_TURN } from './game.js';
import { initMap, renderMap, renderBattleModal } from './map.js';

const app = document.getElementById('app');

// ─── HOME ─────────────────────────────────────────────────────────────────────
export function renderHome({ onCreateRoom, onJoinRoom }) {
  app.innerHTML = `
    <div class="screen screen-home">
      <header class="home-header">
        <h1 class="game-title">StateCraft</h1>
        <p class="game-subtitle">A two-minister cooperative strategy</p>
      </header>
      <div class="home-cards">
        <div class="card">
          <h2>Create Game</h2>
          <p>Start a room and share the code with your partner.</p>
          <div class="input-row">
            <input id="create-code" type="text" maxlength="8" placeholder="Room code e.g. CASTLE" autocomplete="off"/>
            <button id="btn-create" class="btn btn-primary">Create</button>
          </div>
          <div id="create-error" class="error-msg"></div>
        </div>
        <div class="divider-or">or</div>
        <div class="card">
          <h2>Join Game</h2>
          <p>Enter the room code your partner shared.</p>
          <div class="input-row">
            <input id="join-code" type="text" maxlength="8" placeholder="Room code" autocomplete="off"/>
            <button id="btn-join" class="btn btn-secondary">Join</button>
          </div>
          <div id="join-error" class="error-msg"></div>
        </div>
      </div>
      <div class="how-to-play">
        <h3>How to Play</h3>
        <div class="roles-grid">
          <div class="role-card finance-role">
            <div class="role-icon">💰</div>
            <h4>Minister of Finance</h4>
            <p>Build farms, markets, cities and fortifications. Transfer gold to Defence. Score: buildings built.</p>
          </div>
          <div class="role-card defence-role">
            <div class="role-icon">⚔️</div>
            <h4>Minister of Defence</h4>
            <p>Recruit soldiers — they fight automatically. Score: soldiers surviving.</p>
          </div>
        </div>
        <p class="goal-text">Together, survive ${WIN_TURNS} turns to win. The enemy grows stronger every turn.</p>
      </div>
    </div>`;

  document.getElementById('btn-create').addEventListener('click', () => {
    const code = document.getElementById('create-code').value.trim().toUpperCase();
    if (!code) { document.getElementById('create-error').textContent='Enter a room code.'; return; }
    document.getElementById('create-error').textContent='';
    onCreateRoom(code);
  });
  document.getElementById('btn-join').addEventListener('click', () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) { document.getElementById('join-error').textContent='Enter a room code.'; return; }
    document.getElementById('join-error').textContent='';
    onJoinRoom(code);
  });
  ['create-code','join-code'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key==='Enter') document.getElementById(id==='create-code'?'btn-create':'btn-join').click();
    });
  });
}
export function showHomeError(side, msg) {
  const el = document.getElementById(`${side}-error`);
  if (el) el.textContent = msg;
}

// ─── ROLE SELECT ──────────────────────────────────────────────────────────────
export function renderRoleSelect({ roomCode, players, onClaimRole }) {
  const finTaken = Object.values(players).some(p=>p.role==='finance');
  const defTaken = Object.values(players).some(p=>p.role==='defence');
  app.innerHTML = `
    <div class="screen screen-role">
      <div class="room-badge">Room: <strong>${roomCode}</strong></div>
      <h2>Choose Your Role</h2>
      <p class="waiting-note">One player must be Finance, the other Defence.</p>
      <div class="role-pick-grid">
        <button id="pick-finance" class="role-btn finance-role ${finTaken?'role-taken':''}" ${finTaken?'disabled':''}>
          <div class="role-icon">💰</div><h3>Minister of Finance</h3>
          <p>Build the economy and fund the military.</p>
          ${finTaken?'<span class="taken-badge">Taken</span>':''}
        </button>
        <button id="pick-defence" class="role-btn defence-role ${defTaken?'role-taken':''}" ${defTaken?'disabled':''}>
          <div class="role-icon">⚔️</div><h3>Minister of Defence</h3>
          <p>Recruit soldiers — they fight automatically.</p>
          ${defTaken?'<span class="taken-badge">Taken</span>':''}
        </button>
      </div>
      <div id="role-error" class="error-msg"></div>
    </div>`;
  if (!finTaken) document.getElementById('pick-finance').addEventListener('click',()=>onClaimRole('finance'));
  if (!defTaken) document.getElementById('pick-defence').addEventListener('click',()=>onClaimRole('defence'));
}
export function showRoleError(msg) { const el=document.getElementById('role-error'); if(el) el.textContent=msg; }

// ─── WAITING ─────────────────────────────────────────────────────────────────
export function renderWaiting({ roomCode, myRole, players, onExit }) {
  const partner = myRole==='finance'?'Minister of Defence':'Minister of Finance';
  app.innerHTML = `
    <div class="screen screen-waiting">
      <div class="room-badge">Room: <strong>${roomCode}</strong></div>
      <div class="waiting-content">
        <div class="spinner"></div>
        <h2>Waiting for your partner…</h2>
        <p>You are the <strong>${myRole==='finance'?'Minister of Finance 💰':'Minister of Defence ⚔️'}</strong></p>
        <p>Share the room code so they can join as <strong>${partner}</strong>.</p>
        <div class="share-code">${roomCode}</div>
        <div class="waiting-actions">
          <button class="btn btn-ghost" id="copy-btn">Copy Room Code</button>
          <button class="btn btn-exit-home" id="btn-exit-waiting">✕ Exit</button>
        </div>
      </div>
    </div>`;
  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(()=>{
      document.getElementById('copy-btn').textContent='Copied!';
      setTimeout(()=>{ const b=document.getElementById('copy-btn'); if(b) b.textContent='Copy Room Code'; },2000);
    });
  });
  if (onExit) document.getElementById('btn-exit-waiting').addEventListener('click', onExit);
}

// ─── GAME LAYOUT (split: left=map, right=panels) ─────────────────────────────
// Skeleton is created ONCE. Subsequent calls only update inner panels so scroll
// position and the canvas element are never destroyed.
let mapInitialized   = false;
let gameLayoutCreated = false;

export function renderGameLayout({ myRole, roomCode, publicState, financeState, defenceState, logEntries, onAction, onExit }) {
  const phase  = publicState?.phase || 'finance';
  const turn   = publicState?.turnNumber || 1;
  const myTurn = isMyPhase(phase, myRole);

  // Build skeleton exactly once per game session
  if (!gameLayoutCreated || !document.getElementById('map-panel')) {
    app.innerHTML = `
      <div class="game-layout">
        <div class="map-panel" id="map-panel"></div>
        <div class="game-right">
          <div id="shared-panel-wrap"></div>
          <div id="role-panel"></div>
          <div id="log-panel-wrap"></div>
        </div>
      </div>`;
    gameLayoutCreated = true;
    const mapContainer = document.getElementById('map-panel');
    if (!mapInitialized) { initMap(mapContainer); mapInitialized = true; }
  }

  // Surgical updates — only inner HTML of each panel changes
  document.getElementById('shared-panel-wrap').innerHTML =
    renderSharedPanel(publicState, financeState, defenceState, roomCode, myRole, onExit);

  // Preserve scroll position in the role panel (shop area)
  const rolePanel   = document.getElementById('role-panel');
  const prevScroll  = rolePanel.scrollTop;
  rolePanel.innerHTML = myRole === 'finance'
    ? renderFinancePanel(financeState, defenceState, publicState, myTurn)
    : renderDefencePanel(defenceState, financeState, publicState, myTurn);
  rolePanel.scrollTop = prevScroll;

  document.getElementById('log-panel-wrap').innerHTML = renderLog(logEntries);

  // Map render
  const mapContainer = document.getElementById('map-panel');
  if (mapContainer) {
    renderMap(mapContainer, {
      buildings:  financeState?.buildings  || {},
      unitCounts: defenceState?.unitCounts || {},
      phase, turn,
    });
  }

  attachGameHandlers(myRole, publicState, financeState, onAction);
  attachEl('btn-exit-game', 'click', onExit);
}

export function resetMapInit() { mapInitialized = false; gameLayoutCreated = false; }

// ─── FINANCE PANEL ───────────────────────────────────────────────────────────
function renderFinancePanel(fin, def, pub, myTurn) {
  if (!fin || !pub) return '<div class="card">Loading…</div>';
  const phase     = pub.phase;
  const turn      = pub.turnNumber || 1;
  const dis       = !myTurn || phase !== 'finance';
  const da        = dis ? 'disabled' : '';
  const income    = calcIncome(fin.buildings || {});
  const discount  = blacksmithDiscount(fin.buildings || {});
  const buildings = fin.buildings || {};
  const armyPow   = calcDeployedPower(def?.unitCounts || {}, fin.buildings || {});
  const available = unlockedBuildings(turn);
  const nextBld   = nextUnlockBuilding(turn);

  const buildingRows = available.map(b => {
    const owned  = buildings[b.id] || 0;
    const cost   = Math.max(0, b.cost - discount);
    const canBuy = !dis && fin.resources >= cost;
    return `
      <div class="shop-row">
        <div class="shop-icon-wrap">${b.icon}</div>
        <div class="shop-info">
          <div class="shop-label">${b.label} ${owned > 0 ? `<span class="shop-owned">×${owned}</span>` : ''}</div>
          <div class="shop-desc">${b.desc}</div>
        </div>
        <button class="btn btn-shop ${canBuy ? '' : 'disabled-shop'}" data-action="build" data-id="${b.id}" ${canBuy ? '' : 'disabled'}>
          ${cost}💰
        </button>
      </div>`;
  }).join('');

  const nextHint = nextBld
    ? `<div class="unlock-hint">🔒 ${nextBld.icon} ${nextBld.label} unlocks turn ${BUILDING_UNLOCK_TURN[nextBld.id]}</div>`
    : '';

  return `
    <div class="card role-card-active finance-role">
      <div class="panel-header">
        <span class="role-icon">💰</span><h2>Minister of Finance</h2>
        ${myTurn ? '<span class="your-turn-badge">Your Turn</span>' : ''}
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Treasury</div><div class="stat-value gold">${fin.resources}</div></div>
        <div class="stat"><div class="stat-label">Income/Turn</div><div class="stat-value green">+${income}</div></div>
        <div class="stat"><div class="stat-label">Army Status</div><div class="stat-value hint">${armyHint(armyPow)}</div></div>
        ${discount > 0 ? `<div class="stat"><div class="stat-label">Discount</div><div class="stat-value green">−${discount}</div></div>` : ''}
      </div>
      <div class="action-section">
        <h3>Build</h3>
        <div class="shop-list">${buildingRows}</div>
        ${nextHint}
        <div class="action-row transfer-row">
          <input type="number" id="transfer-amount" min="1" placeholder="Gold" class="num-input" ${da}/>
          <button id="btn-transfer" class="btn btn-secondary" ${da}>Transfer to Defence</button>
        </div>
        <button id="btn-finance-end" class="btn btn-end" ${dis ? 'disabled' : ''}>End Finance Phase →</button>
      </div>
      <div id="action-feedback" class="action-feedback"></div>
    </div>`;
}

// ─── DEFENCE PANEL ───────────────────────────────────────────────────────────
function renderDefencePanel(def, fin, pub, myTurn) {
  if (!def || !pub) return '<div class="card">Loading…</div>';
  const phase     = pub.phase;
  const turn      = pub.turnNumber || 1;
  const dis       = !myTurn || phase !== 'defence';
  const da        = dis ? 'disabled' : '';
  const budget    = def.budget || 0;
  const units     = def.unitCounts || {};
  const finBld    = fin?.buildings || {};
  const bDisc     = blacksmithDiscount(finBld);
  const gDisc     = granaryDiscount(finBld);
  const totalDisc = bDisc + gDisc;
  const upkeep    = calcUpkeep(units);
  const defPow    = calcDeployedPower(units, finBld);
  const staticD   = calcStaticDefence(finBld);
  const totalDef  = defPow + staticD;
  const available = unlockedUnits(turn);
  const nextUnit  = nextUnlockUnit(turn);

  // Army summary — all recruited units fight automatically, no separate deploy step
  const unitSummary = Object.entries(units).filter(([,n]) => n > 0).map(([id, n]) => {
    const u = UNITS[id];
    return `
      <div class="unit-row">
        <span class="unit-icon">${u.icon}</span>
        <div class="unit-info">
          <span class="unit-label">${u.label}</span>
          <span class="unit-count">${n} deployed · ${u.power * n} power</span>
        </div>
      </div>`;
  }).join('') || '<div class="muted-text">No units yet. Recruit some below.</div>';

  // Recruit shop — hover for tooltip, qty input updates cost live
  const recruitRows = available.map(u => {
    const cost   = Math.max(1, u.cost - totalDisc);
    const canBuy = !dis && budget >= cost;
    return `
      <div class="shop-row">
        <div class="shop-icon-wrap">${u.icon}</div>
        <div class="shop-info">
          <div class="shop-label">${u.label} ${u.upkeep > 0 ? `<span class="upkeep-badge">upkeep ${u.upkeep}/turn</span>` : ''}</div>
          <div class="shop-desc">${u.desc}</div>
        </div>
        <div class="shop-right">
          <input type="number" min="1" value="1" class="num-input-tiny" id="recruit-count-${u.id}" ${da}/>
          <button class="btn btn-shop ${canBuy ? '' : 'disabled-shop'}"
                  data-action="recruit" data-id="${u.id}" data-basecost="${cost}"
                  ${canBuy ? '' : 'disabled'}>
            ${cost}💰
          </button>
        </div>
      </div>`;
  }).join('');

  const nextHint = nextUnit
    ? `<div class="unlock-hint">🔒 ${nextUnit.icon} ${nextUnit.label} unlocks turn ${UNIT_UNLOCK_TURN[nextUnit.id]}</div>`
    : '';

  return `
    <div class="card role-card-active defence-role">
      <div class="panel-header">
        <span class="role-icon">⚔️</span><h2>Minister of Defence</h2>
        ${myTurn ? '<span class="your-turn-badge">Your Turn</span>' : ''}
      </div>
      <div class="stat-grid">
        <div class="stat"><div class="stat-label">Budget</div><div class="stat-value gold">${budget}</div></div>
        <div class="stat"><div class="stat-label">Army Power</div><div class="stat-value green">${defPow}</div></div>
        <div class="stat"><div class="stat-label">+Structures</div><div class="stat-value">${staticD}</div></div>
        <div class="stat"><div class="stat-label">Total Defence</div><div class="stat-value">${totalDef}</div></div>
        ${upkeep > 0 ? `<div class="stat"><div class="stat-label">Upkeep</div><div class="stat-value red">${upkeep}/turn</div></div>` : ''}
        ${totalDisc > 0 ? `<div class="stat"><div class="stat-label">Discount</div><div class="stat-value green">−${totalDisc}</div></div>` : ''}
        <div class="stat"><div class="stat-label">Treasury</div><div class="stat-value hint">${treasuryHint(fin?.resources || 0)}</div></div>
      </div>
      <div class="action-section">
        <h3>Army</h3>
        <div class="unit-list">${unitSummary}</div>
        <h3>Recruit</h3>
        <div class="shop-list">${recruitRows}</div>
        ${nextHint}
        <button id="btn-defence-end" class="btn btn-end" ${dis ? 'disabled' : ''}>End Defence Phase →</button>
      </div>
      <div id="action-feedback" class="action-feedback"></div>
    </div>`;
}

// ─── SHARED PANEL ─────────────────────────────────────────────────────────────
function renderSharedPanel(pub, fin, def, roomCode, myRole, onExit) {
  if (!pub) return '';
  const phase    = pub.phase;
  const turn     = pub.turnNumber;
  const health   = pub.countryHealth;
  const { min, max } = estimateEnemyPower(turn);
  const tLevel   = threatLevel(turn);
  const tClass   = threatClass(turn);
  const hClass   = health>60?'health-high':health>30?'health-mid':'health-low';
  const desc     = phaseDescription(phase, myRole);
  const progress = Math.round((turn/WIN_TURNS)*100);

  return `
    <div class="card shared-panel">
      <div class="shared-header">
        <div class="room-code-badge">🏰 ${roomCode}</div>
        <div class="shared-header-right">
          <div class="turn-badge">Turn ${turn}/${WIN_TURNS}</div>
          <button id="btn-exit-game" class="btn btn-exit-home" title="Exit">✕ Exit</button>
        </div>
      </div>
      <div class="win-progress">
        <div class="win-track"><div class="win-fill" style="width:${progress}%"></div></div>
        <div class="win-label">${WIN_TURNS-turn} turns until victory</div>
      </div>
      <div class="phase-block">
        <div class="phase-name">${phaseName(phase)}</div>
        <div class="phase-desc">${desc}</div>
      </div>
      <div class="country-health-section">
        <div class="health-label">Country Health</div>
        <div class="health-bar-wrap"><div class="health-bar ${hClass}" style="width:${health}%"></div></div>
        <div class="health-value">${health}/100</div>
      </div>
      <div class="threat-section ${tClass}">
        <span class="threat-label">⚠️ Next Wave</span>
        <span class="threat-value">${tLevel}</span>
        <span class="threat-range">(est. ${min}–${max})</span>
      </div>
    </div>`;
}

// ─── LOG ─────────────────────────────────────────────────────────────────────
function renderLog(entries) {
  const items = (entries||[]).slice().reverse()
    .map(e=>`<li class="log-entry">${e.message}</li>`).join('');
  return `
    <div class="card log-panel">
      <h3 class="log-title">Event Log</h3>
      <ul class="log-list">${items||'<li class="log-entry muted">No events yet.</li>'}</ul>
    </div>`;
}

// ─── GAME OVER / VICTORY ──────────────────────────────────────────────────────
export function renderGameOver({ publicState, financeState, defenceState, myRole, won, onNewGame }) {
  const turns    = (publicState?.turnNumber||1) - 1;
  const buildings= financeState?.buildings||{};
  const bCount   = Object.values(buildings).reduce((a,b)=>a+b,0);
  const uCount   = Object.values(defenceState?.unitCounts||{}).reduce((a,b)=>a+b,0);

  app.innerHTML = `
    <div class="screen screen-gameover">
      <div class="gameover-header">
        <div class="gameover-icon">${won?'🏆':'🏴'}</div>
        <h1>${won?'The Realm Stands!':'The Country Has Fallen'}</h1>
        <p class="gameover-sub">${won?`You survived all ${WIN_TURNS} turns. The realm prospers!`:`Fell after ${turns} turn${turns!==1?'s':''}.`}</p>
      </div>
      <div class="score-grid">
        <div class="score-card shared-score">
          <div class="score-label">Turns Survived</div>
          <div class="score-value">${turns}</div>
          <div class="score-note">Shared score</div>
        </div>
        <div class="score-card finance-score ${myRole==='finance'?'my-score':''}">
          <div class="score-icon">💰</div>
          <div class="score-label">Minister of Finance</div>
          <div class="score-value">${bCount} <span class="score-unit">buildings</span></div>
          ${myRole==='finance'?'<div class="score-note">Your score</div>':''}
        </div>
        <div class="score-card defence-score ${myRole==='defence'?'my-score':''}">
          <div class="score-icon">⚔️</div>
          <div class="score-label">Minister of Defence</div>
          <div class="score-value">${uCount} <span class="score-unit">soldiers</span></div>
          ${myRole==='defence'?'<div class="score-note">Your score</div>':''}
        </div>
      </div>
      <button class="btn btn-primary btn-large" id="btn-new-game">Return to Home</button>
    </div>`;
  document.getElementById('btn-new-game').addEventListener('click', onNewGame);
}

// ─── FEEDBACK ────────────────────────────────────────────────────────────────
export function showFeedback(msg, isError) {
  const el = document.getElementById('action-feedback');
  if (!el) return;
  el.textContent = msg;
  el.className = 'action-feedback ' + (isError?'feedback-error':'feedback-ok');
  clearTimeout(el._t);
  el._t = setTimeout(()=>{ if(el) el.textContent=''; }, 3000);
}

// ─── ATTACK OVERLAY ──────────────────────────────────────────────────────────
export function renderAttackOverlay() {
  if (document.getElementById('attack-overlay')) return;
  const el = document.createElement('div');
  el.id = 'attack-overlay';
  el.className = 'attack-overlay';
  el.innerHTML = `<div class="attack-inner"><div class="attack-icon">⚔️</div><div>Battle in progress…</div></div>`;
  document.body.appendChild(el);
}
export function removeAttackOverlay() {
  document.getElementById('attack-overlay')?.remove();
}

// ─── EXIT CONFIRM ─────────────────────────────────────────────────────────────
export function showExitConfirm(onConfirm, onCancel) {
  if (document.getElementById('exit-modal')) return;
  const modal = document.createElement('div');
  modal.id = 'exit-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h3>Exit to Home?</h3>
      <p>You'll leave this game. Your partner stays. You can rejoin with the same room code.</p>
      <div class="modal-actions">
        <button class="btn btn-exit-home" id="modal-confirm">✕ Exit</button>
        <button class="btn btn-ghost" id="modal-cancel">Stay</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('modal-confirm').addEventListener('click',()=>{ modal.remove(); onConfirm(); });
  document.getElementById('modal-cancel').addEventListener('click', ()=>{ modal.remove(); if(onCancel)onCancel(); });
  modal.addEventListener('click', e=>{ if(e.target===modal){ modal.remove(); if(onCancel)onCancel(); }});
}

// ─── EVENT HANDLERS ───────────────────────────────────────────────────────────
function attachGameHandlers(myRole, publicState, financeState, onAction) {
  const finBld = financeState?.buildings || {};
  const bDisc  = blacksmithDiscount(finBld);
  const gDisc  = granaryDiscount(finBld);

  // Shop buttons (build / recruit) — delegated
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const id     = btn.dataset.id;
      if (action === 'build')   onAction('build', { id });
      if (action === 'recruit') {
        const countEl = document.getElementById(`recruit-count-${id}`);
        onAction('recruit', { id, count: countEl?.value || 1 });
      }
    });
  });

  // Dynamic total cost — updates button label as quantity changes
  document.querySelectorAll('[data-action="recruit"]').forEach(btn => {
    const id       = btn.dataset.id;
    const baseCost = parseInt(btn.dataset.basecost) || 0;
    const countEl  = document.getElementById(`recruit-count-${id}`);
    if (countEl) {
      countEl.addEventListener('input', () => {
        const qty = Math.max(1, parseInt(countEl.value) || 1);
        btn.textContent = (baseCost * qty) + '💰';
      });
    }
  });

  if (myRole === 'finance') {
    attachEl('btn-transfer',    'click', () => onAction('transfer',   { amount: document.getElementById('transfer-amount')?.value }));
    attachEl('btn-finance-end', 'click', () => onAction('financeEnd', {}));
  }
  if (myRole === 'defence') {
    attachEl('btn-defence-end', 'click', () => onAction('defenceEnd', {}));
  }
}

function attachEl(id, ev, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev, fn);
}

export { renderBattleModal };
