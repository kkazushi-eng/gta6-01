// Cars: the player's arcade car physics, the traffic that follows the road grid, and
// the police cars that chase the player. Traffic drives on the right, turns at
// intersections, and brakes for the car ahead; police steer straight at the player.
import { CAR, ROAD_HALF, ROAD_LINES, WORLD } from './config.js';
import { collideCircle, isOnRoad } from './city.js';

let nextId = 1;

export function makeCar(x, y, angle, kind, color) {
  return {
    id: nextId += 1,
    x, y, angle, speed: 0,
    kind: kind || 'traffic', // traffic | parked | police | player
    color: color || '#d94f3d',
    // Traffic state: which road it follows and which way along it.
    axis: 'x', dir: 1, lane: 0,
    driver: kind === 'traffic',
    parked: kind === 'parked',
    stuck: 0, brake: 0, honk: 0,
  };
}

function nearestLine(value) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  return best;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function moveCar(city, car, dt) {
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const fixed = collideCircle(city, nx, ny, CAR.length / 2 - 4);
  const hitWall = fixed.x !== nx || fixed.y !== ny;
  car.x = fixed.x;
  car.y = fixed.y;
  return hitWall;
}

/** Player driving: throttle, brake/reverse and steering that tightens with speed. */
export function drivePlayerCar(city, car, input, dt) {
  const up = input.held.up;
  const down = input.held.down;
  const steer = (input.held.left ? -1 : 0) + (input.held.right ? 1 : 0);
  if (up) car.speed += CAR.accel * dt;
  else if (down) {
    if (car.speed > 20) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * dt;
  } else {
    car.speed -= Math.sign(car.speed) * 120 * dt;
    if (Math.abs(car.speed) < 12) car.speed = 0;
  }
  car.speed = Math.max(-CAR.maxReverse, Math.min(CAR.maxSpeed, car.speed));
  const speedRatio = Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
  car.angle += steer * CAR.steer * (0.5 + speedRatio) * Math.sign(car.speed) * dt;
  const hit = moveCar(city, car, dt);
  if (hit && Math.abs(car.speed) > 120) {
    car.speed *= -0.25;
    return true; // hard crash
  }
  if (hit) car.speed *= 0.5;
  return false;
}

/** One traffic car: cruise along its road, turn at intersections, brake for traffic. */
export function updateTrafficCar(city, car, cars, dt, random) {
  if (car.parked) return;
  const targetSpeed = 150 + car.lane * 20;
  // Look ahead for a car in the way and brake.
  let ahead = null;
  for (const other of cars) {
    if (other === car || other.parked) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 90 && Math.cos(car.angle) * dx + Math.sin(car.angle) * dy > 0) ahead = other;
  }
  if (ahead) car.speed = Math.max(0, car.speed - 500 * dt);
  else car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 0.8);

  const line = nearestLine(car.axis === 'x' ? car.y : car.x);
  const laneOffset = car.dir * (ROAD_HALF * 0.45);
  const wantX = car.axis === 'x' ? car.x : line + laneOffset;
  const wantY = car.axis === 'x' ? line + laneOffset : car.y;
  // Steer toward the lane, then along it.
  const targetAngle = car.axis === 'x'
    ? (car.dir > 0 ? 0 : Math.PI)
    : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
  const toLane = Math.atan2(wantY - car.y, wantX - car.x);
  const distToLane = car.axis === 'x' ? Math.abs(car.y - wantY) : Math.abs(car.x - wantX);
  const steerTo = distToLane > 26 ? toLane : targetAngle;
  car.angle = angleLerp(car.angle, steerTo, Math.min(1, dt * 3.5));

  // At an intersection, sometimes turn onto the crossing road.
  const nearX = Math.abs(car.x - nearestLine(car.x)) < 30;
  const nearY = Math.abs(car.y - nearestLine(car.y)) < 30;
  if (nearX && nearY && random() < dt * 0.35) {
    car.axis = car.axis === 'x' ? 'y' : 'x';
    car.dir = random() < 0.5 ? 1 : -1;
  }
  const hit = moveCar(city, car, dt);
  if (hit) {
    car.stuck += dt;
    if (car.stuck > 1.2) {
      car.angle += Math.PI / 2;
      car.stuck = 0;
    }
  } else car.stuck = 0;
}

/** A police car: steer at the player and ram, with a little wobble so it looks alive. */
export function updatePoliceCar(city, car, target, dt) {
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx) + Math.sin(dist / 160) * 0.12;
  car.angle = angleLerp(car.angle, want, Math.min(1, dt * 4));
  const targetSpeed = dist > 260 ? 540 : 420;
  car.speed += (targetSpeed - car.speed) * Math.min(1, dt * 1.2);
  moveCar(city, car, dt);
}

/** Spawn a traffic or parked car on a road near (x, y): a road line within 900px and a
 * spot along it 400-900px away, so the streets around the player stay busy. */
export function spawnTrafficCarNear(city, x, y, random, kind) {
  const nearLines = ROAD_LINES.filter((line) => Math.abs(line - x) < 900 || Math.abs(line - y) < 900);
  const line = nearLines[Math.floor(random() * nearLines.length)];
  // A line near x is a vertical road (the car travels along y); near y, a horizontal one.
  const axis = Math.abs(line - x) <= Math.abs(line - y) ? 'y' : 'x';
  const along = (axis === 'x' ? x : y) + (random() < 0.5 ? -1 : 1) * (420 + random() * 420);
  const dir = random() < 0.5 ? 1 : -1;
  const car = makeCar(
    axis === 'x' ? Math.max(120, Math.min(WORLD - 120, along)) : line + dir * ROAD_HALF * 0.45,
    axis === 'x' ? line + dir * ROAD_HALF * 0.45 : Math.max(120, Math.min(WORLD - 120, along)),
    axis === 'x' ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
    kind || 'traffic',
    null,
  );
  car.axis = axis;
  car.dir = dir;
  car.lane = Math.floor(random() * 3);
  if (kind === 'parked') {
    car.parked = true;
    car.speed = 0;
    car.x = axis === 'x' ? Math.max(120, Math.min(WORLD - 120, along)) : line + ROAD_HALF - 18;
    car.y = axis === 'x' ? line + ROAD_HALF - 18 : Math.max(120, Math.min(WORLD - 120, along));
    car.angle = axis === 'x' ? 0 : Math.PI / 2;
  }
  return car;
}

/** A police car spawns just off-screen from the player, on a road. */
export function spawnPoliceCar(city, x, y, random) {
  const angle = random() * Math.PI * 2;
  const px = x + Math.cos(angle) * 900;
  const py = y + Math.sin(angle) * 900;
  const car = makeCar(
    Math.max(100, Math.min(WORLD - 100, px)),
    Math.max(100, Math.min(WORLD - 100, py)),
    0, 'police', '#1c4fd6',
  );
  car.speed = 200;
  return car;
}

/** Keep a car out of other cars: a soft push so traffic never overlaps. */
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    for (let j = i + 1; j < cars.length; j += 1) {
      const a = cars[i];
      const b = cars[j];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = 44;
      if (dist > 0.01 && dist < min) {
        const push = (min - dist) / 2;
        const ux = dx / dist;
        const uy = dy / dist;
        a.x -= ux * push;
        a.y -= uy * push;
        b.x += ux * push;
        b.y += uy * push;
      }
    }
  }
}
