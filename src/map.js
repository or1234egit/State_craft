// src/map.js — Canvas 2D game renderer
// Draws a real top-down 2D world with terrain tiles, buildings as pixel-art style sprites,
// animated soldier figures, parallax sky, and a dramatic battle sequence.

import { BUILDINGS, UNITS, mapEra } from './game.js';

// ─── DETERMINISTIC OFFSET ────────────────────────────────────────────────────
// Returns a stable integer in [-range, +range] based on a seed string.
// Replaces Math.random() so building positions never jump on re-render.
function hashOffset(seed, range) {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) & 0xffffffff;
  return (((h >>> 0) % (range * 2 + 1)) - range);
}

// ─── CANVAS SETUP ────────────────────────────────────────────────────────────
let canvas, ctx, animFrame, battleAnim = null;

export function initMap(container) {
  container.innerHTML = '';
  canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;';
  container.appendChild(canvas);

  // Use ResizeObserver so we get real dimensions after layout
  const ro = new ResizeObserver(entries => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        canvas.width  = Math.floor(width);
        canvas.height = Math.floor(height);
        ctx = canvas.getContext('2d');
        // Redraw if we have pending state
        if (_lastState) drawWorld(
          _lastState.buildings, _lastState.unitCounts,
          _lastState.deployedUnits, _lastState.era, _lastState.turn, 0
        );
      }
    }
  });
  ro.observe(container);
}

// Cache last render state so ResizeObserver can redraw
let _lastState = null;

function resizeCanvas(container) {
  if (!canvas) return;
  const w = container.offsetWidth, h = container.offsetHeight;
  if (w > 0 && h > 0) { canvas.width = w; canvas.height = h; }
}

// ─── MAIN RENDER ENTRY ───────────────────────────────────────────────────────
export function renderMap(container, { buildings, unitCounts, deployedUnits, phase, turn }) {
  if (!canvas || !ctx || !canvas.isConnected) initMap(container);

  const era = mapEra(buildings || {});

  // Cache for resize redraws
  _lastState = { buildings: buildings||{}, unitCounts: unitCounts||{},
                 deployedUnits: deployedUnits||{}, era, turn };

  // Don't draw if canvas has no size yet (ResizeObserver will trigger later)
  if (!ctx || canvas.width === 0 || canvas.height === 0) return;

  cancelAnimationFrame(animFrame);

  if (phase === 'attack' && battleAnim) {
    runBattleAnimation(buildings, unitCounts, deployedUnits, era, turn);
  } else {
    battleAnim = null;
    drawWorld(buildings || {}, unitCounts || {}, deployedUnits || {}, era, turn, 0);
  }
}

// ─── WORLD DRAW ──────────────────────────────────────────────────────────────
function drawWorld(buildings, unitCounts, deployedUnits, era, turn, tick) {
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  drawSky(era, W, H, tick);
  drawTerrain(era, W, H);
  drawPaths(era, W, H);
  drawBuildings(buildings, era, W, H);
  drawWalls(buildings, era, W, H);
  drawSoldierFormation(unitCounts, deployedUnits, era, W, H, tick);
  drawHUD(era, turn, W, H);
}

