// src/map.js
// Renders the living SVG world map on the left panel.
// Shows terrain, buildings placed in hex zones, soldier figures, and
// animates soldiers marching during attack phase.

import { BUILDINGS, UNITS, mapEra } from './game.js';

// ─── MAP ZONES ────────────────────────────────────────────────────────────────
// Each zone is a named region with a fixed SVG position and a set of building slots.
const ZONES = [
  { id:'castle',  label:'Castle',      x:220, y:160, radius:55,  color:'#4a3a2a', slots:4 },
  { id:'north',   label:'North Fields',x:160, y:70,  radius:40,  color:'#3a5a2a', slots:3 },
  { id:'east',    label:'East Quarter',x:330, y:130, radius:38,  color:'#3a4a2a', slots:3 },
  { id:'south',   label:'South Fields',x:220, y:270, radius:42,  color:'#3a5a2a', slots:3 },
  { id:'west',    label:'West Port',   x:100, y:180, radius:38,  color:'#2a4a5a', slots:3 },
  { id:'border',  label:'Border',      x:370, y:220, radius:35,  color:'#2a2a2a', slots:2 },
];

// Which buildings prefer which zone
const ZONE_PREF = {
  farm:       ['north','south','west'],
  market:     ['west','east','castle'],
  granary:    ['north','south'],
  blacksmith: ['east','castle'],
  city:       ['castle','east','north'],
  wall:       ['border','east','castle'],
  tower:      ['border','castle'],
  cathedral:  ['castle'],
};

// ─── ERA PALETTES ─────────────────────────────────────────────────────────────
const ERA_STYLE = {
  primitive: { sky:'#1a2a1a', ground:'#2a3a1a', path:'#3a2a1a', fog:'rgba(0,20,0,0.4)' },
  medieval:  { sky:'#1a1a2a', ground:'#1a2a1a', path:'#4a3a1a', fog:'rgba(0,0,20,0.3)' },
  advanced:  { sky:'#0a0a1a', ground:'#1a1a2a', path:'#2a4a6a', fog:'rgba(0,10,30,0.2)' },
};

// ─── BUILDING DISPLAY ─────────────────────────────────────────────────────────
// Returns the emoji icon to draw for a building at a given era
function buildingDisplay(id, era) {
  const base = BUILDINGS[id]?.icon || '🏠';
  if (era === 'advanced' && id === 'city')  return '🏙️';
  if (era === 'medieval' && id === 'city')  return '🏰';
  if (era === 'primitive' && id === 'city') return '🏚️';
  return base;
}

// ─── RENDER MAP ──────────────────────────────────────────────────────────────
export function renderMap(container, { buildings, unitCounts, deployedUnits, phase, turn }) {
  const era      = mapEra(buildings||{});
  const palette  = ERA_STYLE[era];
  const isAttack = phase === 'attack';

  // Build a flat list of placed buildings with assigned zones
  const placed = assignBuildingsToZones(buildings||{});

  // Total deployed count for display
  const totalDeployed = Object.values(deployedUnits||{}).reduce((a,b)=>a+b,0);
  const totalArmy     = Object.values(unitCounts||{}).reduce((a,b)=>a+b,0);

  const svg = buildSVG({ palette, era, placed, totalArmy, totalDeployed, isAttack, turn });
  container.innerHTML = svg;

  // Attach CSS animations after DOM insertion
  if (isAttack) startBattleAnimation(container);
}

