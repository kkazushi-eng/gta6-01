// Solmar City: a seeded grid city of roads, blocks, buildings, parks and a beach.
// The west edge is sand and sea; downtown is the tall centre; the east edge is warehouses.
// All collision is circle-versus-building-rectangle, so cars and people slide along walls.
import { PALETTE, ROAD_HALF, ROAD_LINES, WORLD } from './config.js';

/** x < this is sea; the sand strip runs from here to the first road. */
export const WATER_EDGE = 70;
export const SAND_EDGE = 150;

export function districtAt(x, y) {
  if (x < SAND_EDGE) return 'beach';
  if (x > 4300) return 'industrial';
  const dx = x - WORLD / 2;
  const dy = y - WORLD / 2;
  if (dx * dx + dy * dy < 950 * 950) return 'downtown';
  if (y > 3400) return 'residential';
  return 'uptown';
}

function nearestLine(value) {
  let best = ROAD_LINES[0];
  for (const line of ROAD_LINES) if (Math.abs(line - value) < Math.abs(best - value)) best = line;
  return best;
}

/** True when the point is on a road (within the road half-width of a centre line). */
export function isOnRoad(x, y) {
  return Math.abs(x - nearestLine(x)) < ROAD_HALF || Math.abs(y - nearestLine(y)) < ROAD_HALF;
}

/** The fixed places the story uses: garage, bank, hospital, gun shop, Mara's office, warehouse. */
export const LANDMARKS = {
  garage: { x: 1200, y: 1200, name: 'Leo\u2019s Garage', kind: 'garage' },
  bank: { x: 2400, y: 2400, name: 'Solmar Trust Bank', kind: 'bank' },
  hospital: { x: 3600, y: 1200, name: 'St. Anselm Hospital', kind: 'hospital' },
  gunshop: { x: 1200, y: 2800, name: 'Ironworks Arms', kind: 'gunshop' },
  office: { x: 2800, y: 2000, name: 'Mara\u2019s Office', kind: 'office' },
  warehouse: { x: 4400, y: 3600, name: 'Dockside Warehouse', kind: 'warehouse' },
  pier: { x: 120, y: 2400, name: 'Sunset Pier', kind: 'pier' },
};

export function buildCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];
  const lots = [];

  for (let bx = 0; bx < 11; bx += 1) {
    for (let by = 0; by < 11; by += 1) {
      const x0 = ROAD_LINES[bx] + ROAD_HALF + 10;
      const x1 = ROAD_LINES[bx + 1] - ROAD_HALF - 10;
      const y0 = ROAD_LINES[by] + ROAD_HALF + 10;
      const y1 = ROAD_LINES[by + 1] - ROAD_HALF - 10;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const district = districtAt(cx, cy);
      const roll = random();
      if (district === 'downtown') {
        // One tower per block, taller near the centre.
        const size = 150 + random() * 60;
        const hgt = 90 + random() * 120;
        buildings.push({
          x: cx - size / 2, y: cy - size / 2, w: size, h: size, hgt,
          color: PALETTE.downtown, roof: '#3d4a61', district, tower: true,
        });
        continue;
      }
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const count = 5 + Math.floor(random() * 6);
        for (let t = 0; t < count; t += 1) {
          trees.push({ x: x0 + 20 + random() * (x1 - x0 - 40), y: y0 + 20 + random() * (y1 - y0 - 40), r: 12 + random() * 10 });
        }
        continue;
      }
      if (roll < 0.22) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        continue;
      }
      // One or two buildings per block, with a yard gap between them.
      const count = district === 'industrial' ? 1 : 1 + Math.floor(random() * 2);
      const palette = PALETTE.building;
      const roofs = PALETTE.roof;
      for (let b = 0; b < count; b += 1) {
        const w = 90 + random() * 110;
        const h = 80 + random() * 100;
        const px = x0 + random() * Math.max(1, x1 - x0 - w);
        const py = y0 + random() * Math.max(1, y1 - y0 - h);
        const ci = Math.floor(random() * palette.length);
        buildings.push({
          x: px, y: py, w, h,
          hgt: district === 'industrial' ? 26 + random() * 14 : 18 + random() * 42,
          color: palette[ci], roof: roofs[ci], district, tower: false,
        });
      }
    }
  }

  // Landmark buildings sit on their blocks and are drawn with a sign.
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    if (key === 'pier') continue;
    buildings.push({
      x: lm.x - 70, y: lm.y - 55, w: 140, h: 110, hgt: 46,
      color: key === 'bank' ? '#c2a15a' : key === 'hospital' ? '#e8e8e8' : '#7d8aa5',
      roof: '#4d5a6e', district: districtAt(lm.x, lm.y), tower: false, landmark: key,
    });
  }

  return { buildings, trees, parks, lots };
}

/**
 * Push a circle (x, y, r) out of every building it overlaps and out of the sea and the
 * world edge. Returns the corrected position; the caller keeps its own velocity.
 */
export function collideCircle(city, x, y, r) {
  let nx = x;
  let ny = y;
  if (nx < WATER_EDGE + r) nx = WATER_EDGE + r;
  if (nx > WORLD - r) nx = WORLD - r;
  if (ny < r) ny = r;
  if (ny > WORLD - r) ny = WORLD - r;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(nx, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ny, b.y + b.h));
    const dx = nx - cx;
    const dy = ny - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= r * r) continue;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      nx = cx + (dx / d) * r;
      ny = cy + (dy / d) * r;
    } else {
      // Centre inside the rectangle: push out along the smallest penetration.
      const left = nx - b.x;
      const right = b.x + b.w - nx;
      const top = ny - b.y;
      const bottom = b.y + b.h - ny;
      const min = Math.min(left, right, top, bottom);
      if (min === left) nx = b.x - r;
      else if (min === right) nx = b.x + b.w + r;
      else if (min === top) ny = b.y - r;
      else ny = b.y + b.h + r;
    }
  }
  return { x: nx, y: ny };
}

/** True when a circle at (x, y, r) touches any building. */
export function hitsBuilding(city, x, y, r) {
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(y, b.y + b.h));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < r * r) return true;
  }
  return false;
}