// ─── SKY ─────────────────────────────────────────────────────────────────────
function drawSky(era, W, H) {
  const skies = {
    primitive: ['#1a2e1a', '#0d1a0d'],
    medieval:  ['#0f1525', '#1a0f2e'],
    advanced:  ['#040810', '#0a0520'],
  };
  const [top, bot] = skies[era];
  const grad = ctx.createLinearGradient(0, 0, 0, H * 0.55);
  grad.addColorStop(0, top);
  grad.addColorStop(1, bot);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H * 0.55);

  // Stars
  if (era !== 'primitive') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 60; i++) {
      const x = ((i * 137 + 31) % W);
      const y = ((i * 79  + 17) % (H * 0.4));
      const r = i % 5 === 0 ? 1.5 : 0.8;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
  }

  // Moon / Sun
  if (era === 'primitive') {
    ctx.fillStyle = '#e8d870';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.12, 18, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8b850';
    ctx.beginPath(); ctx.arc(W * 0.82, H * 0.12, 18, 0, Math.PI * 2);
    ctx.arc(W * 0.82 + 6, H * 0.12 - 4, 16, 0, Math.PI * 2, true); ctx.fill();
  } else if (era === 'medieval') {
    ctx.fillStyle = 'rgba(220,200,180,0.9)';
    ctx.beginPath(); ctx.arc(W * 0.15, H * 0.1, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(180,160,140,0.6)';
    ['crater1','crater2','crater3'].forEach((_, i) => {
      ctx.beginPath(); ctx.arc(W*0.15 + (i-1)*7, H*0.1 + (i%2)*5, 4+i*1.5, 0, Math.PI*2); ctx.fill();
    });
  } else {
    // Advanced: glowing moons + aurora
    const auroraGrad = ctx.createLinearGradient(0, 0, W, 0);
    auroraGrad.addColorStop(0,   'rgba(0,255,180,0)');
    auroraGrad.addColorStop(0.3, 'rgba(0,200,255,0.08)');
    auroraGrad.addColorStop(0.7, 'rgba(100,0,255,0.06)');
    auroraGrad.addColorStop(1,   'rgba(0,255,180,0)');
    ctx.fillStyle = auroraGrad;
    ctx.fillRect(0, H * 0.05, W, H * 0.25);

    ctx.shadowColor = '#00eeff'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#aaeeff';
    ctx.beginPath(); ctx.arc(W * 0.75, H * 0.1, 14, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

// ─── TERRAIN ─────────────────────────────────────────────────────────────────
function drawTerrain(era, W, H) {
  const horizonY = H * 0.52;

  // Ground base
  const groundColors = {
    primitive: ['#2a4a1a', '#1e3610'],
    medieval:  ['#1e2e1a', '#141e10'],
    advanced:  ['#0a1020', '#050810'],
  };
  const [gc1, gc2] = groundColors[era];
  const gGrad = ctx.createLinearGradient(0, horizonY, 0, H);
  gGrad.addColorStop(0, gc1);
  gGrad.addColorStop(1, gc2);
  ctx.fillStyle = gGrad;
  ctx.fillRect(0, horizonY, W, H - horizonY);

  // Grass texture — rows of dots / lines
  if (era === 'primitive') {
    ctx.fillStyle = 'rgba(60,120,30,0.25)';
    for (let row = 0; row < 8; row++) {
      const y = horizonY + row * (H - horizonY) / 8 + 4;
      for (let col = 0; col < W / 12; col++) {
        const x = col * 12 + (row % 2) * 6;
        ctx.fillRect(x, y, 2, 3 + row * 0.3);
      }
    }
  } else if (era === 'medieval') {
    // Stone cobble pattern
    ctx.fillStyle = 'rgba(80,70,60,0.3)';
    for (let row = 0; row < 6; row++) {
      const y = horizonY + row * 20 + 10;
      for (let col = 0; col < W / 30; col++) {
        const x = col * 30 + (row % 2) * 15;
        ctx.strokeStyle = 'rgba(60,50,40,0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 2, y + 2, 26, 14);
      }
    }
  } else {
    // Advanced: glowing grid
    ctx.strokeStyle = 'rgba(0,200,255,0.08)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, horizonY); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = horizonY; y < H; y += 30) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  // Horizon fog
  const fogGrad = ctx.createLinearGradient(0, horizonY - 30, 0, horizonY + 40);
  fogGrad.addColorStop(0, 'rgba(0,0,0,0)');
  fogGrad.addColorStop(0.5, era === 'advanced' ? 'rgba(0,30,60,0.4)' : 'rgba(0,0,0,0.3)');
  fogGrad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = fogGrad;
  ctx.fillRect(0, horizonY - 30, W, 70);

  // Mountains / hills silhouette
  ctx.fillStyle = era === 'advanced' ? 'rgba(10,20,50,0.8)' :
                  era === 'medieval'  ? 'rgba(20,15,10,0.7)' :
                                        'rgba(15,25,10,0.7)';
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  const peaks = era === 'advanced'
    ? [[0.05,0.35],[0.18,0.15],[0.3,0.3],[0.45,0.1],[0.6,0.25],[0.75,0.08],[0.88,0.2],[1,0.32]]
    : [[0,0.4],[0.1,0.25],[0.22,0.38],[0.35,0.18],[0.5,0.32],[0.65,0.12],[0.78,0.28],[0.9,0.2],[1,0.35]];
  peaks.forEach(([px, py]) => ctx.lineTo(W * px, horizonY - H * py * 0.25));
  ctx.lineTo(W, horizonY);
  ctx.closePath();
  ctx.fill();
}

// ─── PATHS ───────────────────────────────────────────────────────────────────
function drawPaths(era, W, H) {
  const horizonY = H * 0.52;
  const pathColor = era === 'advanced' ? 'rgba(0,160,220,0.25)' :
                    era === 'medieval'  ? 'rgba(120,100,60,0.5)' :
                                          'rgba(100,80,40,0.4)';
  ctx.strokeStyle = pathColor;
  ctx.lineWidth   = era === 'advanced' ? 3 : 5;
  ctx.lineCap     = 'round';
  ctx.setLineDash(era === 'advanced' ? [8, 6] : []);

  // Main path from bottom center to castle (center)
  ctx.beginPath();
  ctx.moveTo(W * 0.5, H);
  ctx.quadraticCurveTo(W * 0.5, H * 0.75, W * 0.5, H * 0.62);
  ctx.stroke();

  // Branch paths
  [[0.5, 0.62, 0.25, 0.58], [0.5, 0.62, 0.75, 0.58],
   [0.5, 0.62, 0.5,  0.55]].forEach(([x1,y1,x2,y2]) => {
    ctx.beginPath();
    ctx.moveTo(W*x1, H*y1);
    ctx.lineTo(W*x2, H*y2);
    ctx.stroke();
  });
  ctx.setLineDash([]);
}

// ─── BUILDINGS ────────────────────────────────────────────────────────────────
// Positioned zones (x%, y% of canvas) — each zone hosts different building types
const ZONE_LAYOUT = {
  castle:     { x: 0.50, y: 0.60, scale: 1.2 },
  north:      { x: 0.50, y: 0.55, scale: 0.9 },
  west:       { x: 0.28, y: 0.60, scale: 0.85 },
  east:       { x: 0.72, y: 0.60, scale: 0.85 },
  southwest:  { x: 0.20, y: 0.70, scale: 0.8 },
  southeast:  { x: 0.80, y: 0.70, scale: 0.8 },
  border_w:   { x: 0.08, y: 0.63, scale: 0.75 },
  border_e:   { x: 0.92, y: 0.63, scale: 0.75 },
};

const BUILDING_ZONES = {
  farm:       ['southwest','southeast','west','east'],
  market:     ['west','east','castle'],
  granary:    ['southwest','southeast'],
  blacksmith: ['east','west'],
  city:       ['castle','north','west','east'],
  wall:       ['border_w','border_e'],
  tower:      ['border_w','border_e','castle'],
  cathedral:  ['castle','north'],
};

function drawBuildings(buildings, era, W, H) {
  const placed = assignZones(buildings);
  placed.forEach(({ zoneId, buildingId, offsetX, offsetY }) => {
    const zone = ZONE_LAYOUT[zoneId];
    if (!zone) return;
    const x = W * zone.x + offsetX;
    const y = H * zone.y + offsetY;
    const s = zone.scale;
    drawBuildingSprite(buildingId, era, x, y, s);
  });
}

function assignZones(buildings) {
  const result = [];
  const zoneSlots = {}; // how many sprites already placed per zone
  for (const [id, count] of Object.entries(buildings || {})) {
    const prefs   = BUILDING_ZONES[id] || ['castle'];
    const visible = Math.min(count, 6); // show up to 6 sprites per building type
    for (let i = 0; i < visible; i++) {
      const zid  = prefs[i % prefs.length];
      const slot = (zoneSlots[zid] = (zoneSlots[zid] || 0) + 1) - 1;
      // Arrange sprites in a small 3-col grid within the zone
      const col  = slot % 3;
      const row  = Math.floor(slot / 3);
      const baseOffX = (col - 1) * 26;
      const baseOffY = row * 22;
      // Stable jitter so sprites don't jump on every state update
      const jitterX = hashOffset(id + zid + i + 'x', 6);
      const jitterY = hashOffset(id + zid + i + 'y', 4);
      result.push({ zoneId: zid, buildingId: id,
                    offsetX: baseOffX + jitterX, offsetY: baseOffY + jitterY });
    }
  }
  return result;
}

// Draw a building as a pixel-style sprite using Canvas primitives
function drawBuildingSprite(id, era, x, y, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  const eraShift = era === 'advanced' ? 2 : era === 'medieval' ? 1 : 0;

  switch(id) {
    case 'farm':      drawFarm(eraShift);    break;
    case 'market':    drawMarket(eraShift);  break;
    case 'granary':   drawGranary(eraShift); break;
    case 'blacksmith':drawSmith(eraShift);   break;
    case 'city':      drawCity(eraShift);    break;
    case 'wall':      /* walls drawn separately */ break;
    case 'tower':     drawTower(eraShift);   break;
    case 'cathedral': drawCathedral(eraShift);break;
  }

  ctx.restore();
}

// ── Individual sprite drawers ──────────────────────────────────────────────
function drawFarm(era) {
  // Field rows
  const colors = [['#3a6020','#2a4a14'],['#5a8030','#4a6820'],['#6a9040','#5a7830']];
  const [c1,c2] = colors[Math.min(era, 2)];
  for (let i = 0; i < 3; i++) {
    ctx.fillStyle = i % 2 === 0 ? c1 : c2;
    ctx.fillRect(-18 + i*12, -8, 10, 16);
  }
  // Farmhouse
  ctx.fillStyle = era === 2 ? '#d0c080' : '#a07850';
  ctx.fillRect(-6, -14, 14, 12);
  ctx.fillStyle = era === 2 ? '#4080c0' : '#703020';
  ctx.beginPath(); ctx.moveTo(-8,-14); ctx.lineTo(1,-22); ctx.lineTo(10,-14); ctx.closePath(); ctx.fill();
}

function drawMarket(era) {
  // Stall awning
  const awning = era === 2 ? '#2060c0' : era === 1 ? '#c04020' : '#804020';
  ctx.fillStyle = awning;
  ctx.fillRect(-16, -18, 32, 6);
  // Stripes
  ctx.fillStyle = era === 2 ? '#60a0ff' : '#ffcc60';
  for (let i = 0; i < 4; i++) ctx.fillRect(-16 + i*8, -18, 4, 6);
  // Stall walls
  ctx.fillStyle = era === 2 ? '#102040' : '#503010';
  ctx.fillRect(-14, -12, 28, 14);
  // Window
  ctx.fillStyle = era === 2 ? '#00ffcc' : '#ffdd88';
  ctx.fillRect(-8, -10, 8, 7);
  ctx.fillRect(2, -10, 8, 7);
}

function drawGranary(era) {
  ctx.fillStyle = era === 2 ? '#405060' : '#806040';
  ctx.fillRect(-10, -20, 20, 22);
  // Dome top
  ctx.fillStyle = era === 2 ? '#6080a0' : '#a08060';
  ctx.beginPath(); ctx.ellipse(0, -20, 11, 8, 0, Math.PI, 0); ctx.fill();
  // Door
  ctx.fillStyle = '#000';
  ctx.fillRect(-4, -5, 8, 7);
}

function drawSmith(era) {
  // Main building
  ctx.fillStyle = era === 2 ? '#303040' : '#404030';
  ctx.fillRect(-12, -18, 24, 20);
  // Roof
  ctx.fillStyle = era === 2 ? '#202030' : '#303020';
  ctx.fillRect(-14, -20, 28, 4);
  // Chimney with smoke
  ctx.fillStyle = era === 2 ? '#101020' : '#202010';
  ctx.fillRect(4, -30, 8, 14);
  // Glow from forge
  ctx.fillStyle = 'rgba(255,120,0,0.4)';
  ctx.beginPath(); ctx.ellipse(-2, -8, 6, 4, 0, 0, Math.PI*2); ctx.fill();
  // Smoke puffs
  ctx.fillStyle = 'rgba(150,150,150,0.3)';
  ctx.beginPath(); ctx.arc(8, -32, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(10, -38, 3, 0, Math.PI*2); ctx.fill();
}

function drawCity(era) {
  if (era === 0) {
    // Primitive: wooden longhouse
    ctx.fillStyle = '#6a4020';
    ctx.fillRect(-18, -16, 36, 18);
    ctx.fillStyle = '#4a2810';
    ctx.beginPath(); ctx.moveTo(-20,-16); ctx.lineTo(0,-26); ctx.lineTo(20,-16); ctx.closePath(); ctx.fill();
  } else if (era === 1) {
    // Medieval: castle keep
    ctx.fillStyle = '#706050';
    ctx.fillRect(-16, -32, 32, 34);
    ctx.fillStyle = '#606040';
    ctx.fillRect(-20, -32, 8, 20); // left tower
    ctx.fillRect(12, -32, 8, 20);  // right tower
    // Battlements
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = '#706050';
      ctx.fillRect(-20 + i*10, -38, 6, 8);
    }
    // Gate
    ctx.fillStyle = '#201810';
    ctx.fillRect(-6, -10, 12, 12);
    ctx.beginPath(); ctx.arc(0, -10, 6, Math.PI, 0); ctx.fill();
    // Banner
    ctx.fillStyle = '#c03020';
    ctx.fillRect(0, -42, 2, 12);
    ctx.fillRect(2, -42, 8, 7);
  } else {
    // Advanced: futuristic tower
    ctx.fillStyle = '#102030';
    ctx.fillRect(-10, -50, 20, 52);
    ctx.fillStyle = '#203040';
    ctx.fillRect(-14, -18, 28, 20);  // base
    // Windows glow
    ctx.fillStyle = 'rgba(0,200,255,0.8)';
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(-6, -44 + i*8, 12, 3);
    }
    // Antenna
    ctx.strokeStyle = '#00eeff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0,-50); ctx.lineTo(0,-62); ctx.stroke();
    // Glow top
    ctx.shadowColor = '#00eeff'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#00eeff';
    ctx.beginPath(); ctx.arc(0,-62,3,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawTower(era) {
  const wallColor = era === 2 ? '#203050' : era === 1 ? '#605040' : '#504030';
  ctx.fillStyle = wallColor;
  ctx.fillRect(-7, -40, 14, 42);
  // Battlements
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-7 + i*5, -46, 3, 7);
  }
  // Arrow slits
  ctx.fillStyle = era === 2 ? 'rgba(0,200,255,0.7)' : 'rgba(255,200,100,0.5)';
  ctx.fillRect(-3, -30, 6, 3);
  ctx.fillRect(-3, -20, 6, 3);
  if (era === 2) {
    ctx.shadowColor = '#00eeff'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#00ccff';
    ctx.fillRect(-3, -30, 6, 3);
    ctx.shadowBlur = 0;
  }
}

function drawCathedral(era) {
  if (era === 0) {
    // Primitive shrine
    ctx.fillStyle = '#605040';
    ctx.fillRect(-8, -20, 16, 22);
    ctx.fillStyle = '#504030';
    ctx.beginPath(); ctx.moveTo(-10,-20); ctx.lineTo(0,-30); ctx.lineTo(10,-20); ctx.closePath(); ctx.fill();
  } else if (era === 1) {
    // Gothic cathedral
    ctx.fillStyle = '#706858';
    ctx.fillRect(-18, -30, 36, 32);
    // Spires
    ctx.fillStyle = '#605848';
    ctx.fillRect(-20, -30, 8, 32);
    ctx.fillRect(12, -30, 8, 32);
    ctx.beginPath(); ctx.moveTo(-20,-30); ctx.lineTo(-16,-48); ctx.lineTo(-12,-30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(12,-30); ctx.lineTo(16,-48); ctx.lineTo(20,-30); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-6,-30); ctx.lineTo(0,-52); ctx.lineTo(6,-30); ctx.closePath(); ctx.fill();
    // Rose window
    ctx.fillStyle = 'rgba(200,150,50,0.7)';
    ctx.beginPath(); ctx.arc(0, -18, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,80,0.9)';
    for (let i = 0; i < 8; i++) {
      const a = (i/8)*Math.PI*2;
      ctx.beginPath(); ctx.arc(Math.cos(a)*5, -18+Math.sin(a)*5, 2, 0, Math.PI*2); ctx.fill();
    }
  } else {
    // Advanced: energy temple
    ctx.fillStyle = '#101828';
    ctx.fillRect(-16, -36, 32, 38);
    ctx.fillStyle = '#182030';
    ctx.beginPath(); ctx.moveTo(-18,-36); ctx.lineTo(0,-54); ctx.lineTo(18,-36); ctx.closePath(); ctx.fill();
    ctx.shadowColor = '#8040ff'; ctx.shadowBlur = 15;
    ctx.fillStyle = 'rgba(140,80,255,0.6)';
    ctx.beginPath(); ctx.arc(0,-46,6,0,Math.PI*2); ctx.fill();
    ctx.shadowBlur = 0;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = `rgba(120,60,255,${0.2+i*0.1})`;
      ctx.fillRect(-14+i*2, -30+i*6, 28-i*4, 3);
    }
  }
}

// ─── WALLS ────────────────────────────────────────────────────────────────────
function drawWalls(buildings, era, W, H) {
  const wallCount = (buildings.wall || 0) + (buildings.tower || 0);
  if (!wallCount) return;

  const horizonY = H * 0.52;
  const y        = horizonY + (H - horizonY) * 0.18;
  const wallColor = era === 'advanced' ? '#0a2040' : era === 'medieval' ? '#504030' : '#403020';
  const crenColor = era === 'advanced' ? '#0d2850' : era === 'medieval' ? '#604838' : '#503828';

  ctx.fillStyle = wallColor;
  const wallH = 28 + wallCount * 4;

  // Left wall segment
  ctx.fillRect(W * 0.05, y - wallH, W * 0.3, wallH);
  // Right wall segment
  ctx.fillRect(W * 0.65, y - wallH, W * 0.3, wallH);

  // Battlements
  ctx.fillStyle = crenColor;
  const gap = 18;
  for (let side = 0; side < 2; side++) {
    const startX = side === 0 ? W * 0.05 : W * 0.65;
    const endX   = side === 0 ? W * 0.35 : W * 0.95;
    for (let x = startX; x < endX; x += gap) {
      ctx.fillRect(x, y - wallH - 10, 10, 12);
    }
  }

  // Gate gap in center
  ctx.fillStyle = era === 'advanced' ? '#030608' : '#201410';
  ctx.fillRect(W * 0.38, y - wallH, W * 0.24, wallH);

  // Gate arch
  ctx.fillStyle = crenColor;
  ctx.fillRect(W * 0.42, y - wallH, W * 0.16, 8);

  // Advanced: energy glow on walls
  if (era === 'advanced') {
    ctx.strokeStyle = 'rgba(0,150,255,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(W * 0.05, y - wallH, W * 0.3, wallH);
    ctx.strokeRect(W * 0.65, y - wallH, W * 0.3, wallH);
  }
}

// ─── SOLDIER FORMATION ────────────────────────────────────────────────────────
function drawSoldierFormation(unitCounts, deployedUnits, era, W, H, tick) {
  const totalUnits = Object.values(unitCounts || {}).reduce((a,b)=>a+b,0);
  if (!totalUnits) return;

  const cx = W * 0.5;
  const cy = H * 0.72;
  const cols = 8;

  let unitList = [];
  for (const [id, count] of Object.entries(unitCounts || {})) {
    for (let i = 0; i < Math.min(count, 5); i++) unitList.push(id);
  }
  unitList = unitList.slice(0, 20);

  unitList.forEach((id, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = cx - (Math.min(unitList.length, cols) - 1) * 18 / 2 + col * 18;
    const bobY = Math.sin(tick * 0.04 + i * 0.6) * 1.5;
    const y    = cy + row * 20 + bobY;
    drawSoldierSprite(id, era, x, y, 1.0, false);
  });

  // Count badge
  if (totalUnits > 20) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(cx - 30, cy + 42, 60, 16);
    ctx.fillStyle = '#aaffaa';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`+${totalUnits - 20} more`, cx, cy + 53);
  }
}

// Draw a soldier sprite using primitives
function drawSoldierSprite(unitId, era, x, y, scale, facingLeft) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facingLeft ? -scale : scale, scale);

  const colors = {
    primitive:  { body: '#4a3a2a', helm: '#6a5a3a', weapon: '#8a7a5a' },
    medieval:   { body: '#3a4a6a', helm: '#8a8a8a', weapon: '#c0c0c0' },
    advanced:   { body: '#1a3a5a', helm: '#4a8aaa', weapon: '#00ccff' },
  };
  const c = colors[era] || colors.medieval;

  // Special colors per unit type
  const unitColors = {
    cavalry:  { body: '#4a3020', helm: '#8a6840', weapon: '#c09060' },
    knight:   { body: '#2a2a4a', helm: '#aaaacc', weapon: '#e0e0ff' },
    siege:    { body: '#3a2a2a', helm: '#5a5a5a', weapon: '#808080' },
    paladin:  { body: '#3a2010', helm: '#d0a030', weapon: '#ffe060' },
    archer:   { body: '#2a4a1a', helm: '#4a6a2a', weapon: '#a07040' },
  };
  const uc = unitColors[unitId] || c;

  // Body
  ctx.fillStyle = uc.body;
  ctx.fillRect(-3, -12, 6, 8);
  // Head
  ctx.fillStyle = uc.helm;
  ctx.fillRect(-3, -18, 6, 6);
  // Legs
  ctx.fillStyle = uc.body;
  ctx.fillRect(-3, -4, 2, 5);
  ctx.fillRect(1, -4, 2, 5);

  // Unit-specific weapon/mount
  if (unitId === 'cavalry') {
    // Horse body
    ctx.fillStyle = '#704828';
    ctx.fillRect(2, -8, 12, 6);
    ctx.fillRect(12, -6, 3, 3);
    ctx.fillRect(3, -2, 2, 5);
    ctx.fillRect(8, -2, 2, 5);
    // Rider lance
    ctx.strokeStyle = uc.weapon; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,-14); ctx.lineTo(14,-8); ctx.stroke();
  } else if (unitId === 'archer') {
    // Bow
    ctx.strokeStyle = uc.weapon; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(6, -14, 6, -Math.PI*0.7, Math.PI*0.7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6,-18); ctx.lineTo(6,-8); ctx.stroke();
  } else if (unitId === 'siege') {
    // Ballista
    ctx.fillStyle = '#606060';
    ctx.fillRect(4, -16, 10, 6);
    ctx.strokeStyle = '#808080'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(9,-16); ctx.lineTo(18,-20); ctx.stroke();
  } else {
    // Sword / shield
    ctx.strokeStyle = uc.weapon; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(4,-16); ctx.lineTo(4,-6); ctx.stroke();
    ctx.fillStyle = uc.helm;
    ctx.fillRect(-6,-14,3,8);
  }

  ctx.restore();
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
function drawHUD(era, turn, W, H) {
  const eraNames  = { primitive:'⚔ Age of Settlements', medieval:'🏰 Medieval Era', advanced:'🌟 Age of Wonders' };
  const eraColors = { primitive:'#a09060', medieval:'#c0b080', advanced:'#60c0ff' };

  // Era label — top left
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(8, 8, 200, 24);
  ctx.fillStyle = eraColors[era];
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText(eraNames[era], 14, 24);

  // Turn badge — top right
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(W - 72, 8, 64, 24);
  ctx.fillStyle = '#e0d0a0';
  ctx.textAlign = 'right';
  ctx.fillText(`Turn ${turn}`, W - 14, 24);
}

