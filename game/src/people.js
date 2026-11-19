// People on foot: pedestrians who stroll the sidewalks and flee from danger, foot
// police who chase the player, and the gang members who guard mission spots.
import { ROAD_HALF, ROAD_LINES, WORLD } from './config.js';
import { collideCircle, isOnRoad } from './city.js';

let nextId = 1;

const SKINS = ['#e8b98a', '#c98a5e', '#8a5e3d', '#f2d0a8', '#a06a42'];
const SHIRTS = ['#d94f3d', '#3d7bd9', '#3da35a', '#e8c832', '#8a6f9e', '#e07b2e', '#4a4a55', '#7fd4d9'];

export function makePedestrian(x, y, random) {
  return {
    id: nextId += 1,
    kind: 'ped',
    x, y,
    angle: random() * Math.PI * 2,
    speed: 40 + random() * 45,
    skin: SKINS[Math.floor(random() * SKINS.length)],
    shirt: SHIRTS[Math.floor(random() * SHIRTS.length)],
    hp: 30,
    flee: 0,
    wander: 1 + random() * 3,
    alive: true,
    dead: false,
  };
}

export function makeCop(x, y) {
  return {
    id: nextId += 1,
    kind: 'cop',
    x, y,
    angle: 0, speed: 200,
    skin: '#e8b98a', shirt: '#1c4fd6',
    hp: 60, flee: 0, wander: 0, alive: true, dead: false,
    shootCooldown: 0,
  };
}

export function makeGang(x, y, random) {
  return {
    id: nextId += 1,
    kind: 'gang',
    x, y,
    angle: random() * Math.PI * 2,
    speed: 150,
    skin: SKINS[Math.floor(random() * SKINS.length)],
    shirt: '#5a2b2b',
    hp: 70, flee: 0, wander: 0, alive: true, dead: false,
    shootCooldown: 1 + random(),
  };
}

function nearestLine(value) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  return best;
}

/** Pedestrians walk along sidewalks; when scared they run away from the danger point. */
export function updatePedestrian(city, ped, danger, dt, random) {
  if (!ped.alive) return;
  ped.wander -= dt;
  if (ped.wander <= 0) {
    ped.wander = 1 + random() * 4;
    // Pick a direction along the nearest road, on its sidewalk.
    const alongX = Math.abs(ped.x - nearestLine(ped.x)) > Math.abs(ped.y - nearestLine(ped.y));
    ped.angle = alongX ? (random() < 0.5 ? 0 : Math.PI) : (random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
  }
  let speed = ped.speed;
  let angle = ped.angle;
  if (ped.flee > 0) {
    ped.flee -= dt;
    speed = 260;
    if (danger) angle = Math.atan2(ped.y - danger.y, ped.x - danger.x);
  }
  const nx = ped.x + Math.cos(angle) * speed * dt;
  const ny = ped.y + Math.sin(angle) * speed * dt;
  const fixed = collideCircle(city, nx, ny, 12);
  ped.x = fixed.x;
  ped.y = fixed.y;
  ped.angle = angle;
  // Stay out of the sea.
  if (ped.x < 80) ped.x = 80;
}

/** A foot cop runs at the player and shoots when close. */
export function updateCop(city, cop, target, dt) {
  if (!cop.alive) return;
  const dx = target.x - cop.x;
  const dy = target.y - cop.y;
  const dist = Math.hypot(dx, dy);
  cop.angle = Math.atan2(dy, dx);
  if (dist > 130) {
    const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
    const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
    const fixed = collideCircle(city, nx, ny, 12);
    cop.x = fixed.x;
    cop.y = fixed.y;
  }
  cop.shootCooldown -= dt;
}

/** A gang member holds its ground and shoots at the player when in range. */
export function updateGang(city, gang, target, dt) {
  if (!gang.alive) return;
  const dx = target.x - gang.x;
  const dy = target.y - gang.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 420) {
    gang.angle = Math.atan2(dy, dx);
    if (dist > 200) {
      const nx = gang.x + Math.cos(gang.angle) * gang.speed * dt;
      const ny = gang.y + Math.sin(gang.angle) * gang.speed * dt;
      const fixed = collideCircle(city, nx, ny, 12);
      gang.x = fixed.x;
      gang.y = fixed.y;
    }
  }
  gang.shootCooldown -= dt;
}

/** Spawn a pedestrian on a sidewalk near (x, y). */
export function spawnPedestrian(x, y, random) {
  const nearLines = ROAD_LINES.filter((line) => Math.abs(line - x) < 900 || Math.abs(line - y) < 900);
  const line = nearLines[Math.floor(random() * nearLines.length)];
  // A line near x is a vertical road (the walker strolls along y); near y, horizontal.
  const axis = Math.abs(line - x) <= Math.abs(line - y) ? 'y' : 'x';
  const along = (axis === 'x' ? x : y) + (random() < 0.5 ? -1 : 1) * (380 + random() * 460);
  const side = random() < 0.5 ? -1 : 1;
  const px = axis === 'x' ? along : line + side * (ROAD_HALF - 8);
  const py = axis === 'x' ? line + side * (ROAD_HALF - 8) : along;
  return makePedestrian(Math.max(90, Math.min(WORLD - 90, px)), Math.max(90, Math.min(WORLD - 90, py)), random);
}
