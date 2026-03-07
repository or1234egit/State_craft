// src/ui.js
// Renders all screens. State flows in from main.js; events flow out via callbacks.
// No Firebase imports here — keeps rendering pure.

import {
  phaseName,
  phaseDescription,
  isMyPhase,
  threatLevel,
  threatClass,
  treasuryHint,
  armyHint,
  estimateEnemyPower,
  CITY_COST,
  SOLDIER_COST,
} from './game.js';

const app = document.getElementById('app');

// ─── SCREEN: HOME ─────────────────────────────────────────────────────────────

export function renderHome({ onCreateRoom, onJoinRoom }) {
  app.innerHTML = `
    <div class="screen screen-home">
      <header class="home-header">
        <div class="title-block">
          <h1 class="game-title">StateCraft</h1>
          <p class="game-subtitle">A cooperative strategy for two ministers</p>
        </div>
      </header>
      <div class="home-cards">
        <div class="card">
          <h2>Create a New Game</h2>
          <p>Start a room and share the code with your partner.</p>
          <div class="input-row">
            <input type="text" id="create-code" maxlength="8" placeholder="Room code (e.g. CASTLE)" autocomplete="off" />
            <button id="btn-create" class="btn btn-primary">Create Room</button>
          </div>
          <div id="create-error" class="error-msg"></div>
        </div>
        <div class="divider-or">or</div>
        <div class="card">
          <h2>Join a Game</h2>
          <p>Enter the room code your partner shared with you.</p>
          <div class="input-row">
            <input type="text" id="join-code" maxlength="8" placeholder="Room code" autocomplete="off" />
            <button id="btn-join" class="btn btn-secondary">Join Room</button>
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
            <p>Controls the treasury. Build cities for income. Transfer funds to Defence. Score: cities built.</p>
          </div>
          <div class="role-card defence-role">
            <div class="role-icon">⚔️</div>
            <h4>Minister of Defence</h4>
            <p>Commands the army. Recruit soldiers. Deploy them to hold the line. Score: soldiers surviving.</p>
          </div>
        </div>
        <p class="goal-text">Together, survive as many enemy attacks as possible before the country falls.</p>
      </div>
    </div>
  `;

  document.getElementById('btn-create').addEventListener('click', () => {
    const code = document.getElementById('create-code').value.trim().toUpperCase();
    if (!code) {
      document.getElementById('create-error').textContent = 'Enter a room code.';
      return;
    }
    document.getElementById('create-error').textContent = '';
    onCreateRoom(code);
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    if (!code) {
      document.getElementById('join-error').textContent = 'Enter a room code.';
      return;
    }
    document.getElementById('join-error').textContent = '';
    onJoinRoom(code);
  });

  // Allow Enter key
  ['create-code', 'join-code'].forEach((id) => {
    document.getElementById(id).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const btn = id === 'create-code' ? 'btn-create' : 'btn-join';
        document.getElementById(btn).click();
      }
    });
  });
}

export function showHomeError(side, message) {
  const el = document.getElementById(`${side}-error`);
  if (el) el.textContent = message;
}

// ─── SCREEN: ROLE SELECTION ───────────────────────────────────────────────────

export function renderRoleSelect({ roomCode, players, onClaimRole }) {
  const financeTaken = Object.values(players).some((p) => p.role === 'finance');
  const defenceTaken = Object.values(players).some((p) => p.role === 'defence');

  app.innerHTML = `
    <div class="screen screen-role">
      <div class="room-badge">Room: <strong>${roomCode}</strong></div>
      <h2>Choose Your Role</h2>
      <p class="waiting-note">One player must be Finance; the other must be Defence.</p>
      <div class="role-pick-grid">
        <button id="pick-finance" class="role-btn finance-role ${financeTaken ? 'role-taken' : ''}" ${financeTaken ? 'disabled' : ''}>
          <div class="role-icon">💰</div>
          <h3>Minister of Finance</h3>
          <p>Manage the treasury, build cities, fund the army.</p>
          ${financeTaken ? '<span class="taken-badge">Taken</span>' : ''}
        </button>
        <button id="pick-defence" class="role-btn defence-role ${defenceTaken ? 'role-taken' : ''}" ${defenceTaken ? 'disabled' : ''}>
          <div class="role-icon">⚔️</div>
          <h3>Minister of Defence</h3>
          <p>Recruit and deploy soldiers. Protect the realm.</p>
          ${defenceTaken ? '<span class="taken-badge">Taken</span>' : ''}
        </button>
      </div>
      <div id="role-error" class="error-msg"></div>
    </div>
  `;

  if (!financeTaken) {
    document.getElementById('pick-finance').addEventListener('click', () => onClaimRole('finance'));
  }
  if (!defenceTaken) {
    document.getElementById('pick-defence').addEventListener('click', () => onClaimRole('defence'));
  }
}