// ─── BATTLE ANIMATION ────────────────────────────────────────────────────────
export function startBattleAnimation(container, buildings, unitCounts, deployedUnits, era, turn) {
  if (!canvas || !ctx) initMap(container);
  battleAnim = { tick: 0, phase: 'approach', buildings, unitCounts, deployedUnits, era, turn };
  runBattleAnimation(buildings, unitCounts, deployedUnits, era, turn);
}

function runBattleAnimation(buildings, unitCounts, deployedUnits, era, turn) {
  if (!battleAnim) return;
  const W = canvas.width, H = canvas.height;
  const tick = battleAnim.tick++;

  // Draw base world
  drawWorld(buildings, unitCounts, deployedUnits, era, turn, tick);

  const APPROACH_END = 60;
  const CLASH_END    = 90;
  const RETREAT_END  = 130;

  if (tick < APPROACH_END) {
    // Enemies march in from the right
    const progress = tick / APPROACH_END;
    const count    = 8;
    for (let i = 0; i < count; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const startX = W + 40;
      const targetX = W * 0.7 + col * 22;
      const x = startX + (targetX - startX) * easeOut(progress);
      const y = H * 0.62 + row * 22;
      drawEnemySprite(era, x + Math.sin(tick * 0.4 + i) * 2, y);
    }
    // Dust cloud at approach
    if (progress > 0.5) drawDustCloud(W * 0.8, H * 0.65, (progress - 0.5) * 2);

  } else if (tick < CLASH_END) {
    // Clash! Flash + particles
    const t = (tick - APPROACH_END) / (CLASH_END - APPROACH_END);
    drawClashEffect(W * 0.65, H * 0.65, t);

    // Remaining soldiers stumble back
    const soldiers = Object.keys(unitCounts || {}).slice(0, 6);
    soldiers.forEach((id, i) => {
      const wobble = Math.sin(tick * 0.5 + i) * 3;
      drawSoldierSprite(id, era, W * 0.45 + i * 14 + wobble, H * 0.68 + wobble, 1.0, false);
    });
    const enemies = 5;
    for (let i = 0; i < enemies; i++) {
      drawEnemySprite(era, W * 0.68 + i * 18 + Math.sin(tick*0.4+i)*3, H * 0.63 + i*8);
    }

  } else if (tick < RETREAT_END) {
    // Enemies retreat right; survivors stand victorious (or bloodied)
    const t = (tick - CLASH_END) / (RETREAT_END - CLASH_END);
    const enemies = 5;
    for (let i = 0; i < enemies; i++) {
      const x = W * 0.68 + i * 18 + t * W * 0.5;
      drawEnemySprite(era, x, H * 0.63 + i*8, 0.7);
    }
    const survivors = Object.keys(unitCounts || {}).slice(0, 5);
    survivors.forEach((id, i) => {
      drawSoldierSprite(id, era, W * 0.43 + i * 16, H * 0.68, 1.0, false);
    });
  }

  if (tick < RETREAT_END) {
    animFrame = requestAnimationFrame(() => runBattleAnimation(buildings, unitCounts, deployedUnits, era, turn));
  } else {
    battleAnim = null;
  }
}

