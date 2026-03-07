// src/game.js
// All game rules, formulas, and derived values live here.
// Keep this file free of Firebase and DOM concerns.

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

export const CITY_COST = 50;
export const CITY_INCOME = 20;
export const SOLDIER_COST = 10;
export const INITIAL_HEALTH = 100;

// ─── ENEMY POWER ─────────────────────────────────────────────────────────────

/**
 * Returns a deterministic-range enemy power for a given turn.
 * The actual random roll is done in firebase.js at resolution time.
 * This function is used for UI "threat level" hints.
 */
export function estimateEnemyPower(turnNumber) {
  const base = 10 + turnNumber * 5;
  return { min: base, max: base + 10, midpoint: base + 5 };
}

/**
 * Returns a human-readable threat label based on turn.
 */
export function threatLevel(turnNumber) {
  const mid = estimateEnemyPower(turnNumber).midpoint;
  if (mid < 25) return 'Low';
  if (mid < 45) return 'Moderate';
  if (mid < 65) return 'High';
  return 'Critical';
}

/**
 * Returns a CSS class for threat colouring.
 */
export function threatClass(turnNumber) {
  const level = threatLevel(turnNumber);
  if (level === 'Low') return 'threat-low';
  if (level === 'Moderate') return 'threat-moderate';
  if (level === 'High') return 'threat-high';
  return 'threat-critical';
}

// ─── HIDDEN INFO HINTS ────────────────────────────────────────────────────────

/**
 * Approximate treasury label shown to Defence (not exact resources).
 */
export function treasuryHint(resources) {
  if (resources < 30) return 'Empty';
  if (resources < 80) return 'Low';
  if (resources < 150) return 'Moderate';
  return 'Wealthy';
}

/**
 * Approximate army condition shown to Finance (not exact soldiers).
 */
export function armyHint(soldiers) {
  if (soldiers < 5) return 'Decimated';
  if (soldiers < 15) return 'Weakened';
  if (soldiers < 30) return 'Stable';
  return 'Strong';
}

// ─── SCORE HELPERS ────────────────────────────────────────────────────────────

export function computeScores(publicState, financeState, defenceState) {
  return {
    turnssurvived: publicState.turnNumber - 1,
    citiesBuilt: financeState ? financeState.cities : 0,
    soldiersRemaining: defenceState ? defenceState.soldiers : 0,
  };
}

// ─── INPUT VALIDATION ─────────────────────────────────────────────────────────

/**
 * Parses a positive integer from a string input field.
 * Returns { value: number } or { error: string }.
 */
export function parsePositiveInt(raw) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n <= 0) return { error: 'Please enter a positive whole number.' };
  return { value: n };
}

// ─── ACTION TOKEN ─────────────────────────────────────────────────────────────

/**
 * Generates a unique action token for idempotency.
 * Each button click generates a new token; if the same token reaches Firebase
 * twice (e.g. due to double-click), the second write is ignored.
 */
export function newToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── PHASE HELPERS ────────────────────────────────────────────────────────────

export function phaseName(phase) {
  const names = {
    finance: 'Finance Phase',
    defence: 'Defence Phase',
    attack: 'Resolving Attack…',
    gameover: 'Game Over',
  };
  return names[phase] || phase;
}

export function phaseDescription(phase, myRole) {
  if (phase === 'finance' && myRole === 'finance') return 'Your turn — manage the treasury.';
  if (phase === 'finance' && myRole === 'defence') return 'Waiting for Minister of Finance…';
  if (phase === 'defence' && myRole === 'defence') return 'Your turn — command the army.';
  if (phase === 'defence' && myRole === 'finance') return 'Waiting for Minister of Defence…';
  if (phase === 'attack') return 'The enemy is attacking…';
  if (phase === 'gameover') return 'The country has fallen.';
  return '';
}

export function isMyPhase(phase, myRole) {
  if (phase === 'finance' && myRole === 'finance') return true;
  if (phase === 'defence' && myRole === 'defence') return true;
  return false;
}
