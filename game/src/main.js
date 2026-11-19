// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over.
// Missions are started with N (or from the pause menu); progress saves to localStorage.
//
// ?seed=N fixes the city. ?shot=start|chase|mission|city (with &seed=N) stages that scene
// instead of running the loop, paints it and sets window.__shotReady for a screenshot.
import { SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CASH, EVENT_CRASH, EVENT_MISSION_DONE, EVENT_MISSION_FAIL, EVENT_PICKUP, EVENT_SHOT, EVENT_WASTED, EVENT_WANTED_UP } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';
import { MISSIONS } from './missions.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
// A read handle for play-testing and debugging (the game itself never uses it).
window.__world = world;

function runShot(name) {
  const scene = stageShot(name, world);
  // Expose the objective to the renderer through the state, as the live game does.
  world.state.objective = world.missionObjective();
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, {});
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  // A read handle for play-testing (the game itself never uses it).
  window.__input = input;
  let screen = SCREEN_TITLE;
  let savedFlash = 0;
  let nextJobFlash = 0;
  let accumulator = 0;
  let last = performance.now();
  let keyN = false;

  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyN' && !event.repeat) keyN = true;
  });

  function announce(message) {
    status.textContent = message;
  }

  function readSaveMeta() {
    try {
      const data = JSON.parse(window.localStorage.getItem(SAVE_KEY) || 'null');
      return data;
    } catch {
      return null;
    }
  }

  function saveMeta() {
    const data = readSaveMeta();
    return data
      ? { hasSave: true, saveMoney: data.money || 0, saveMissions: data.missionsDone || 0 }
      : { hasSave: false, saveMoney: 0, saveMissions: 0 };
  }

  function ui() {
    return {
      ...saveMeta(),
      muted: audio.muted,
      savedFlash: savedFlash > 0,
      nextMission: screen === SCREEN_PLAY && !world.state.mission.active && !world.state.mission.storyDone,
    };
  }

  function startNewGame() {
    world.reset();
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.start();
    announce('Solmar Heat. Steal a car, or press N for your first job.');
  }

  function continueGame() {
    world.reset();
    world.load();
    screen = SCREEN_PLAY;
    audio.unlock();
    audio.start();
    announce('Welcome back to Solmar City.');
  }

  function startNextJob() {
    const state = world.state;
    if (state.mission.active || state.mission.storyDone) return;
    const index = Math.min(state.mission.index, MISSIONS.length - 1);
    world.startMission(index);
    audio.mission();
    announce(`Job started: ${MISSIONS[index].title}`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (keyN) {
      keyN = false;
      if (screen === SCREEN_PLAY) startNextJob();
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startNewGame();
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        world.respawn();
        screen = SCREEN_PLAY;
        announce('Back on your feet.');
      }
    }
  }

  function handleClick(clientX, clientY) {
    const point = renderer.toLogical(clientX, clientY);
    for (const b of renderer.lastButtons()) {
      if (!b.enabled) continue;
      if (point.x >= b.x && point.x <= b.x + b.w && point.y >= b.y && point.y <= b.y + b.h) {
        audio.unlock();
        if (b.id === 'start') startNewGame();
        else if (b.id === 'continue') continueGame();
        else if (b.id === 'resume') {
          screen = SCREEN_PLAY;
          announce('Playing.');
        } else if (b.id === 'save') {
          if (world.save()) savedFlash = 2;
        } else if (b.id === 'quit') {
          world.save();
          screen = SCREEN_TITLE;
          announce('Solmar Heat. Press Space or click to start.');
        } else if (b.id === 'respawn') {
          world.respawn();
          screen = SCREEN_PLAY;
          announce('Back on your feet.');
        }
        return;
      }
    }
    // A click anywhere else on the title starts a new game; in play it is a shot.
    if (screen === SCREEN_TITLE) startNewGame();
  }

  canvas.addEventListener('pointerdown', (event) => {
    handleClick(event.clientX, event.clientY);
  });

  function stepGame(actions) {
    const mouse = input.mouse();
    const logical = renderer.toLogical(
      mouse.x + canvas.getBoundingClientRect().left,
      mouse.y + canvas.getBoundingClientRect().top,
    );
    // Mouse in world coordinates: the camera centres the view on state.cam.
    const cam = world.state.cam;
    const mouseWorld = {
      x: cam.x + (logical.x - 640),
      y: cam.y + (logical.y - 360),
    };
    const events = world.step(STEP, input, mouseWorld, audio, actions);
    if (events & EVENT_SHOT) audio.shoot();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CASH) audio.cash();
    if (events & EVENT_WANTED_UP) audio.sirenBlip();
    if (events & EVENT_MISSION_FAIL) audio.fail();
    if (events & EVENT_WASTED) {
      screen = SCREEN_OVER;
      announce('Wasted. The hospital patches you up.');
    } else if (events & EVENT_BUSTED) {
      screen = SCREEN_OVER;
      announce('Busted. The cops take you in.');
    }
    // A finished mission queues the next one: the player starts it with N.
    if (world.state.mission.done && !world.state.mission.active) {
      world.state.mission.done = false;
      if (world.state.mission.index + 1 < MISSIONS.length) {
        world.state.mission.index += 1;
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    if (savedFlash > 0) savedFlash -= Math.min((now - last) / 1000, MAX_FRAME);
    // One-shot presses are taken once per frame and shared by the menus and the world.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE) {
      // The city stays alive behind the title: traffic and pedestrians move.
      while (accumulator >= STEP) {
        const focus = world.state.player;
        world.step(STEP, { held: {}, takeActions: () => 0, takeClick: () => false, mouseDown: false }, { x: focus.x, y: focus.y }, null, 0);
        accumulator -= STEP;
      }
    } else if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP) {
        stepGame(actions);
        accumulator -= STEP;
        if (screen !== SCREEN_PLAY) break;
      }
    } else {
      accumulator = 0;
    }
    world.state.objective = world.missionObjective();
    renderer.draw(world.state, screen, ui());
  }

  // Leaving the tab pauses a running game rather than letting the cops catch Leo unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Autosave every 20 seconds of play.
  setInterval(() => {
    if (screen === SCREEN_PLAY) world.save();
  }, 20000);

  announce('Solmar Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
