// The game's rules and state, with no drawing and no browser in it: the player on foot
// and in cars, traffic and pedestrians, police and the wanted level, combat, pickups,
// the mission chain, and the save. step() advances one fixed step and returns what
// happened as bit flags, so the caller can react without the world knowing about screens.
import {
  CAR, GUN, MISSION_REWARDS, PALETTE, PLAYER, ROAD_HALF, SAVE_KEY, STEP, TRAFFIC,
  WANTED, WORLD,
} from './config.js';
import { LANDMARKS, buildCity, collideCircle, hitsBuilding } from './city.js';
import { CARGO_SPOTS, MISSIONS, stepTarget, stepText } from './missions.js';
import {
  drivePlayerCar, makeCar, separateCars, spawnPoliceCar, spawnTrafficCarNear,
  updatePoliceCar, updateTrafficCar,
} from './vehicles.js';
import { makeCop, makeGang, makePedestrian, spawnPedestrian, updateCop, updateGang, updatePedestrian } from './people.js';

export const EVENT_SHOT = 1;
export const EVENT_CRASH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION_DONE = 8;
export const EVENT_WASTED = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WANTED_UP = 64;
export const EVENT_CASH = 128;
export const EVENT_MISSION_FAIL = 256;

const PLAYER_COLORS = PALETTE.car;

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createWorld(random) {
  const city = buildCity(random);
  const state = {
    city,
    player: {
      x: LANDMARKS.garage.x, y: LANDMARKS.garage.y + 120, angle: -Math.PI / 2,
      hp: PLAYER.hp, money: 250, ammo: GUN.startAmmo, car: null,
      fireCooldown: 0, punchCooldown: 0, hurtCooldown: 0, invulnerable: 0,
      walkFrame: 0, moving: false,
    },
    cars: [], peds: [], bullets: [], pickups: [], particles: [],
    wanted: 0, wantedTimer: 0, crimeCooldown: 0,
    mission: { index: 0, step: 0, active: false, timer: 0, kills: 0, collected: 0, done: false, storyDone: false },
    gang: [],
    cam: { x: LANDMARKS.garage.x, y: LANDMARKS.garage.y },
    shake: 0,
    time: 0,
    stats: { kills: 0, carsStolen: 0, missionsDone: 0, shotsFired: 0 },
    banner: null, bannerTimer: 0,
    over: null, // 'wasted' | 'busted' | null
    spawnTimer: 0,
  };

  function showBanner(text, sub) {
    state.banner = { text, sub: sub || '' };
    state.bannerTimer = 3.2;
  }

  function addWanted(n, events) {
    if (state.wanted >= WANTED.max) return events;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedTimer = 0;
    return events | EVENT_WANTED_UP;
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = random() * Math.PI * 2;
      const s = (0.3 + random() * 0.7) * (speed || 160);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + random() * 0.5, maxLife: 0.9, color, size: 2 + random() * 3,
      });
    }
  }

  function dropPickup(x, y, kind, value) {
    state.pickups.push({ x, y, kind, value, bob: random() * Math.PI * 2 });
  }

  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestDist = maxDist;
    for (const car of state.cars) {
      const d = Math.hypot(car.x - x, car.y - y);
      if (d < bestDist) {
        best = car;
        bestDist = d;
      }
    }
    return best;
  }

  function enterCar(car, events) {
    const player = state.player;
    if (car.driver) {
      // Drag the driver out: they run off, and stealing a driven car is a crime.
      const ped = makePedestrian(car.x + 40, car.y + 40, random);
      ped.flee = 5;
      state.peds.push(ped);
      car.driver = false;
      events = addWanted(WANTED.stealCar, events);
      state.stats.carsStolen += 1;
      showBanner('Car stolen!', 'The owner called the cops — lose the heat');
    } else if (car.parked) {
      events = addWanted(WANTED.stealCar, events);
      state.stats.carsStolen += 1;
      showBanner('Car stolen!', 'The owner called the cops — lose the heat');
    }
    car.parked = false;
    car.kind = 'player';
    player.car = car;
    player.x = car.x;
    player.y = car.y;
    return events;
  }

  function exitCar() {
    const player = state.player;
    const car = player.car;
    if (!car) return;
    car.kind = 'parked';
    car.parked = true;
    car.speed = 0;
    player.car = null;
    const a = car.angle + Math.PI / 2;
    const spot = collideCircle(city, car.x + Math.cos(a) * 40, car.y + Math.sin(a) * 40, PLAYER.radius);
    player.x = spot.x;
    player.y = spot.y;
  }

  function fireBullet(from, x, y, angle, speed, damage, owner) {
    state.bullets.push({
      x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      life: GUN.range / speed, damage, owner,
    });
  }

  function playerShoot(targetX, targetY, events) {
    const player = state.player;
    if (player.fireCooldown > 0 || player.car) return events;
    if (player.ammo <= 0) {
      player.punchCooldown = Math.max(player.punchCooldown, 0.1);
      return events;
    }
    player.ammo -= 1;
    player.fireCooldown = GUN.fireCooldown;
    player.angle = Math.atan2(targetY - player.y, targetX - player.x);
    const mx = player.x + Math.cos(player.angle) * 20;
    const my = player.y + Math.sin(player.angle) * 20;
    fireBullet('player', mx, my, player.angle + (random() - 0.5) * 0.06, GUN.bulletSpeed, GUN.damage, 'player');
    spawnParticles(mx, my, '#ffd23d', 3, 120);
    state.stats.shotsFired += 1;
    return events | EVENT_SHOT;
  }

  function playerPunch(events) {
    const player = state.player;
    if (player.punchCooldown > 0 || player.car) return events;
    player.punchCooldown = PLAYER.punchCooldown;
    const range = PLAYER.punchRange + 14;
    for (const ped of state.peds) {
      if (!ped.alive) continue;
      const d = dist(player, ped);
      if (d < range) {
        ped.hp -= PLAYER.punchDamage;
        ped.flee = 3;
        if (ped.hp <= 0) events = killPed(ped, events);
      }
    }
    for (const g of state.gang) {
      if (!g.alive) continue;
      if (dist(player, g) < range) {
        g.hp -= PLAYER.punchDamage;
        if (g.hp <= 0) killGang(g);
      }
    }
    return events;
  }

  function killPed(ped, events) {
    ped.alive = false;
    ped.dead = true;
    spawnParticles(ped.x, ped.y, '#c0392b', 14, 180);
    if (random() < 0.6) dropPickup(ped.x, ped.y, 'cash', 20 + Math.floor(random() * 60));
    return addWanted(WANTED.killPed, events);
  }

  function killGang(g) {
    g.alive = false;
    g.dead = true;
    state.mission.kills += 1;
    state.stats.kills += 1;
    spawnParticles(g.x, g.y, '#c0392b', 14, 180);
    dropPickup(g.x, g.y, 'cash', 50 + Math.floor(random() * 100));
    if (random() < 0.5) dropPickup(g.x, g.y + 20, 'ammo', 12);
  }

  function spawnGangAt(x, y, count) {
    for (let i = 0; i < count; i += 1) {
      const g = makeGang(x + (random() - 0.5) * 220, y + (random() - 0.5) * 220, random);
      state.gang.push(g);
    }
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    state.mission.index = index;
    state.mission.step = 0;
    state.mission.active = true;
    state.mission.timer = mission.time || 0;
    state.mission.kills = 0;
    state.mission.collected = 0;
    state.mission.done = false;
    showBanner(mission.title, mission.briefing);
    // Heat Wave starts with the cops already on you.
    if (mission.id === 'heat-wave') {
      state.wanted = 3;
      state.wantedTimer = 0;
    }
    prepareStep();
  }

  function prepareStep() {
    const mission = MISSIONS[state.mission.index];
    const step = mission.steps[state.mission.step];
    if (!step) return;
    if (step.kind === 'kill') {
      const t = stepTarget(step);
      spawnGangAt(t.x, t.y, step.count);
    }
    if (step.kind === 'collect') {
      for (const spot of CARGO_SPOTS) dropPickup(spot.x, spot.y, 'cargo', 0);
    }
  }

  function advanceStep() {
    const mission = MISSIONS[state.mission.index];
    state.mission.step += 1;
    if (state.mission.step >= mission.steps.length) {
      completeMission();
      return;
    }
    prepareStep();
  }

  function completeMission() {
    const mission = MISSIONS[state.mission.index];
    const reward = mission.reward;
    state.player.money += reward;
    state.mission.active = false;
    state.mission.done = true;
    state.stats.missionsDone += 1;
    showBanner(`Job done: ${mission.title}`, `+$${reward} — Mara is pleased`);
    if (state.mission.index + 1 >= MISSIONS.length) {
      state.mission.storyDone = true;
      showBanner('The Big Score is yours', 'Solmar City is yours now — free roam, Leo');
    }
  }

  function failMission(reason) {
    const mission = MISSIONS[state.mission.index];
    state.mission.active = false;
    state.mission.step = 0;
    state.mission.kills = 0;
    state.mission.collected = 0;
    showBanner('Job failed', reason || `${mission.title} — talk to Mara to try again`);
    // Clear mission leftovers.
    state.gang = state.gang.filter((g) => g.alive);
    state.pickups = state.pickups.filter((p) => p.kind !== 'cargo');
  }

  function missionObjective() {
    if (!state.mission.active) return null;
    const mission = MISSIONS[state.mission.index];
    const step = mission.steps[state.mission.step];
    if (!step) return null;
    const target = stepTarget(step);
    return { mission, step, text: stepText(mission, step, state.mission), target, timer: state.mission.timer };
  }

  function updateMission(dt, events) {
    if (!state.mission.active) return events;
    const mission = MISSIONS[state.mission.index];
    const step = mission.steps[state.mission.step];
    if (!step) return events;
    if (mission.time) {
      state.mission.timer -= dt;
      if (state.mission.timer <= 0) {
        failMission('Out of time');
        return events | EVENT_MISSION_FAIL;
      }
    }
    const player = state.player;
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    const target = stepTarget(step);
    switch (step.kind) {
      case 'goto':
      case 'deliver':
        if (target && Math.hypot(px - target.x, py - target.y) < 95) advanceStep();
        break;
      case 'enter-car':
        if (player.car) advanceStep();
        break;
      case 'pickup':
        if (target && Math.hypot(player.x - target.x, player.y - target.y) < 70 && !player.car) {
          if (mission.id === 'the-big-score') {
            events = addWanted(4, events);
            state.player.money += 1500;
            showBanner('Vault cash grabbed!', '+$1,500 — now run!');
          }
          advanceStep();
        }
        break;
      case 'kill':
        if (state.mission.kills >= step.count) advanceStep();
        break;
      case 'collect':
        if (state.mission.collected >= step.count) advanceStep();
        break;
      case 'escape':
        if (state.wanted === 0) advanceStep();
        break;
      default:
        break;
    }
    return events;
  }

  function maintainPopulation() {
    const player = state.player;
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    // Traffic cars.
    const traffic = state.cars.filter((c) => c.kind === 'traffic');
    if (traffic.length < TRAFFIC.maxCars && random() < 0.5) {
      const car = spawnTrafficCarNear(city, px, py, random, 'traffic');
      car.color = PLAYER_COLORS[Math.floor(random() * PLAYER_COLORS.length)];
      state.cars.push(car);
    }
    if (state.cars.filter((c) => c.kind === 'parked').length < 8 && random() < 0.08) {
      const car = spawnTrafficCarNear(city, px, py, random, 'parked');
      car.color = PLAYER_COLORS[Math.floor(random() * PLAYER_COLORS.length)];
      state.cars.push(car);
    }
    // Pedestrians.
    if (state.peds.filter((p) => p.alive).length < TRAFFIC.maxPeds && random() < 0.6) {
      state.peds.push(spawnPedestrian(px, py, random));
    }
    // Despawn the far away.
    state.cars = state.cars.filter((c) => c.kind === 'player' || Math.hypot(c.x - px, c.y - py) < TRAFFIC.despawnRadius);
    state.peds = state.peds.filter((p) => !p.alive || Math.hypot(p.x - px, p.y - py) < TRAFFIC.despawnRadius);
    state.gang = state.gang.filter((g) => g.alive || Math.hypot(g.x - px, g.y - py) < TRAFFIC.despawnRadius);
  }

  function maintainPolice(dt) {
    const player = state.player;
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    const wantCars = WANTED.policeCars[state.wanted];
    const wantFoot = WANTED.policeFoot[state.wanted];
    const policeCars = state.cars.filter((c) => c.kind === 'police');
    const footCops = state.peds.filter((p) => p.kind === 'cop' && p.alive);
    if (policeCars.length < wantCars && random() < dt * 1.5) {
      state.cars.push(spawnPoliceCar(city, px, py, random));
    }
    if (footCops.length < wantFoot && random() < dt * 0.8) {
      const angle = random() * Math.PI * 2;
      const cop = makeCop(px + Math.cos(angle) * 500, py + Math.sin(angle) * 500);
      state.peds.push(cop);
    }
    // When the heat is off, the police leave.
    if (state.wanted === 0) {
      state.cars = state.cars.filter((c) => {
        if (c.kind !== 'police') return true;
        return Math.hypot(c.x - px, c.y - py) < 500;
      });
      for (const p of state.peds) if (p.kind === 'cop') p.flee = 0.1;
      state.peds = state.peds.filter((p) => p.kind !== 'cop' || p.alive);
    }
  }

  function updateBullets(dt, events) {
    const player = state.player;
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (hitsBuilding(city, b.x, b.y, 2)) {
        b.life = 0;
        spawnParticles(b.x, b.y, '#c9c2b2', 3, 90);
        continue;
      }
      if (b.owner === 'player') {
        for (const ped of state.peds) {
          if (!ped.alive) continue;
          if (Math.hypot(ped.x - b.x, ped.y - b.y) < 16) {
            b.life = 0;
            ped.hp -= b.damage;
            ped.flee = 4;
            if (ped.kind === 'cop') events = addWanted(1, events);
            if (ped.hp <= 0) {
              if (ped.kind === 'cop') { ped.alive = false; ped.dead = true; spawnParticles(ped.x, ped.y, '#c0392b', 12, 170); events = addWanted(1, events); }
              else events = killPed(ped, events);
            }
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const g of state.gang) {
          if (!g.alive) continue;
          if (Math.hypot(g.x - b.x, g.y - b.y) < 16) {
            b.life = 0;
            g.hp -= b.damage;
            if (g.hp <= 0) killGang(g);
            break;
          }
        }
        if (b.life <= 0) continue;
        for (const car of state.cars) {
          if (car.kind === 'player') continue;
          if (Math.hypot(car.x - b.x, car.y - b.y) < 26) {
            b.life = 0;
            car.hp = (car.hp ?? 100) - b.damage;
            spawnParticles(b.x, b.y, '#ffd23d', 4, 120);
            if (car.hp <= 0) explodeCar(car);
            break;
          }
        }
      } else {
        // Enemy bullet: only the player can be hurt.
        if (!player.car && Math.hypot(player.x - b.x, player.y - b.y) < 15 && player.hurtCooldown <= 0) {
          b.life = 0;
          player.hp -= 12;
          player.hurtCooldown = 0.35;
          spawnParticles(player.x, player.y, '#c0392b', 8, 140);
        } else if (player.car && Math.hypot(player.car.x - b.x, player.car.y - b.y) < 26) {
          b.life = 0;
          player.car.hp = (player.car.hp ?? 100) - 6;
          spawnParticles(b.x, b.y, '#ffd23d', 3, 100);
          if (player.car.hp <= 0) explodeCar(player.car);
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function explodeCar(car) {
    spawnParticles(car.x, car.y, '#ff6b2e', 30, 320);
    spawnParticles(car.x, car.y, '#2b2b33', 20, 160);
    state.shake = Math.max(state.shake, 0.5);
    if (car.kind === 'player' && state.player.car === car) {
      state.player.hp -= 25;
      exitCar();
    }
    state.cars = state.cars.filter((c) => c !== car);
  }

  function updatePlayer(dt, input, mouseWorld, events) {
    const player = state.player;
    player.fireCooldown = Math.max(0, player.fireCooldown - dt);
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    player.hurtCooldown = Math.max(0, player.hurtCooldown - dt);
    player.invulnerable = Math.max(0, player.invulnerable - dt);
    if (player.car) {
      const car = player.car;
      const crashed = drivePlayerCar(city, car, input, dt);
      if (crashed) {
        events |= EVENT_CRASH;
        car.hp = (car.hp ?? 100) - 12;
        state.shake = Math.max(state.shake, 0.3);
        spawnParticles(car.x, car.y, '#ffd23d', 8, 150);
        if (car.hp <= 0) explodeCar(car);
      }
      player.x = car.x;
      player.y = car.y;
      player.angle = car.angle;
      // Running over pedestrians is a crime.
      if (Math.abs(car.speed) > 140) {
        for (const ped of state.peds) {
          if (!ped.alive) continue;
          if (Math.hypot(ped.x - car.x, ped.y - car.y) < 26) {
            events = killPed(ped, events);
            car.speed *= 0.85;
          }
        }
      }
      return events;
    }

    // On foot: WASD moves, the mouse aims, Shift runs.
    const mx = (input.held.right ? 1 : 0) - (input.held.left ? 1 : 0);
    const my = (input.held.down ? 1 : 0) - (input.held.up ? 1 : 0);
    const moving = mx !== 0 || my !== 0;
    player.moving = moving;
    if (moving) {
      const len = Math.hypot(mx, my);
      const speed = input.held.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const nx = player.x + (mx / len) * speed * dt;
      const ny = player.y + (my / len) * speed * dt;
      const fixed = collideCircle(city, nx, ny, PLAYER.radius);
      player.x = fixed.x;
      player.y = fixed.y;
      player.walkFrame += dt * (input.held.run ? 14 : 10);
    }
    player.angle = Math.atan2(mouseWorld.y - player.y, mouseWorld.x - player.x);
    // A click fires once even if it is released between frames; holding fires repeatedly.
    // (Some input objects, such as the title screen's idle driver, carry no takeClick.)
    const clicked = typeof input.takeClick === 'function' ? input.takeClick() : false;
    if (input.mouseDown || clicked) events = playerShoot(mouseWorld.x, mouseWorld.y, events);
    return events;
  }

  function updatePickups(dt, events) {
    const player = state.player;
    const px = player.car ? player.car.x : player.x;
    const py = player.car ? player.car.y : player.y;
    for (const p of state.pickups) p.bob += dt * 3;
    state.pickups = state.pickups.filter((p) => {
      const d = Math.hypot(p.x - px, p.y - py);
      if (d > 34) return true;
      if (p.kind === 'cash') {
        player.money += p.value;
        events |= EVENT_CASH;
      } else if (p.kind === 'health') {
        player.hp = Math.min(PLAYER.hp, player.hp + 40);
      } else if (p.kind === 'ammo') {
        player.ammo += p.value;
      } else if (p.kind === 'cargo') {
        state.mission.collected += 1;
      }
      return false;
    });
    return events;
  }

  function updatePoliceChase(dt) {
    const player = state.player;
    const target = player.car ? player.car : player;
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      updatePoliceCar(city, car, target, dt);
      // Ramming the player's car damages it; ramming the player on foot hurts.
      if (player.car && car !== player.car) {
        if (Math.hypot(car.x - player.car.x, car.y - player.car.y) < 46) {
          player.car.hp = (player.car.hp ?? 100) - 14 * dt;
          player.car.speed *= 0.98;
          if (player.car.hp <= 0) explodeCar(player.car);
        }
      } else if (!player.car && Math.hypot(car.x - player.x, car.y - player.y) < 34 && Math.abs(car.speed) > 60) {
        player.hp -= 12 * dt;
        spawnParticles(player.x, player.y, '#c0392b', 4, 120);
      }
    }
    for (const ped of state.peds) {
      if (ped.kind !== 'cop' || !ped.alive) continue;
      updateCop(city, ped, player, dt);
      // A cop on foot shoots at higher wanted levels.
      if (state.wanted >= 3 && ped.shootCooldown <= 0 && Math.hypot(ped.x - player.x, ped.y - player.y) < 420 && !player.car) {
        ped.shootCooldown = 1.4;
        fireBullet('cop', ped.x, ped.y, Math.atan2(player.y - ped.y, player.x - ped.x) + (random() - 0.5) * 0.2, 700, 12, 'enemy');
      }
      // Busted: a cop grabs you on foot.
      if (!player.car && Math.hypot(ped.x - player.x, ped.y - player.y) < 26 && state.wanted > 0) {
        state.over = 'busted';
      }
    }
    for (const g of state.gang) {
      if (!g.alive) continue;
      updateGang(city, g, player, dt);
      if (g.shootCooldown <= 0 && Math.hypot(g.x - player.x, g.y - player.y) < 430) {
        g.shootCooldown = 1.2 + random() * 0.8;
        fireBullet('gang', g.x, g.y, Math.atan2(player.y - g.y, player.x - g.x) + (random() - 0.5) * 0.25, 650, 10, 'enemy');
      }
    }
  }

  function reset() {
    const player = state.player;
    player.x = LANDMARKS.garage.x;
    player.y = LANDMARKS.garage.y + 120;
    player.angle = -Math.PI / 2;
    player.hp = PLAYER.hp;
    player.money = 250;
    player.ammo = GUN.startAmmo;
    player.car = null;
    player.fireCooldown = 0;
    player.punchCooldown = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.pickups = [];
    state.particles = [];
    state.gang = [];
    state.wanted = 0;
    state.wantedTimer = 0;
    state.mission = { index: 0, step: 0, active: false, timer: 0, kills: 0, collected: 0, done: false, storyDone: false };
    state.time = 0;
    state.over = null;
    state.banner = null;
    state.bannerTimer = 0;
    state.cam.x = player.x;
    state.cam.y = player.y;
    // A few parked cars near the start.
    for (let i = 0; i < 6; i += 1) {
      const car = spawnTrafficCarNear(city, player.x, player.y, random, 'parked');
      car.color = PLAYER_COLORS[Math.floor(random() * PLAYER_COLORS.length)];
      state.cars.push(car);
    }
    // A red coupe parked on the road beside the garage: the first thing to steal.
    const starter = makeCar(1400, 1200, Math.PI / 2, 'parked', '#d94f3d');
    state.cars.push(starter);
    for (let i = 0; i < 12; i += 1) state.peds.push(spawnPedestrian(player.x, player.y, random));
    // Cash and health pickups near the start.
    dropPickup(LANDMARKS.garage.x - 60, LANDMARKS.garage.y + 60, 'cash', 80);
    dropPickup(LANDMARKS.gunshop.x + 80, LANDMARKS.gunshop.y, 'ammo', 24);
    dropPickup(LANDMARKS.hospital.x - 80, LANDMARKS.hospital.y, 'health', 0);
  }

  /**
   * One fixed step. `input` is the live input, `mouseWorld` the mouse in world
   * coordinates, `audio` the sound bank (may be null in shot staging), and `actions`
   * the one-shot flags the caller already took from the input. Returns events.
   */
  function step(dt, input, mouseWorld, audio, actions) {
    let events = 0;
    state.time += dt;
    state.crimeCooldown = Math.max(0, state.crimeCooldown - dt);
    if (state.bannerTimer > 0) {
      state.bannerTimer -= dt;
      if (state.bannerTimer <= 0) state.banner = null;
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 1.4);

    // Entering / leaving a car, and punching.
    actions = actions || 0;
    if (actions & 4) { // ACTION_ENTER
      if (state.player.car) exitCar();
      else {
        const car = nearestCar(state.player.x, state.player.y, 78);
        if (car) events = enterCar(car, events);
      }
    }
    if (actions & 16) events = playerPunch(events); // ACTION_PUNCH

    events = updatePlayer(dt, input, mouseWorld, events);
    events = updateMission(dt, events);
    events = updateBullets(dt, events);
    events = updatePickups(dt, events);

    // Traffic and pedestrians.
    for (const car of state.cars) {
      if (car.kind === 'traffic') updateTrafficCar(city, car, state.cars, dt, random);
    }
    separateCars(state.cars);
    const danger = state.player.car ? state.player.car : state.player;
    for (const ped of state.peds) {
      if (ped.kind === 'ped') updatePedestrian(city, ped, danger, dt, random);
    }
    updatePoliceChase(dt);

    // Wanted decay: out of sight of the law, the heat cools off.
    if (state.wanted > 0) {
      const nearPolice = state.cars.some((c) => c.kind === 'police' && Math.hypot(c.x - danger.x, c.y - danger.y) < 600)
        || state.peds.some((p) => p.kind === 'cop' && p.alive && Math.hypot(p.x - danger.x, p.y - danger.y) < 500);
      if (!nearPolice) {
        state.wantedTimer += dt;
        if (state.wantedTimer >= WANTED.decaySeconds) {
          state.wanted -= 1;
          state.wantedTimer = 0;
        }
      } else state.wantedTimer = 0;
    }

    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 0.5;
      maintainPopulation();
    }
    maintainPolice(dt);

    // Particles.
    for (const p of state.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      p.life -= dt;
    }
    state.particles = state.particles.filter((p) => p.life > 0);

    // Camera follows the player or their car, smoothly.
    const focus = state.player.car ? state.player.car : state.player;
    state.cam.x += (focus.x - state.cam.x) * Math.min(1, dt * 4);
    state.cam.y += (focus.y - state.cam.y) * Math.min(1, dt * 4);

    // Death and arrest.
    if (state.player.hp <= 0 && !state.over) {
      state.over = 'wasted';
      events |= EVENT_WASTED;
    }
    if (state.over === 'busted') events |= EVENT_BUSTED;
    if (audio) audio.update(dt, state.player.car ? Math.abs(state.player.car.speed) / 560 : 0, state.wanted);
    return events;
  }

  function respawn() {
    const player = state.player;
    const wasBusted = state.over === 'busted';
    player.hp = PLAYER.hp;
    player.x = LANDMARKS.hospital.x;
    player.y = LANDMARKS.hospital.y + 120;
    player.car = null;
    player.angle = 0;
    if (state.over === 'busted') player.money = Math.max(0, player.money - 200);
    state.wanted = 0;
    state.over = null;
    state.cars = state.cars.filter((c) => c.kind !== 'police');
    state.peds = state.peds.filter((p) => p.kind !== 'cop');
    state.cam.x = player.x;
    state.cam.y = player.y;
    showBanner(wasBusted ? 'Busted — $200 bail' : 'Patched up', 'St. Anselm Hospital — back on your feet');
  }

  /** Save the run to localStorage. */
  function save() {
    const player = state.player;
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        x: player.x, y: player.y, hp: player.hp, money: player.money, ammo: player.ammo,
        missionIndex: state.mission.index, missionsDone: state.stats.missionsDone,
        storyDone: state.mission.storyDone, time: state.time,
      }));
      return true;
    } catch {
      return false;
    }
  }

  /** Load a save, if one exists; returns true when it did. */
  function load() {
    let data = null;
    try {
      data = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
    } catch {
      data = null;
    }
    if (!data) return false;
    const player = state.player;
    player.x = data.x;
    player.y = data.y;
    player.hp = data.hp;
    player.money = data.money;
    player.ammo = data.ammo;
    state.mission.index = data.missionIndex || 0;
    state.stats.missionsDone = data.missionsDone || 0;
    state.mission.storyDone = !!data.storyDone;
    state.time = data.time || 0;
    state.cam.x = player.x;
    state.cam.y = player.y;
    return true;
  }

  /** True when a save exists. */
  function hasSave() {
    try {
      return !!window.localStorage.getItem(SAVE_KEY);
    } catch {
      return false;
    }
  }

  reset();
  return {
    state, reset, step, startMission, failMission, missionObjective,
    showBanner, addWanted, spawnParticles, dropPickup, respawn, save, load, hasSave,
    enterCar, exitCar, nearestCar, explodeCar,
  };
}