function drawEnemySprite(era, x, y, scale = 1.0) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale, scale);

  // Enemy body (red/dark)
  ctx.fillStyle = '#601010';
  ctx.fillRect(-3, -12, 6, 8);
  ctx.fillStyle = '#801818';
  ctx.fillRect(-3, -18, 6, 6);
  ctx.fillStyle = '#601010';
  ctx.fillRect(-3, -4, 2, 5);
  ctx.fillRect(1, -4, 2, 5);
  // Horned helm
  ctx.fillStyle = '#502020';
  ctx.fillRect(-4, -21, 3, 5); // left horn
  ctx.fillRect(1, -21, 3, 5);  // right horn
  // Axe
  ctx.fillStyle = '#808080';
  ctx.fillRect(-8, -16, 5, 12);
  ctx.fillRect(-10, -18, 9, 5);

  ctx.restore();
}

function drawClashEffect(cx, cy, t) {
  // Bright flash
  const alpha = Math.sin(t * Math.PI) * 0.6;
  ctx.fillStyle = `rgba(255,200,50,${alpha})`;
  ctx.beginPath(); ctx.arc(cx, cy, 40 * t + 10, 0, Math.PI*2); ctx.fill();

  // Spark particles
  const sparks = 12;
  for (let i = 0; i < sparks; i++) {
    const angle  = (i / sparks) * Math.PI * 2;
    const dist   = t * 60;
    const sx     = cx + Math.cos(angle) * dist;
    const sy     = cy + Math.sin(angle) * dist;
    const fade   = Math.max(0, 1 - t * 2);
    ctx.fillStyle = `rgba(255,${150+Math.random()*100},0,${fade})`;
    ctx.beginPath(); ctx.arc(sx, sy, 2 + Math.random()*2, 0, Math.PI*2); ctx.fill();
  }

  // Impact text
  if (t < 0.5) {
    ctx.save();
    ctx.globalAlpha = 1 - t * 2;
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${20 + t*10}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('⚔', cx, cy);
    ctx.restore();
  }
}

