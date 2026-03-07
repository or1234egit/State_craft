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
  city:       { id:'city',       label:'City',         icon:'🏙️', cost:100, income:50, defence:0,  desc:'+50 gold/turn. Major population centre.' },
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
// Turn 1: ~11-15  Turn 5: ~33-39  Turn 10: ~58-66  Turn 15: ~83-91
export function calcEnemyPower(turn) {
  const base = 8 + turn * 5;
  return Math.max(5, base + Math.floor(Math.random() * 8) - 2);
}
export function estimateEnemyPower(turn) {
  const base = 8 + turn * 5;
  return { min: base - 2, max: base + 6, midpoint: base + 2 };
}
export function threatLevel(turn) {
  const m = estimateEnemyPower(turn).midpoint;
  if (m < 20) return 'Low';
  if (m < 40) return 'Moderate';
  if (m < 65) return 'High';
  return 'Critical';
}
export function threatClass(turn) {
  return { Low:'threat-low', Moderate:'threat-moderate', High:'threat-high', Critical:'threat-critical' }[threatLevel(turn)];
}

// ─── INCOME ──────────────────────────────────────────────────────────────────
export function calcIncome(buildings) {
  if (!buildings) return 0;
  return Object.entries(buildings).reduce((s,[id,n]) => s + (BUILDINGS[id]?.income||0)*n, 0);
}
export function blacksmithDiscount(buildings) {
  return Math.min((buildings?.blacksmith||0), 3) * 2;
}
export function granaryDiscount(buildings) {
  return Math.min((buildings?.granary||0), 3) * 1;
}
export function calcStaticDefence(buildings) {
  if (!buildings) return 0;
  return Object.entries(buildings).reduce((s,[id,n]) => s + (BUILDINGS[id]?.defence||0)*n, 0);
}
export function moraleMult(buildings) {
  return 1 + Math.min((buildings?.cathedral||0), 3) * 0.1;
}

// ─── UPKEEP ──────────────────────────────────────────────────────────────────
export function calcUpkeep(unitCounts) {
  if (!unitCounts) return 0;
  return Object.entries(unitCounts).reduce((s,[id,n]) => s + (UNITS[id]?.upkeep||0)*n, 0);
}

// ─── DEPLOYED POWER ───────────────────────────────────────────────────────────
export function calcDeployedPower(deployedUnits, buildings) {
  if (!deployedUnits) return 0;
  const mult = moraleMult(buildings);
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
export function resolveBattle({ deployedUnits, buildings, enemyPowerRaw }) {
  const staticDef   = calcStaticDefence(buildings);
  const unitPower   = calcDeployedPower(deployedUnits, buildings);
  const arrows      = archerReduction(deployedUnits);
  const adjEnemy    = Math.max(0, enemyPowerRaw - arrows);
  const totalDef    = unitPower + staticDef;
  const win         = totalDef >= adjEnemy;

  const unitLosses  = {};
  let countryDamage = 0;
  let spoils        = 0;
  let heal          = 0;

  if (win) {
    for (const [id, count] of Object.entries(deployedUnits||{})) {
      if (UNITS[id]?.cavalryImmune) continue;
      const lost = Math.max(0, Math.floor(count * 0.15));
      if (lost > 0) unitLosses[id] = lost;
    }
    spoils = calcSpoils(deployedUnits, adjEnemy);
    heal   = paladinHeal(deployedUnits);
  } else {
    for (const [id, count] of Object.entries(deployedUnits||{})) {
      const lost = Math.max(0, Math.floor(count * 0.4));
      if (lost > 0) unitLosses[id] = lost;
    }
    countryDamage = Math.max(0, adjEnemy - totalDef);
  }

  return { win, enemyPowerRaw, adjEnemy, arrows, staticDef, unitPower, totalDef, unitLosses, countryDamage, spoils, heal };
}

// ─── MAP ERA ─────────────────────────────────────────────────────────────────
// Drives visual evolution of the world
export function mapEra(buildings) {
  if (!buildings) return 'primitive';
  const total = Object.values(buildings).reduce((a,b)=>a+b,0);
  if (total >= 10) return 'advanced';
  if (total >= 4)  return 'medieval';
  return 'primitive';
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