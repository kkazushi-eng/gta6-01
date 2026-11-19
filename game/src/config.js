// SOLMAR HEAT — an original open-world crime game set in Solmar City.
// Every tuning number, colour and world constant in one place.

/** The city is a square of this size, in world pixels. */
export const WORLD = 4800;
/** Distance between the centre lines of neighbouring roads. */
export const ROAD_PITCH = 400;
/** Half the width of a road, including its sidewalk strip. */
export const ROAD_HALF = 58;
/** Centre lines of the roads, both axes. */
export const ROAD_LINES = [];
for (let i = 0; i < 12; i += 1) ROAD_LINES.push(200 + i * ROAD_PITCH);

export const STEP = 1 / 60;
/** Logical canvas size the renderer scales to the window. */
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 235,
  runSpeed: 330,
  hp: 100,
  punchDamage: 25,
  punchRange: 34,
  punchCooldown: 0.35,
};

export const CAR = {
  length: 54,
  width: 26,
  accel: 420,
  brake: 620,
  reverseAccel: 260,
  maxSpeed: 560,
  maxReverse: 180,
  steer: 2.6,
  grip: 0.94,
  stealTime: 0.6,
};

export const TRAFFIC = { maxCars: 26, maxPeds: 34, spawnRadius: 900, despawnRadius: 1800 };

export const WANTED = {
  stealCar: 1,
  shoot: 1,
  killPed: 2,
  hitPed: 1,
  decaySeconds: 14,
  max: 5,
  policeCars: [0, 1, 2, 3, 4, 6],
  policeFoot: [0, 0, 2, 3, 5, 7],
};

export const GUN = {
  damage: 34,
  fireCooldown: 0.22,
  bulletSpeed: 950,
  range: 620,
  ammoPrice: 120,
  ammoPack: 24,
  startAmmo: 36,
};

export const SAVE_KEY = 'solmar-heat.save.v1';

export const PALETTE = {
  sky: '#f7c873',
  grass: '#7fae5a',
  sand: '#e8cf96',
  water: '#2e7fa8',
  waterDeep: '#1f5f84',
  road: '#3a3f4a',
  roadLine: '#e8d44d',
  sidewalk: '#9a938a',
  building: ['#c96f4a', '#b85c5c', '#7d8aa5', '#a5845e', '#5e7d6a', '#8a6f9e', '#c2a15a', '#6b7f8f'],
  roof: ['#8a4a34', '#6e3f3f', '#4d5a6e', '#7a5f3d', '#41584a', '#5f4a6e', '#8f7a3d', '#47555f'],
  downtown: '#5a6b84',
  park: '#6da054',
  car: ['#d94f3d', '#3d7bd9', '#e8c832', '#3da35a', '#e8e8e8', '#2b2b33', '#c96fd9', '#e07b2e', '#7fd4d9', '#9e2b25'],
  police: '#1c4fd6',
  taxi: '#f2c230',
  player: '#f2f2f2',
  text: '#f4f1e8',
  muted: '#c9c2b2',
  hudBg: 'rgba(12, 14, 20, 0.72)',
  accent: '#ffb02e',
  danger: '#ff4d3d',
  policeBlue: '#3d7bff',
  mission: '#ffd23d',
};

/** Money earned per mission, in order. */
export const MISSION_REWARDS = [400, 900, 1400, 1800, 2400, 5000];

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
