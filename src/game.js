// src/game.js — v2
// All game rules, formulas, constants, building/unit definitions.
// No Firebase, no DOM.

// ─── WIN CONDITION ────────────────────────────────────────────────────────────
export const WIN_TURNS = 15;

// ─── BUILDINGS (Finance builds these) ────────────────────────────────────────
export const BUILDINGS = {
  farm:       { id:'farm',       label:'Farm',         icon:'🌾', cost:30,  income:15, defence:0,  desc:'+15 gold/turn. Cheap food source.' },
  market:     { id:'market',     label:'Market',       icon:'🏪', cost:60,  income:25, defence:0,  desc:'+25 gold/turn. Trade brings wealth.' },
  granary:    { id:'granary',    label:'Granary',      icon:'🏚️', cost:50,  income:10, defence:0,  desc:'+10 gold/turn. Reduces soldier recruit cost by 1.' },
  blacksmith: { id:'blacksmith', label:'Blacksmith',   icon:'⚒️', cost:80,  income:0,  defence:0,  desc:'Reduces all unit costs by 2. Stacks x3.' },
  city:       { id:'city',       label:'City',         icon:'🏙️', cost:100, income:50, defence:0,  desc:'+50 gold/turn. Requires a market. Max 3.' },
  wall:       { id:'wall',       label:'Stone Wall',   icon:'🧱', cost:70,  income:0,  defence:8,  desc:'+8 permanent defence. Absorbs hits.' },
  tower:      { id:'tower',      label:'Watch Tower',  icon:'🗼', cost:90,  income:5,  defence:12, desc:'+12 permanent defence. +5 gold/turn.' },
  cathedral:  { id:'cathedral',  label:'Cathedral',    icon:'⛪', cost:120, income:20, defence:5,  desc:'+20 gold/turn. +5 defence. +10% unit effectiveness.' },
};

// ─── UNITS (Defence recruits these) ──────────────────────────────────────────
export const UNITS = {
  militia:  { id:'militia',  label:'Militia',     icon:'🪓', cost:6,  power:1,  upkeep:0, cavalryImmune:false, desc:'Cheap. 1 power. Cannon fodder.' },
  infantry: { id:'infantry', label:'Infantry',    icon:'🗡️', cost:10, power:2,  upkeep:0, cavalryImmune:false, desc:'Reliable. 2 power per unit.' },
  archer:   { id:'archer',   label:'Archer',      icon:'🏹', cost:14, power:2,  upkeep:0, cavalryImmune:false, desc:'2 power + reduces enemy power by 1 before battle.' },
  cavalry:  { id:'cavalry',  label:'Cavalry',     icon:'🐴', cost:22, power:5,  upkeep:0, cavalryImmune:true,  desc:'5 power. Never die on a win. Bring back spoils.' },
  knight:   { id:'knight',   label:'Knight',      icon:'⚔️', cost:30, power:7,  upkeep:1, cavalryImmune:false, desc:'7 power. 1 upkeep/turn.' },
  siege:    { id:'siege',    label:'Siege Crew',  icon:'💣', cost:40, power:10, upkeep:2, cavalryImmune:false, desc:'10 power. 2 upkeep/turn.' },
  scout:    { id:'scout',    label:'Scout',       icon:'🔭', cost:8,  power:1,  upkeep:0, cavalryImmune:false, desc:'1 power. Reveals exact enemy strength this turn.' },
  paladin:  { id:'paladin',  label:'Paladin',     icon:'🛡️', cost:50, power:8,  upkeep:1, cavalryImmune:false, desc:'8 power. 1 upkeep. Heals +5 HP on victory.' },
};

// ─── ENEMY POWER ─────────────────────────────────────────────────────────────
// Turn 1: ~10-35  Turn 5: ~50-80  Turn 10: ~100-135  Turn 15: ~155-190
export function calcEnemyPower(turn) {
  const base = 10 + turn * 10 + turn * turn * 0.4;
  return Math.max(5, Math.floor(base + Math.random() * 30) - 15);
}
export function estimateEnemyPower(turn) {
  const base = Math.floor(10 + turn * 10 + turn * turn * 0.4);
  return { min: Math.max(5, base - 15), max: base + 15, midpoint: base };
}
export function threatLevel(turn) {
  const m = estimateEnemyPower(turn).midpoint;
  if (m < 30)  return 'Low';
  if (m < 65)  return 'Moderate';
  if (m < 110) return 'High';
  return 'Critical';
}