// ─── ASSIGN BUILDINGS TO ZONES ────────────────────────────────────────────────
function assignBuildingsToZones(buildings) {
  // Returns array of { zoneId, buildingId, icon, slot }
  const result  = [];
  const slotUsed = {}; // zoneId → count

  for (const [id, count] of Object.entries(buildings)) {
    for (let i = 0; i < count; i++) {
      const prefs    = ZONE_PREF[id] || ['castle'];
      let placed     = false;
      for (const zid of prefs) {
        const zone = ZONES.find(z=>z.id===zid);
        if (!zone) continue;
        const used = slotUsed[zid]||0;
        if (used < zone.slots) {
          result.push({ zoneId:zid, buildingId:id });
          slotUsed[zid] = used + 1;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // overflow → castle
        const used = slotUsed['castle']||0;
        result.push({ zoneId:'castle', buildingId:id });
        slotUsed['castle'] = used + 1;
      }
    }
  }
  return result;
}

// ─── BUILD SVG ────────────────────────────────────────────────────────────────
function buildSVG({ palette, era, placed, totalArmy, totalDeployed, isAttack, turn }) {
  const W = 480, H = 360;

  // Group placed buildings by zone
  const byZone = {};
  for (const p of placed) {
    if (!byZone[p.zoneId]) byZone[p.zoneId] = [];
    byZone[p.zoneId].push(p);
  }

  // Zone circles
  const zoneSVG = ZONES.map(z => {
    const zBuildings = byZone[z.id] || [];
    const buildingIcons = zBuildings.map((b, i) => {
      const angle  = (i / Math.max(zBuildings.length, 1)) * Math.PI * 2 - Math.PI/2;
      const r      = z.radius * 0.55;
      const bx     = z.x + Math.cos(angle) * r;
      const by     = z.y + Math.sin(angle) * r;
      const icon   = BUILDINGS[b.buildingId]?.icon || '🏠';
      return `<text x="${bx.toFixed(1)}" y="${by.toFixed(1)}" font-size="18" text-anchor="middle" dominant-baseline="middle" class="building-icon">${icon}</text>`;
    }).join('');

    const zoneColor = palette.ground;
    return `
      <circle cx="${z.x}" cy="${z.y}" r="${z.radius}" fill="${z.color}" fill-opacity="0.55" stroke="#ffffff22" stroke-width="1"/>
      <text x="${z.x}" y="${z.y + z.radius + 12}" font-size="9" fill="#aaa" text-anchor="middle">${z.label}</text>
      ${buildingIcons}
    `;
  }).join('');

  // Paths between zones
  const pathSVG = `
    <line x1="160" y1="95"  x2="210" y2="130" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
    <line x1="220" y1="105" x2="220" y2="140" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
    <line x1="310" y1="140" x2="265" y2="155" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
    <line x1="220" y1="215" x2="220" y2="250" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
    <line x1="140" y1="180" x2="165" y2="175" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
    <line x1="335" y1="185" x2="370" y2="210" stroke="${palette.path}" stroke-width="3" stroke-linecap="round"/>
  `;

  // Soldier figures in the castle zone (not during attack — they'll be animated)
  const soldierSVG = (!isAttack && totalArmy > 0)
    ? renderSoldierFormation(220, 160, totalArmy, totalDeployed)
    : '';

  // Enemy figures during attack (start at right edge)
  const enemySVG = isAttack ? renderEnemyFormation() : '';

  // Era label
  const eraLabel = { primitive:'⚔️ Age of Settlements', medieval:'🏰 Medieval Era', advanced:'🌟 Age of Wonders' }[era];

  // Stars / atmosphere
  const starsSVG = era === 'advanced'
    ? Array.from({length:30},(_,i) =>
        `<circle cx="${(i*97+31)%W}" cy="${(i*61+17)%120}" r="1" fill="white" opacity="${0.3+Math.random()*0.5}"/>`
      ).join('')
    : '';

  return `
    <svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;display:block;background:${palette.sky}">
      <!-- Stars -->
      ${starsSVG}
      <!-- Ground -->
      <rect x="0" y="200" width="${W}" height="${H-200}" fill="${palette.ground}" opacity="0.4"/>
      <!-- Fog overlay -->
      <rect x="0" y="0" width="${W}" height="${H}" fill="${palette.fog}"/>
      <!-- Paths -->
      ${pathSVG}
      <!-- Zones -->
      ${zoneSVG}
      <!-- Soldiers -->
      ${soldierSVG}
      <!-- Enemies -->
      ${enemySVG}
      <!-- Era badge -->
      <rect x="8" y="8" width="200" height="22" rx="4" fill="#00000066"/>
      <text x="14" y="23" font-size="11" fill="#ccccaa">${eraLabel}</text>
      <!-- Turn badge -->
      <rect x="${W-70}" y="8" width="62" height="22" rx="4" fill="#00000066"/>
      <text x="${W-39}" y="23" font-size="11" fill="#ccccaa" text-anchor="middle">Turn ${turn}</text>
    </svg>
  `;
}

// ─── SOLDIER FORMATION ────────────────────────────────────────────────────────
function renderSoldierFormation(cx, cy, total, deployed) {
  const icons  = ['🗡️','🪓','🏹','🐴','⚔️','🛡️'];
  const count  = Math.min(total, 12);
  const cols   = Math.ceil(Math.sqrt(count));
  const lines  = [];
  for (let i = 0; i < count; i++) {
    const col  = i % cols;
    const row  = Math.floor(i / cols);
    const x    = cx - (cols-1)*9 + col*18;
    const y    = cy - 5 + row*18;
    const icon = icons[i % icons.length];
    lines.push(`<text x="${x}" y="${y}" font-size="14" text-anchor="middle" dominant-baseline="middle" class="soldier-idle">${icon}</text>`);
  }
  const extra = total > 12 ? `<text x="${cx}" y="${cy+40}" font-size="10" fill="#aaffaa" text-anchor="middle">+${total-12} more</text>` : '';
  return lines.join('')+extra;
}

// ─── ENEMY FORMATION ─────────────────────────────────────────────────────────
function renderEnemyFormation() {
  // Enemies start off right edge; CSS animation moves them left
  const enemies = ['👹','💀','🧟','👿','💀','👹','🧟','👿'];
  return enemies.map((e, i) => {
    const y = 130 + (i % 4) * 28;
    const delay = i * 0.12;
    return `<text x="490" y="${y}" font-size="16" text-anchor="middle" dominant-baseline="middle"
      class="enemy-march" style="animation-delay:${delay}s">${e}</text>`;
  }).join('');
}

// ─── BATTLE ANIMATION ────────────────────────────────────────────────────────
export function startBattleAnimation(container) {
  // Soldiers march right, enemies march left — CSS handles it via keyframes
  // This is called after SVG is in the DOM
  const enemies  = container.querySelectorAll('.enemy-march');
  const soldiers = container.querySelectorAll('.soldier-idle');

  soldiers.forEach((el, i) => {
    el.classList.remove('soldier-idle');
    el.classList.add('soldier-march');
    el.style.animationDelay = `${i * 0.08}s`;
  });
}

// ─── BATTLE RESULT OVERLAY ────────────────────────────────────────────────────
export function renderBattleModal(battle, onClose) {
  const existing = document.getElementById('battle-modal');
  if (existing) existing.remove();

  if (!battle) return;

  const win       = battle.win;
  const lossLines = Object.entries(battle.unitLosses||{})
    .map(([id,n]) => `<div class="bl-row loss">💀 Lost ${n}× ${UNITS[id]?.label||id}</div>`)
    .join('') || '<div class="bl-row">No casualties</div>';

  const modal = document.createElement('div');
  modal.id = 'battle-modal';
  modal.className = 'battle-modal-overlay';
  modal.innerHTML = `
    <div class="battle-modal ${win?'battle-win':'battle-loss'}">
      <div class="bm-header">
        <div class="bm-title">${win ? '⚔️ Victory!' : '💥 Defeat!'}</div>
        <div class="bm-sub">${win ? 'The enemy has been repelled.' : 'The enemy broke through.'}</div>
      </div>
      <div class="bm-stats">
        <div class="bm-col">
          <div class="bm-label">Enemy Power</div>
          <div class="bm-val enemy">${battle.adjEnemy}</div>
          ${battle.arrows>0?`<div class="bm-detail">−${battle.arrows} from archers</div>`:''}
        </div>
        <div class="bm-vs">VS</div>
        <div class="bm-col">
          <div class="bm-label">Your Defence</div>
          <div class="bm-val defence">${battle.totalDef}</div>
          ${battle.staticDef>0?`<div class="bm-detail">+${battle.staticDef} from structures</div>`:''}
        </div>
      </div>
      <div class="bm-results">
        ${lossLines}
        ${battle.countryDamage>0?`<div class="bl-row loss">🩸 Country took ${battle.countryDamage} damage</div>`:''}
        ${battle.heal>0?`<div class="bl-row gain">💚 Paladin healed +${battle.heal} HP</div>`:''}
        ${battle.spoils>0?`<div class="bl-row gain">💰 Spoils of war: +${battle.spoils} gold</div>`:''}
        ${battle.income>0?`<div class="bl-row gain">🏛️ Turn income: +${battle.income} gold</div>`:''}
        ${battle.upkeep>0?`<div class="bl-row loss">⚙️ Upkeep: −${battle.upkeep} gold</div>`:''}
      </div>
      <div class="bm-health-bar">
        <div class="bm-health-label">Country Health: ${battle.newHealth}/100</div>
        <div class="bm-health-track"><div class="bm-health-fill ${battle.newHealth>60?'h-high':battle.newHealth>30?'h-mid':'h-low'}" style="width:${battle.newHealth}%"></div></div>
      </div>
      <button class="btn btn-primary bm-close" id="bm-close-btn">Continue →</button>
    </div>
  `;
  document.body.appendChild(modal);
  document.getElementById('bm-close-btn').addEventListener('click', () => {
    modal.remove();
    if (onClose) onClose();
  });
}