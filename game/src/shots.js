// The screenshot scenes behind ?shot=start|chase|mission|city. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (drive along the road, steer gently), so the frame is what a short game
// really looks like and the same seed always gives the same frame. Every scene shows
// several systems at once: the chase shows a car, the wanted level, police, the
// minimap and a mission objective in one frame.
import { PALETTE, STEP } from './config.js';
import { createRandom } from './random.js';
import { LANDMARKS } from './city.js';
import { makeCar, spawnPoliceCar, spawnTrafficCarNear } from './vehicles.js';
import { makeGang, spawnPedestrian } from './people.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const SIM_SECONDS = 9;

/** Fill the streets around (cx, cy) so the frame shows traffic and pedestrians. */
function populateStreets(world, cx, cy) {
  const random = createRandom(99);
  const state = world.state;
  const colors = PALETTE.car;
  for (let i = 0; i < 12; i += 1) {
    const car = spawnTrafficCarNear(world.state.city, cx, cy, random, 'traffic');
    car.color = colors[Math.floor(random() * colors.length)];
    state.cars.push(car);
  }
  for (let i = 0; i < 14; i += 1) {
    state.peds.push(spawnPedestrian(cx, cy, random));
  }
}

function fakeInput(drive) {
  return {
    held: { up: !!drive, down: false, left: false, right: false, run: false },
    mouseDown: false,
    takeActions() { return 0; },
    takeClick() { return false; },
  };
}

function runSteps(world, seconds, drive, mouseWorld) {
  const input = fakeInput(drive);
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const state = world.state;
    const focus = state.player.car ? state.player.car : state.player;
    const mouse = mouseWorld || { x: focus.x + 300, y: focus.y };
    if (drive && focus === state.player.car) {
      // Lane-keeping autopilot: aim at a point 200px ahead on the road line.
      const car = state.player.car;
      const tx = drive.axis === 'x' ? drive.line : car.x + drive.dir * 200;
      const ty = drive.axis === 'x' ? car.y + drive.dir * 200 : drive.line;
      const desired = Math.atan2(ty - car.y, tx - car.x);
      let diff = desired - car.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      input.held.left = diff < -0.04;
      input.held.right = diff > 0.04;
    }
    world.step(STEP, input, mouse, null, 0);
  }
}

function putPlayerInCar(world, x, y, angle, color) {
  const car = makeCar(x, y, angle, 'player', color);
  car.hp = 100;
  world.state.cars.push(car);
  world.state.player.car = car;
  world.state.player.x = x;
  world.state.player.y = y;
  world.state.player.angle = angle;
  world.state.cam.x = x;
  world.state.cam.y = y;
  return car;
}

/**
 * Set `world` to the named scene (start, chase, mission or city; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  const state = world.state;
  world.reset();
  if (name === 'chase') {
    // A three-star chase downtown: Leo in a red coupe, two police cars closing in,
    // the Big Score job running, traffic and pedestrians around. The car starts on
    // the x=2200 road, heading north, so it has open road ahead of it.
    putPlayerInCar(world, 2200, 3300, -Math.PI / 2, '#d94f3d');
    world.state.player.car.hp = 250;
    state.wanted = 3;
    world.startMission(5);
    for (let i = 0; i < 2; i += 1) {
      const cop = spawnPoliceCar(world.state.city, 2200, 3300, () => 0.2 + i * 0.3);
      cop.x = 2200 + (i === 0 ? -60 : 70);
      cop.y = 3600 + i * 120;
      state.cars.push(cop);
    }
    runSteps(world, 3.5, { axis: 'x', line: 2200, dir: -1 });
    // Populate the streets where the car ends up, so the frame is busy.
    populateStreets(world, state.player.x, state.player.y);
    runSteps(world, 0.4, { axis: 'x', line: 2200, dir: -1 });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'mission') {
    // Payback at the warehouse: Leo on foot, gun out, the Dockside crew in front of
    // him, the objective and the minimap on the HUD.
    const wh = LANDMARKS.warehouse;
    state.player.x = wh.x - 260;
    state.player.y = wh.y + 120;
    state.player.angle = Math.PI / 4;
    state.player.ammo = 48;
    state.cam.x = state.player.x;
    state.cam.y = state.player.y;
    state.mission.index = 2;
    state.mission.step = 1;
    state.mission.active = true;
    state.mission.kills = 0;
    for (let i = 0; i < 4; i += 1) {
      const g = makeGang(wh.x - 120 + i * 70, wh.y + 130 + (i % 2) * 40, () => 0.5);
      state.gang.push(g);
    }
    world.dropPickup(wh.x - 140, wh.y + 200, 'cash', 120);
    runSteps(world, 2.5, false, { x: wh.x, y: wh.y });
    return { screen: SCREEN_PLAY };
  }
  if (name === 'city') {
    // A cruise through downtown at sunset: traffic, pedestrians, the beach to the
    // west in the minimap, the next job waiting.
    putPlayerInCar(world, 1800, 2600, 0, '#3d7bd9');
    world.startMission(1);
    runSteps(world, 5, { axis: 'y', line: 2600, dir: 1 });
    populateStreets(world, state.player.x, state.player.y);
    runSteps(world, 0.4, { axis: 'y', line: 2600, dir: 1 });
    return { screen: SCREEN_PLAY };
  }
  // Start: the title over a living city — traffic builds up behind the panel.
  state.cam.x = 2400;
  state.cam.y = 2400;
  runSteps(world, 6, false);
  return { screen: SCREEN_TITLE };
}