export function showRoleError(message) {
  const el = document.getElementById('role-error');
  if (el) el.textContent = message;
}

// ─── SCREEN: WAITING FOR PARTNER ─────────────────────────────────────────────

export function renderWaiting({ roomCode, myRole, players, onExit }) {
  const partnerRole = myRole === 'finance' ? 'defence' : 'finance';
  const partnerLabel = myRole === 'finance' ? 'Minister of Defence' : 'Minister of Finance';

  app.innerHTML = `
    <div class="screen screen-waiting">
      <div class="room-badge">Room: <strong>${roomCode}</strong></div>
      <div class="waiting-content">
        <div class="spinner"></div>
        <h2>Waiting for your partner…</h2>
        <p>You are the <strong>${myRole === 'finance' ? 'Minister of Finance 💰' : 'Minister of Defence ⚔️'}</strong></p>
        <p>Share the room code with your partner so they can join as <strong>${partnerLabel}</strong>.</p>
        <div class="share-code">${roomCode}</div>
        <div class="waiting-actions">
          <button class="btn btn-ghost" id="copy-btn">Copy Room Code</button>
          <button class="btn btn-exit-home" id="btn-exit-waiting">✕ Exit to Home</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('copy-btn').addEventListener('click', () => {
    navigator.clipboard.writeText(roomCode).then(() => {
      document.getElementById('copy-btn').textContent = 'Copied!';
      setTimeout(() => {
        const btn = document.getElementById('copy-btn');
        if (btn) btn.textContent = 'Copy Room Code';
      }, 2000);
    });
  });

  if (onExit) {
    document.getElementById('btn-exit-waiting').addEventListener('click', onExit);
  }
}

// ─── GAME LAYOUT SHELL ────────────────────────────────────────────────────────
// Both game screens share the same 2-column layout shell.

export function renderGameLayout({ myRole, roomCode, publicState, financeState, defenceState, logEntries, onAction, onExit }) {
  const phase = publicState?.phase || 'finance';
  const turn = publicState?.turnNumber || 1;
  const health = publicState?.countryHealth || 0;
  const myTurn = isMyPhase(phase, myRole);

  app.innerHTML = `
    <div class="game-layout">
      <div class="game-left">
        <div id="role-panel">
          ${myRole === 'finance'
            ? renderFinancePanel(financeState, publicState, myTurn)
            : renderDefencePanel(defenceState, publicState, myTurn)
          }
        </div>
      </div>
      <div class="game-right">
        ${renderSharedPanel(publicState, financeState, defenceState, roomCode, myRole)}
        ${renderLog(logEntries)}
      </div>
    </div>
  `;

  attachGameHandlers(myRole, publicState, financeState, defenceState, onAction);
  attachEl('btn-exit-game', 'click', onExit);
}

// ─── FINANCE PANEL ────────────────────────────────────────────────────────────

function renderFinancePanel(finance, pub, myTurn) {
  if (!finance || !pub) return '<div class="card">Loading…</div>';
  const phase = pub.phase;
  const disabled = !myTurn || phase !== 'finance';
  const disAttr = disabled ? 'disabled' : '';

  return `
    <div class="card role-card-active finance-role">
      <div class="panel-header">
        <span class="role-icon">💰</span>
        <h2>Minister of Finance</h2>
        ${myTurn ? '<span class="your-turn-badge">Your Turn</span>' : ''}
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Treasury</div>
          <div class="stat-value gold">${finance.resources}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Cities</div>
          <div class="stat-value">${finance.cities}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Income / Turn</div>
          <div class="stat-value green">+${finance.cities * 20}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Army Condition</div>
          <div class="stat-value hint">${armyHint(0) /* Finance cannot see exact soldiers, using hint */}</div>
        </div>
      </div>

      <div class="action-section">
        <h3>Actions</h3>

        <div class="action-row">
          <button id="btn-build-city" class="btn btn-primary" ${disAttr} ${finance.resources < 50 || disabled ? 'disabled' : ''}>
            Build City (−50 resources)
          </button>
        </div>

        <div class="action-row">
          <input type="number" id="transfer-amount" min="1" placeholder="Amount" class="num-input" ${disAttr} />
          <button id="btn-transfer" class="btn btn-secondary" ${disAttr}>
            Transfer to Defence
          </button>
        </div>

        <div class="action-row">
          <button id="btn-finance-end" class="btn btn-end" ${disabled ? 'disabled' : ''}>
            End Finance Phase →
          </button>
        </div>
      </div>

      <div id="action-feedback" class="action-feedback"></div>
    </div>
  `;
}

// ─── DEFENCE PANEL ────────────────────────────────────────────────────────────

function renderDefencePanel(defence, pub, myTurn) {
  if (!defence || !pub) return '<div class="card">Loading…</div>';
  const phase = pub.phase;
  const disabled = !myTurn || phase !== 'defence';
  const disAttr = disabled ? 'disabled' : '';
  const available = defence.soldiers - defence.deployedSoldiers;

  return `
    <div class="card role-card-active defence-role">
      <div class="panel-header">
        <span class="role-icon">⚔️</span>
        <h2>Minister of Defence</h2>
        ${myTurn ? '<span class="your-turn-badge">Your Turn</span>' : ''}
      </div>

      <div class="stat-grid">
        <div class="stat">
          <div class="stat-label">Total Soldiers</div>
          <div class="stat-value">${defence.soldiers}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Deployed</div>
          <div class="stat-value red">${defence.deployedSoldiers}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Available</div>
          <div class="stat-value green">${available}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Defence Budget</div>
          <div class="stat-value gold">${defence.defenceBudget}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Treasury Condition</div>
          <div class="stat-value hint">—</div>
        </div>
      </div>

      <div class="action-section">
        <h3>Actions</h3>

        <div class="action-row">
          <input type="number" id="recruit-count" min="1" placeholder="Count" class="num-input" ${disAttr} />
          <button id="btn-recruit" class="btn btn-secondary" ${disAttr} ${defence.defenceBudget < 10 || disabled ? 'disabled' : ''}>
            Recruit (×${SOLDIER_COST} budget)
          </button>
        </div>

        <div class="action-row">
          <input type="number" id="deploy-count" min="1" placeholder="Count" class="num-input" ${disAttr} />
          <button id="btn-deploy" class="btn btn-primary" ${disAttr} ${available <= 0 || disabled ? 'disabled' : ''}>
            Deploy Soldiers
          </button>
        </div>

        <div class="action-row">
          <button id="btn-defence-end" class="btn btn-end" ${disabled ? 'disabled' : ''}>
            End Defence Phase →
          </button>
        </div>
      </div>

      <div id="action-feedback" class="action-feedback"></div>
    </div>
  `;
}

// ─── SHARED PANEL ─────────────────────────────────────────────────────────────

function renderSharedPanel(pub, finance, defence, roomCode, myRole) {
  if (!pub) return '';
  const phase = pub.phase;
  const turn = pub.turnNumber;
  const health = pub.countryHealth;
  const { min, max } = estimateEnemyPower(turn);
  const tLevel = threatLevel(turn);
  const tClass = threatClass(turn);

  const healthPct = Math.max(0, health);
  const healthClass = health > 60 ? 'health-high' : health > 30 ? 'health-mid' : 'health-low';

  const phaseDesc = phaseDescription(phase, myRole);

  return `
    <div class="card shared-panel">
      <div class="shared-header">
        <div class="room-code-badge">🏰 ${roomCode}</div>
        <div class="shared-header-right">
          <div class="turn-badge">Turn ${turn}</div>
          <button id="btn-exit-game" class="btn btn-exit-home" title="Exit to Home">✕ Exit</button>
        </div>
      </div>

      <div class="phase-block">
        <div class="phase-name">${phaseName(phase)}</div>
        <div class="phase-desc">${phaseDesc}</div>
      </div>

      <div class="country-health-section">
        <div class="health-label">Country Health</div>
        <div class="health-bar-wrap">
          <div class="health-bar ${healthClass}" style="width:${healthPct}%"></div>
        </div>
        <div class="health-value">${health} / 100</div>
      </div>

      <div class="threat-section ${tClass}">
        <span class="threat-label">⚠️ Threat Level</span>
        <span class="threat-value">${tLevel}</span>
        <span class="threat-range">(est. ${min}–${max} power)</span>
      </div>
    </div>
  `;
}

// ─── EVENT LOG ────────────────────────────────────────────────────────────────

function renderLog(entries) {
  const items = (entries || [])
    .slice()
    .reverse()
    .map((e) => `<li class="log-entry">${e.message}</li>`)
    .join('');

  return `
    <div class="card log-panel">
      <h3 class="log-title">Event Log</h3>
      <ul class="log-list">${items || '<li class="log-entry muted">No events yet.</li>'}</ul>
    </div>
  `;
}

// ─── SCREEN: GAME OVER ────────────────────────────────────────────────────────

export function renderGameOver({ publicState, financeState, defenceState, myRole, onNewGame }) {
  const turns = (publicState?.turnNumber || 1) - 1;
  const cities = financeState?.cities || 0;
  const soldiers = defenceState?.soldiers || 0;

  const financeScore = cities;
  const defenceScore = soldiers;
  const financeWins = financeScore >= defenceScore;

  app.innerHTML = `
    <div class="screen screen-gameover">
      <div class="gameover-header">
        <div class="gameover-icon">🏴</div>
        <h1>The Country Has Fallen</h1>
        <p class="gameover-sub">The enemy overwhelmed your defences after ${turns} turn${turns !== 1 ? 's' : ''}.</p>
      </div>

      <div class="score-grid">
        <div class="score-card shared-score">
          <div class="score-label">Turns Survived</div>
          <div class="score-value">${turns}</div>
          <div class="score-note">Shared score</div>
        </div>
        <div class="score-card finance-score ${myRole === 'finance' ? 'my-score' : ''}">
          <div class="score-icon">💰</div>
          <div class="score-label">Minister of Finance</div>
          <div class="score-value">${financeScore} <span class="score-unit">cities built</span></div>
          ${myRole === 'finance' ? '<div class="score-note">Your personal score</div>' : ''}
          ${financeWins ? '<div class="score-winner">★ Better performer</div>' : ''}
        </div>
        <div class="score-card defence-score ${myRole === 'defence' ? 'my-score' : ''}">
          <div class="score-icon">⚔️</div>
          <div class="score-label">Minister of Defence</div>
          <div class="score-value">${defenceScore} <span class="score-unit">soldiers remaining</span></div>
          ${myRole === 'defence' ? '<div class="score-note">Your personal score</div>' : ''}
          ${!financeWins ? '<div class="score-winner">★ Better performer</div>' : ''}
        </div>
      </div>

      <button class="btn btn-primary btn-large" id="btn-new-game">Return to Home</button>
    </div>
  `;

  document.getElementById('btn-new-game').addEventListener('click', onNewGame);
}

// ─── FEEDBACK MESSAGE ─────────────────────────────────────────────────────────

export function showFeedback(message, isError) {
  const el = document.getElementById('action-feedback');
  if (!el) return;
  el.textContent = message;
  el.className = 'action-feedback ' + (isError ? 'feedback-error' : 'feedback-ok');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {
    if (el) el.textContent = '';
  }, 3000);
}

// ─── ATTACK OVERLAY ───────────────────────────────────────────────────────────

export function renderAttackOverlay() {
  const existing = document.getElementById('attack-overlay');
  if (existing) return;
  const overlay = document.createElement('div');
  overlay.id = 'attack-overlay';
  overlay.className = 'attack-overlay';
  overlay.innerHTML = `
    <div class="attack-inner">
      <div class="attack-icon">⚔️</div>
      <div>Resolving enemy attack…</div>
    </div>
  `;
  document.body.appendChild(overlay);
}

export function removeAttackOverlay() {
  const el = document.getElementById('attack-overlay');
  if (el) el.remove();
}

// ─── EVENT HANDLERS (attached after render) ───────────────────────────────────

function attachGameHandlers(myRole, publicState, financeState, defenceState, onAction) {
  if (myRole === 'finance') {
    attachEl('btn-build-city', 'click', () => onAction('buildCity', {}));
    attachEl('btn-transfer', 'click', () => {
      const val = document.getElementById('transfer-amount')?.value;
      onAction('transfer', { amount: val });
    });
    attachEl('btn-finance-end', 'click', () => onAction('financeEnd', {}));
  }

  if (myRole === 'defence') {
    attachEl('btn-recruit', 'click', () => {
      const val = document.getElementById('recruit-count')?.value;
      onAction('recruit', { count: val });
    });
    attachEl('btn-deploy', 'click', () => {
      const val = document.getElementById('deploy-count')?.value;
      onAction('deploy', { count: val });
    });
    attachEl('btn-defence-end', 'click', () => onAction('defenceEnd', {}));
  }
}

function attachEl(id, event, handler) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(event, handler);
}

// ─── EXIT CONFIRMATION MODAL ──────────────────────────────────────────────────

export function showExitConfirm(onConfirm, onCancel) {
  const existing = document.getElementById('exit-modal');
  if (existing) return;

  const modal = document.createElement('div');
  modal.id = 'exit-modal';
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h3>Exit to Home?</h3>
      <p>You will leave this game. Your partner will remain in the room but the game will be paused for you. You can rejoin using the same room code.</p>
      <div class="modal-actions">
        <button class="btn btn-exit-home" id="modal-confirm">✕ Exit to Home</button>
        <button class="btn btn-ghost" id="modal-cancel">Stay in Game</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  document.getElementById('modal-confirm').addEventListener('click', () => {
    modal.remove();
    onConfirm();
  });
  document.getElementById('modal-cancel').addEventListener('click', () => {
    modal.remove();
    if (onCancel) onCancel();
  });

  // Click outside to cancel
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
      if (onCancel) onCancel();
    }
  });
}

// Exported so main.js can call it when finance data changes (hidden info hint)
export function updateArmyHint(soldiers) {
  const el = document.querySelector('.finance-role .hint');
  if (el) el.textContent = armyHint(soldiers);
}