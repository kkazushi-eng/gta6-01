// The story: six jobs for Leo Marlow, a getaway driver new to Solmar City, working for
// the fixer Mara Voss. Each mission is a list of steps; world.js walks them. A step is a
// `goto` (reach the marker), `enter-car`, `pickup`, `kill` (gang members spawn at the
// marker), `collect` (grab every package), `escape` (lose the wanted level) or `deliver`.
// Targets name a LANDMARKS key or an {x, y} point.
import { LANDMARKS } from './city.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: '1. First Wheels',
    briefing: 'Mara needs a driver she can trust. Steal the red coupe by the garage and bring it back to her.',
    reward: 400,
    steps: [
      { kind: 'goto', at: 'garage', text: 'Go to Leo\u2019s Garage — a car is waiting there' },
      { kind: 'enter-car', at: 'garage', text: 'Steal the car (press E beside it)' },
      { kind: 'goto', at: 'garage', text: 'Bring the car back to the garage marker' },
    ],
  },
  {
    id: 'the-pickup',
    title: '2. The Pickup',
    briefing: 'Mara has a parcel that cannot go through the mail. Pick her up at her office and drive her to Sunset Pier.',
    reward: 900,
    steps: [
      { kind: 'goto', at: 'office', text: 'Drive to Mara\u2019s Office' },
      { kind: 'pickup', at: 'office', text: 'Pick up Mara (walk to the marker)' },
      { kind: 'goto', at: 'pier', text: 'Drive Mara to Sunset Pier' },
    ],
  },
  {
    id: 'payback',
    title: '3. Payback',
    briefing: 'The Dockside crew jumped one of Mara\u2019s runners. Go to the warehouse and settle it.',
    reward: 1400,
    steps: [
      { kind: 'goto', at: 'warehouse', text: 'Go to the Dockside Warehouse' },
      { kind: 'kill', at: 'warehouse', count: 4, text: 'Deal with the Dockside crew (0/4)' },
      { kind: 'goto', at: 'garage', text: 'Get back to the garage' },
    ],
  },
  {
    id: 'hot-cargo',
    title: '4. Hot Cargo',
    briefing: 'Three packages are stashed around the city. Grab them all and bring them to Mara before the clock runs out.',
    reward: 1800,
    time: 150,
    steps: [
      { kind: 'collect', at: { x: 600, y: 2600 }, count: 3, text: 'Collect the packages (0/3)' },
      { kind: 'deliver', at: 'office', text: 'Deliver the cargo to Mara\u2019s Office' },
    ],
  },
  {
    id: 'heat-wave',
    title: '5. Heat Wave',
    briefing: 'A job went loud and the whole Solmar PD is on you. Lose the heat — no shooting your way out.',
    reward: 2400,
    time: 180,
    steps: [
      { kind: 'escape', at: 'garage', text: 'Lose the cops — wanted level must drop to zero' },
    ],
  },
  {
    id: 'the-big-score',
    title: '6. The Big Score',
    briefing: 'Solmar Trust Bank, Friday, 4pm. Walk in, take the vault cash, and get to the garage alive.',
    reward: 5000,
    steps: [
      { kind: 'goto', at: 'bank', text: 'Go to Solmar Trust Bank' },
      { kind: 'pickup', at: 'bank', text: 'Grab the vault cash' },
      { kind: 'goto', at: 'garage', text: 'Escape to Leo\u2019s Garage — the whole city is watching' },
    ],
  },
];

/** Resolve a step's target to world coordinates. */
export function stepTarget(step) {
  if (!step.at) return null;
  if (typeof step.at === 'string') {
    const lm = LANDMARKS[step.at];
    return lm ? { x: lm.x, y: lm.y } : null;
  }
  return { x: step.at.x, y: step.at.y };
}

/** The objective line the HUD shows for the current step, with counts filled in. */
export function stepText(mission, step, runtime) {
  let text = step.text;
  if (step.kind === 'kill') text = `Deal with the Dockside crew (${runtime.kills}/${step.count})`;
  if (step.kind === 'collect') text = `Collect the packages (${runtime.collected}/${step.count})`;
  if (step.kind === 'escape') text = 'Lose the cops — wanted level must drop to zero';
  return text;
}

/** Package spawn points for the Hot Cargo mission, spread across the city. */
export const CARGO_SPOTS = [
  { x: 600, y: 2600 },
  { x: 3400, y: 4200 },
  { x: 4200, y: 1400 },
];