// ─── ENEMY TYPES ─────────────────────────────────────────────────────────────
export const ENEMY_TYPES = {
  standard: { id:'standard', label:'Standard Assault', icon:'⚔️',  wallMult:1.0, troopMult:1.0, desc:'A standard military assault. Balanced defence required.' },
  cavalry:  { id:'cavalry',  label:'Cavalry Raid',     icon:'🐴',  wallMult:0.0, troopMult:1.0, desc:'Fast raiders — walls provide no defence. Troops only.' },
  siege:    { id:'siege',    label:'Siege Assault',    icon:'💣',  wallMult:0.5, troopMult:1.0, desc:'Siege engines halve wall effectiveness. Destroys a building on loss.' },
  ambush:   { id:'ambush',   label:'Night Ambush',     icon:'🌑',  wallMult:1.0, troopMult:0.5, desc:'Surprise attack — troop power halved. Walls still count fully.' },
};

export function rollEnemyType(turn) {
  if (turn <= 2) return 'standard';
  const r = Math.random();
  if (r < 0.20) return turn >= 5 ? 'cavalry' : 'standard';
  if (r < 0.40) return turn >= 7 ? 'siege'   : 'standard';
  if (r < 0.60) return 'ambush';
  return 'standard';
}

// Walls become less effective vs stronger enemies — prevents pure wall stacking
export function wallEffectiveness(adjEnemy) {
  return Math.max(0.3, 1 - adjEnemy / 160);
}
export function threatClass(turn) {
  return { Low:'threat-low', Moderate:'threat-moderate', High:'threat-high', Critical:'threat-critical' }[threatLevel(turn)];
}

// ─── INCOME ──────────────────────────────────────────────────────────────────
export function calcIncome(buildings) {
  if (!buildings || typeof buildings !== 'object') return 0;
  return Object.entries(buildings).reduce((s,[id,n]) => s + (BUILDINGS[id]?.income||0)*n, 0);
}
export function blacksmithDiscount(buildings) {
  return Math.min((buildings?.blacksmith||0), 3) * 2;
}
export function granaryDiscount(buildings) {
  return Math.min((buildings?.granary||0), 3) * 1;
}
export function calcStaticDefence(buildings) {
  if (!buildings || typeof buildings !== 'object') return 0;
  return Object.entries(buildings).reduce((s,[id,n]) => s + (BUILDINGS[id]?.defence||0)*n, 0);
}
export function moraleMult(buildings) {
  return 1 + Math.min((buildings?.cathedral||0), 3) * 0.1;
}

// ─── UPKEEP ──────────────────────────────────────────────────────────────────
export function calcUpkeep(unitCounts) {
  if (!unitCounts || typeof unitCounts !== 'object') return 0;
  return Object.entries(unitCounts).reduce((s,[id,n]) => s + (UNITS[id]?.upkeep||0)*n, 0);
}

// ─── DEPLOYED POWER ───────────────────────────────────────────────────────────
export function calcDeployedPower(deployedUnits, buildings) {
  if (!deployedUnits || typeof deployedUnits !== 'object') return 0;
  const bl   = (buildings && typeof buildings === 'object') ? buildings : {};
  const mult = moraleMult(bl);
  const base = Object.entries(deployedUnits).reduce((s,[id,n]) => s + (UNITS[id]?.power||0)*n, 0);
  return Math.floor(base * mult);
}
export function archerReduction(deployedUnits) { return deployedUnits?.archer||0; }
export function paladinHeal(deployedUnits) { return (deployedUnits?.paladin||0)*5; }
export function hasScout(deployedUnits) { return (deployedUnits?.scout||0)>0; }

// ─── SPOILS (army → economy feedback) ────────────────────────────────────────
export function calcSpoils(deployedUnits, adjustedEnemy) {
  if (!deployedUnits) return 0;
  const base = Math.floor(adjustedEnemy / 3);
  const cavalryBonus = (deployedUnits.cavalry||0) * 8;
  return base + cavalryBonus;
}

// ─── BATTLE ──────────────────────────────────────────────────────────────────
export function resolveBattle({ units, buildings, enemyPowerRaw, enemyType = 'standard' }) {
  const du   = (units     && typeof units     === 'object') ? units     : {};
  const bl   = (buildings && typeof buildings === 'object') ? buildings : {};
  const type = ENEMY_TYPES[enemyType] || ENEMY_TYPES.standard;

  const staticDef          = calcStaticDefence(bl);
  const arrows             = archerReduction(du);
  const adjEnemy           = Math.max(0, enemyPowerRaw - arrows);
  const unitPower          = Math.floor(calcDeployedPower(du, bl) * type.troopMult);
  const wallEff            = Math.max(0, wallEffectiveness(adjEnemy) * type.wallMult);
  const effectiveStaticDef = Math.floor(staticDef * wallEff);
  const totalDef           = unitPower + effectiveStaticDef;
  const win                = totalDef >= adjEnemy;

  const unitLosses  = {};
  let countryDamage = 0;
  let spoils        = 0;
  let heal          = 0;

  if (win) {
    const lossRatio = (0.05 + 0.25 * (adjEnemy / Math.max(1, totalDef))) * (adjEnemy / totalDef);
    for (const [id, count] of Object.entries(du)) {
      if (UNITS[id]?.cavalryImmune) continue;
      const lost = Math.round(count * lossRatio);
      if (lost > 0) unitLosses[id] = lost;
    }
    spoils = calcSpoils(du, adjEnemy);
    heal   = paladinHeal(du);
  } else {
    for (const [id, count] of Object.entries(du)) {
      const lost = Math.max(0, Math.floor(count * Math.min(1, 0.4 + (adjEnemy - totalDef) / Math.max(1, totalDef))));
      if (lost > 0) unitLosses[id] = lost;
    }
    countryDamage = Math.max(0, adjEnemy - totalDef);
  }

  return { win, enemyPowerRaw, adjEnemy, arrows, staticDef, unitPower, effectiveStaticDef, wallEff, totalDef, unitLosses, countryDamage, spoils, heal, enemyType };
}