function drawDustCloud(x, y, alpha) {
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = `rgba(180,150,100,${alpha * 0.15})`;
    ctx.beginPath();
    ctx.arc(x + i * 15, y + Math.sin(i)*8, 14 + i*4, 0, Math.PI*2);
    ctx.fill();
  }
}

function easeOut(t) { return 1 - Math.pow(1 - t, 2); }

// ─── BATTLE RESULT MODAL ─────────────────────────────────────────────────────
export function renderBattleModal(battle, onClose) {
  const existing = document.getElementById('battle-modal');
  if (existing) existing.remove();
  if (!battle) return;

  const win = battle.win;
  const lossLines = Object.entries(battle.unitLosses || {})
    .filter(([,n]) => n > 0)
    .map(([id, n]) => {
      const unit = UNITS[id];
      return `<div class="bl-row loss">${unit?.icon || '⚔️'} Lost ${n}× ${unit?.label || id}</div>`;
    }).join('') || '<div class="bl-row neutral">No casualties</div>';

  const modal = document.createElement('div');
  modal.id = 'battle-modal';
  modal.className = 'battle-modal-overlay';
  modal.innerHTML = `
    <div class="battle-modal ${win ? 'battle-win' : 'battle-loss'}">
      <div class="bm-banner">${win ? '⚔️ VICTORY' : '💥 DEFEAT'}</div>
      <div class="bm-sub">${win ? 'The enemy has been repelled!' : 'The enemy broke through your lines!'}</div>

      <div class="bm-vs-block">
        <div class="bm-side">
          <div class="bm-side-label">ENEMY</div>
          <div class="bm-power enemy-power">${battle.adjEnemy ?? battle.enemyPowerRaw ?? '?'}</div>
          ${(battle.arrows ?? 0) > 0 ? `<div class="bm-detail">−${battle.arrows} from archers</div>` : ''}
        </div>
        <div class="bm-sword">⚔</div>
        <div class="bm-side">
          <div class="bm-side-label">YOUR DEFENCE</div>
          <div class="bm-power def-power">${battle.totalDef ?? '?'}</div>
          ${(battle.staticDef ?? 0) > 0 ? `<div class="bm-detail">+${battle.staticDef} from structures</div>` : ''}
        </div>
      </div>

      <div class="bm-divider"></div>

      <div class="bm-results">
        ${lossLines}
        ${(battle.countryDamage ?? 0) > 0  ? `<div class="bl-row loss">🩸 Country took ${battle.countryDamage} damage</div>` : ''}
        ${(battle.heal ?? 0) > 0            ? `<div class="bl-row gain">💚 Paladin healed +${battle.heal} HP</div>` : ''}
        ${(battle.spoils ?? 0) > 0          ? `<div class="bl-row gain">💰 War spoils: +${battle.spoils} gold</div>` : ''}
        ${(battle.income ?? 0) > 0          ? `<div class="bl-row gain">🏛️ Turn income: +${battle.income} gold</div>` : ''}
        ${(battle.upkeep ?? 0) > 0          ? `<div class="bl-row loss">⚙️ Upkeep: −${battle.upkeep} gold</div>` : ''}
      </div>

      <div class="bm-health">
        <div class="bm-health-label">Country Health after battle</div>
        <div class="bm-health-track">
          <div class="bm-health-fill ${(battle.newHealth ?? 50) > 60 ? 'h-high' : (battle.newHealth ?? 50) > 30 ? 'h-mid' : 'h-low'}"
               style="width:${battle.newHealth ?? 50}%"></div>
        </div>
        <div class="bm-health-val">${battle.newHealth ?? '?'} / 100</div>
      </div>

      <button class="btn btn-primary bm-close" id="bm-close-btn">Continue →</button>
    </div>`;

  document.body.appendChild(modal);

  const close = () => {
    modal.style.transition = 'opacity .25s';
    modal.style.opacity = '0';
    setTimeout(() => { modal.remove(); if (onClose) onClose(); }, 250);
  };
  document.getElementById('bm-close-btn').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
}