// ─── MAP ERA ─────────────────────────────────────────────────────────────────
// Drives visual evolution of the world.
// Uses weighted score so high-tier buildings (city, cathedral) matter more.
// Start state (farm:1, city:1) = score 4 → primitive. Need 12 for medieval.
export function mapEra(buildings) {
  if (!buildings) return 'primitive';
  const weights = { city:3, cathedral:3, tower:2, blacksmith:2, market:2, wall:2, granary:1, farm:1 };
  const score = Object.entries(buildings).reduce((s,[id,n]) => s + (weights[id]||1)*n, 0);
  if (score >= 25) return 'advanced';
  if (score >= 12) return 'medieval';
  return 'primitive';
}

// ─── PROGRESSIVE UNLOCKS ─────────────────────────────────────────────────────
// Buildings and units unlock as turns progress — prevents overwhelming the UI
// and creates a sense of discovery/progression.

export const BUILDING_UNLOCK_TURN = {
  farm:       1,   // always available
  granary:    1,   // always available
  market:     3,   // available from turn 3
  blacksmith: 4,
  city:       5,
  wall:       3,
  tower:      7,
  cathedral:  10,
};

export const UNIT_UNLOCK_TURN = {
  militia:  1,   // always available
  infantry: 1,
  archer:   2,
  scout:    2,
  cavalry:  4,
  knight:   6,
  paladin:  8,
  siege:    9,
};

export function unlockedBuildings(turn) {
  return Object.values(BUILDINGS).filter(b => (BUILDING_UNLOCK_TURN[b.id] || 1) <= turn);
}

export function unlockedUnits(turn) {
  return Object.values(UNITS).filter(u => (UNIT_UNLOCK_TURN[u.id] || 1) <= turn);
}

export function nextUnlockBuilding(turn) {
  // Returns the next building that will unlock soon (within 3 turns)
  return Object.values(BUILDINGS)
    .filter(b => BUILDING_UNLOCK_TURN[b.id] > turn && BUILDING_UNLOCK_TURN[b.id] <= turn + 3)
    .sort((a,b) => BUILDING_UNLOCK_TURN[a.id] - BUILDING_UNLOCK_TURN[b.id])[0] || null;
}

export function nextUnlockUnit(turn) {
  return Object.values(UNITS)
    .filter(u => UNIT_UNLOCK_TURN[u.id] > turn && UNIT_UNLOCK_TURN[u.id] <= turn + 3)
    .sort((a,b) => UNIT_UNLOCK_TURN[a.id] - UNIT_UNLOCK_TURN[b.id])[0] || null;
}

// ─── HINTS ───────────────────────────────────────────────────────────────────
export function treasuryHint(resources) {
  if (resources < 40)  return 'Empty';
  if (resources < 120) return 'Low';
  if (resources < 300) return 'Moderate';
  return 'Wealthy';
}
export function armyHint(power) {
  if (power < 5)  return 'Decimated';
  if (power < 20) return 'Weakened';
  if (power < 50) return 'Stable';
  return 'Strong';
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
export function parsePositiveInt(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return { error: 'Enter a positive whole number.' };
  return { value: n };
}
export function newToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
}
export function phaseName(phase) {
  return { finance:'Finance Phase', defence:'Defence Phase', attack:'⚔️ Battle!', gameover:'Game Over', victory:'Victory!' }[phase] || phase;
}
export function phaseDescription(phase, myRole) {
  if (phase==='finance' && myRole==='finance') return 'Your turn — manage the treasury.';
  if (phase==='finance' && myRole==='defence') return 'Waiting for Minister of Finance…';
  if (phase==='defence' && myRole==='defence') return 'Your turn — command the army.';
  if (phase==='defence' && myRole==='finance') return 'Waiting for Minister of Defence…';
  if (phase==='attack')  return 'The enemy is attacking!';
  if (phase==='gameover') return 'The country has fallen.';
  if (phase==='victory')  return 'The realm stands triumphant!';
  return '';
}
export function isMyPhase(phase, myRole) {
  return (phase==='finance' && myRole==='finance') || (phase==='defence' && myRole==='defence');
}