// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player through Solmar City — sun-soaked streets, a beach to the west,
// downtown towers in the middle — and the HUD carries wanted stars, health, money,
// ammo, the mission objective and a live minimap. Menus are drawn as panels with
// buttons; the caller reads which button was drawn where.
import { CAR, FONT, PALETTE, ROAD_HALF, ROAD_LINES, VIEW, WORLD } from './config.js';
import { LANDMARKS, SAND_EDGE, WATER_EDGE } from './city.js';
import { MISSIONS } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = { x: VIEW.width - 236, y: 16, size: 220 };
const STAR = '\u2605';

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  let buttons = [];
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.ratio = ratio;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
    view.scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    view.x = (canvas.width - VIEW.width * view.scale) / 2;
    view.y = (canvas.height - VIEW.height * view.scale) / 2;
  }

  function font(size, bold) {
    const key = `${bold ? '700 ' : ''}${size}`;
    if (!fonts.has(key)) fonts.set(key, `${bold ? '700 ' : ''}${size}px ${FONT}`);
    return fonts.get(key);
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = font(size, bold);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function panel(x, y, w, h) {
    context.fillStyle = 'rgba(10, 12, 18, 0.88)';
    roundRect(x, y, w, h, 14);
    context.fill();
    context.strokeStyle = 'rgba(255, 176, 46, 0.55)';
    context.lineWidth = 2;
    context.stroke();
  }

  function button(id, x, y, w, h, label, enabled) {
    buttons.push({ id, x, y, w, h, enabled: enabled !== false });
    context.fillStyle = enabled === false ? '#3a3f4a' : '#ffb02e';
    roundRect(x, y, w, h, 8);
    context.fill();
    text(label, x + w / 2, y + h / 2 + 7, 20, '#14100a', 'center', true);
  }

  // ---------- world ----------

  function drawGround(state, left, top, right, bottom) {
    // Grass base, sand strip and sea to the west.
    context.fillStyle = PALETTE.grass;
    context.fillRect(left, top, right - left, bottom - top);
    context.fillStyle = PALETTE.sand;
    context.fillRect(WATER_EDGE, top, SAND_EDGE - WATER_EDGE, bottom - top);
    context.fillStyle = PALETTE.water;
    context.fillRect(left, top, WATER_EDGE - left, bottom - top);
    context.fillStyle = PALETTE.waterDeep;
    for (let y = top - ((top / 90) | 0) * 90; y < bottom; y += 90) {
      context.fillRect(left, y, WATER_EDGE - left - 14, 5);
    }
    // Parks.
    for (const park of state.city.parks) {
      if (park.x > right || park.x + park.w < left || park.y > bottom || park.y + park.h < top) continue;
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.w, park.h);
    }
    // Parking lots.
    for (const lot of state.city.lots) {
      if (lot.x > right || lot.x + lot.w < left || lot.y > bottom || lot.y + lot.h < top) continue;
      context.fillStyle = '#6e6a63';
      context.fillRect(lot.x, lot.y, lot.w, lot.h);
    }
  }

  function drawRoads(left, top, right, bottom) {
    context.fillStyle = PALETTE.road;
    for (const line of ROAD_LINES) {
      if (line > left - ROAD_HALF && line < right + ROAD_HALF) {
        context.fillRect(line - ROAD_HALF, top, ROAD_HALF * 2, bottom - top);
      }
      if (line > top - ROAD_HALF && line < bottom + ROAD_HALF) {
        context.fillRect(left, line - ROAD_HALF, right - left, ROAD_HALF * 2);
      }
    }
    // Sidewalks.
    context.fillStyle = PALETTE.sidewalk;
    for (const line of ROAD_LINES) {
      if (line > left - ROAD_HALF && line < right + ROAD_HALF) {
        context.fillRect(line - ROAD_HALF, top, 10, bottom - top);
        context.fillRect(line + ROAD_HALF - 10, top, 10, bottom - top);
      }
      if (line > top - ROAD_HALF && line < bottom + ROAD_HALF) {
        context.fillRect(left, line - ROAD_HALF, right - left, 10);
        context.fillRect(left, line + ROAD_HALF - 10, right - left, 10);
      }
    }
    // Dashed centre lines.
    context.fillStyle = PALETTE.roadLine;
    for (const line of ROAD_LINES) {
      if (line > left && line < right) {
        for (let y = top - (top % 44); y < bottom; y += 44) context.fillRect(line - 2, y, 4, 22);
      }
      if (line > top && line < bottom) {
        for (let x = left - (left % 44); x < right; x += 44) context.fillRect(x, line - 2, 22, 4);
      }
    }
  }

  function drawBuildings(state, left, top, right, bottom) {
    for (const b of state.city.buildings) {
      if (b.x > right || b.x + b.w < left || b.y > bottom || b.y + b.h < top) continue;
      const lift = Math.min(46, b.hgt * 0.4);
      // Fake height: the wall is drawn first, the roof shifted up.
      context.fillStyle = 'rgba(0, 0, 0, 0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y - lift * 0.4, b.w, b.h);
      context.fillStyle = b.roof;
      context.fillRect(b.x + 5, b.y - lift, b.w - 10, b.h - 10);
      if (b.tower) {
        context.fillStyle = 'rgba(255, 255, 255, 0.16)';
        for (let wy = b.y - lift + 12; wy < b.y + b.h - 16; wy += 18) {
          for (let wx = b.x + 12; wx < b.x + b.w - 12; wx += 20) {
            context.fillRect(wx, wy, 10, 8);
          }
        }
      }
      if (b.landmark) {
        const lm = LANDMARKS[b.landmark];
        context.fillStyle = '#14100a';
        context.fillRect(b.x + b.w / 2 - 52, b.y - lift - 16, 104, 18);
        context.fillStyle = '#ffd23d';
        context.font = font(11, true);
        context.textAlign = 'center';
        context.fillText(lm.name.toUpperCase(), b.x + b.w / 2, b.y - lift - 3);
      }
    }
    for (const tree of state.city.trees) {
      if (tree.x < left || tree.x > right || tree.y < top || tree.y > bottom) continue;
      context.fillStyle = '#3f6b2e';
      context.beginPath();
      context.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#5da244';
      context.beginPath();
      context.arc(tree.x - 3, tree.y - 3, tree.r * 0.7, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const L = CAR.length;
    const W = CAR.width;
    // Wheels.
    context.fillStyle = '#141414';
    context.fillRect(-L / 2 + 4, -W / 2 - 3, 12, 6);
    context.fillRect(-L / 2 + 4, W / 2 - 3, 12, 6);
    context.fillRect(L / 2 - 16, -W / 2 - 3, 12, 6);
    context.fillRect(L / 2 - 16, W / 2 - 3, 12, 6);
    // Body.
    context.fillStyle = car.color;
    roundRect(-L / 2, -W / 2, L, W, 7);
    context.fill();
    // Windshield and roof.
    context.fillStyle = 'rgba(20, 30, 45, 0.85)';
    context.fillRect(L / 2 - 20, -W / 2 + 4, 8, W - 8);
    context.fillStyle = 'rgba(255, 255, 255, 0.18)';
    context.fillRect(-6, -W / 2 + 4, 16, W - 8);
    if (car.kind === 'police') {
      context.fillStyle = '#f2f2f2';
      context.fillRect(-L / 2 + 2, -W / 2 + 2, L - 4, 6);
      context.fillRect(-L / 2 + 2, W / 2 - 8, L - 4, 6);
      const flash = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = flash ? '#ff2e2e' : '#2e6bff';
      context.fillRect(-8, -W / 2 - 2, 7, 5);
      context.fillStyle = flash ? '#2e6bff' : '#ff2e2e';
      context.fillRect(1, -W / 2 - 2, 7, 5);
    }
    if (car.kind === 'taxi') {
      context.fillStyle = '#14100a';
      context.fillRect(-4, -W / 2 + 2, 10, 5);
    }
    // Headlights.
    context.fillStyle = '#ffe9a3';
    context.fillRect(L / 2 - 2, -W / 2 + 4, 3, 5);
    context.fillRect(L / 2 - 2, W / 2 - 9, 3, 5);
    context.restore();
  }

  function drawPerson(p, time) {
    if (!p.alive) {
      context.save();
      context.translate(p.x, p.y);
      context.rotate(0.6);
      context.fillStyle = p.shirt;
      context.fillRect(-11, -6, 22, 12);
      context.fillStyle = p.skin;
      context.beginPath();
      context.arc(13, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const bob = p.moving ? Math.sin(p.walkFrame || 0) * 2 : 0;
    context.save();
    context.translate(p.x, p.y + bob);
    // Shadow.
    context.fillStyle = 'rgba(0, 0, 0, 0.25)';
    context.beginPath();
    context.ellipse(0, 8, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    // Body and head, facing the aim angle.
    context.rotate(p.angle);
    context.fillStyle = p.shirt;
    context.beginPath();
    context.arc(0, 0, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = p.skin;
    context.beginPath();
    context.arc(4, 0, 6.5, 0, Math.PI * 2);
    context.fill();
    if (p.kind === 'cop') {
      context.fillStyle = '#0e2a7a';
      context.fillRect(-6, -7, 12, 4);
    }
    context.restore();
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (p.car) return;
    const blink = p.invulnerable > 0 && Math.floor(p.invulnerable * 12) % 2 === 0;
    if (blink) return;
    context.save();
    context.translate(p.x, p.y);
    context.fillStyle = 'rgba(0, 0, 0, 0.3)';
    context.beginPath();
    context.ellipse(0, 9, 11, 4.5, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(p.angle);
    // White jacket, dark jeans, gun in hand.
    context.fillStyle = '#f2f2f2';
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2b33';
    context.fillRect(-8, -9, 6, 18);
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(5, 0, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1c1c22';
    context.fillRect(10, -2, 12, 4);
    context.fillStyle = '#ffb02e';
    context.fillRect(-12, -12, 4, 4);
    context.restore();
    // Aim line, short and subtle.
    context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(p.x + Math.cos(p.angle) * 22, p.y + Math.sin(p.angle) * 22);
    context.lineTo(p.x + Math.cos(p.angle) * 44, p.y + Math.sin(p.angle) * 44);
    context.stroke();
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      const bob = Math.sin(p.bob) * 3;
      context.save();
      context.translate(p.x, p.y + bob);
      if (p.kind === 'cash') {
        context.fillStyle = '#2fae5a';
        context.fillRect(-10, -6, 20, 12);
        context.fillStyle = '#ffd23d';
        context.font = font(11, true);
        context.textAlign = 'center';
        context.fillText('$', 0, 4);
      } else if (p.kind === 'health') {
        context.fillStyle = '#f2f2f2';
        context.fillRect(-9, -9, 18, 18);
        context.fillStyle = '#e5484d';
        context.fillRect(-2, -6, 4, 12);
        context.fillRect(-6, -2, 12, 4);
      } else if (p.kind === 'ammo') {
        context.fillStyle = '#3d3d46';
        context.fillRect(-8, -8, 16, 16);
        context.fillStyle = '#ffd23d';
        context.fillRect(-4, -5, 3, 10);
        context.fillRect(1, -5, 3, 10);
      } else if (p.kind === 'cargo') {
        context.fillStyle = '#8a6f3d';
        context.fillRect(-11, -9, 22, 18);
        context.strokeStyle = '#ffd23d';
        context.lineWidth = 2;
        context.strokeRect(-11, -9, 22, 18);
      }
      context.restore();
    }
  }

  function drawBullets(state) {
    context.strokeStyle = '#ffe9a3';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
  }

  function drawParticles(state) {
    for (const p of state.particles) {
      context.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMarker(state) {
    const objective = state.objective;
    if (!objective || !objective.target) return;
    const t = objective.target;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    // Vertical beam and pulsing ring at the target.
    context.fillStyle = 'rgba(255, 210, 61, 0.12)';
    context.fillRect(t.x - 8, t.y - 260, 16, 260);
    context.strokeStyle = '#ffd23d';
    context.lineWidth = 3;
    context.beginPath();
    context.arc(t.x, t.y, 34 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = '#ffd23d';
    context.save();
    context.translate(t.x, t.y);
    context.rotate(Math.PI / 4);
    context.fillRect(-9, -9, 18, 18);
    context.restore();
    // Off-screen arrow at the screen edge.
    const cam = state.cam;
    const dx = t.x - cam.x;
    const dy = t.y - cam.y;
    const hw = VIEW.width / 2 - 40;
    const hh = VIEW.height / 2 - 40;
    if (Math.abs(dx) > hw || Math.abs(dy) > hh) {
      const scale = Math.min(hw / Math.abs(dx || 1), hh / Math.abs(dy || 1));
      const ax = cam.x + dx * scale;
      const ay = cam.y + dy * scale;
      const angle = Math.atan2(dy, dx);
      context.save();
      context.translate(ax, ay);
      context.rotate(angle);
      context.fillStyle = '#ffd23d';
      context.beginPath();
      context.moveTo(18, 0);
      context.lineTo(-10, -11);
      context.lineTo(-10, 11);
      context.closePath();
      context.fill();
      context.restore();
      text(`${Math.round(Math.hypot(dx, dy))}m`, ax, ay - 16, 14, '#ffd23d', 'center', true);
    }
  }

  // ---------- HUD ----------

  function drawHud(state, screen, ui) {
    const player = state.player;
    // Top-left cluster: wanted stars, health, money, ammo.
    context.fillStyle = PALETTE.hudBg;
    roundRect(12, 12, 300, 96, 10);
    context.fill();
    context.font = font(26, true);
    for (let s = 0; s < 5; s += 1) {
      context.fillStyle = s < state.wanted ? '#ffd23d' : 'rgba(255,255,255,0.22)';
      context.fillText(STAR, 24 + s * 30, 44);
    }
    text(`$${player.money.toLocaleString('en-US')}`, 24, 74, 22, '#7be495', 'left', true);
    text(`Ammo ${player.ammo}`, 170, 74, 18, PALETTE.text, 'left', true);
    // Health bar.
    context.fillStyle = 'rgba(255,255,255,0.2)';
    context.fillRect(24, 84, 200, 12);
    context.fillStyle = player.hp > 30 ? '#4ade80' : '#ff4d3d';
    context.fillRect(24, 84, 200 * clamp(player.hp / 100, 0, 1), 12);
    text(`${Math.max(0, Math.ceil(player.hp))}`, 232, 96, 14, PALETTE.text, 'left', true);

    // Mission objective, top centre.
    const objective = state.objective;
    if (objective) {
      const label = objective.mission ? `${objective.mission.title} — ${objective.text}` : objective.text;
      context.font = font(17, true);
      const w = Math.min(640, context.measureText(label).width + 32);
      context.fillStyle = PALETTE.hudBg;
      roundRect((VIEW.width - w) / 2, 12, w, 40, 10);
      context.fill();
      text(label, VIEW.width / 2, 39, 17, '#ffd23d', 'center', true);
      if (objective.timer > 0) {
        text(`${Math.ceil(objective.timer)}s`, VIEW.width / 2, 66, 16, '#ff8a7a', 'center', true);
      }
    } else if (ui && ui.nextMission) {
      context.fillStyle = PALETTE.hudBg;
      roundRect((VIEW.width - 420) / 2, 12, 420, 40, 10);
      context.fill();
      text('Press N for the next job — Mara is waiting', VIEW.width / 2, 39, 17, PALETTE.text, 'center', true);
    }

    // Bottom-left: controls and speed.
    context.fillStyle = PALETTE.hudBg;
    roundRect(12, VIEW.height - 64, 430, 52, 10);
    context.fill();
    if (player.car) {
      const kmh = Math.round(Math.abs(player.car.speed) * 0.24);
      text(`${kmh} km/h`, 24, VIEW.height - 30, 24, PALETTE.text, 'left', true);
      text('WASD drive · E exit · M mute · P pause', 150, VIEW.height - 30, 15, PALETTE.muted, 'left');
    } else {
      text('WASD move · Mouse aim · Click shoot · F punch', 24, VIEW.height - 38, 15, PALETTE.muted, 'left');
      text('E enter car · Shift run · N next job · P pause', 24, VIEW.height - 20, 15, PALETTE.muted, 'left');
    }

    // Minimap, top right.
    drawMinimap(state);

    // Banner (mission complete / job failed).
    if (state.banner) {
      context.fillStyle = 'rgba(10, 12, 18, 0.85)';
      const bw = 560;
      roundRect((VIEW.width - bw) / 2, 96, bw, 74, 12);
      context.fill();
      text(state.banner.text, VIEW.width / 2, 126, 24, '#ffb02e', 'center', true);
      text(state.banner.sub, VIEW.width / 2, 152, 16, PALETTE.text, 'center');
    }

    // Mute note.
    if (ui && ui.muted) text('Muted (M)', VIEW.width - 12, VIEW.height - 16, 14, PALETTE.muted, 'right');
  }

  function drawMinimap(state) {
    const { x, y, size } = MINIMAP;
    const scale = size / WORLD;
    context.fillStyle = 'rgba(10, 12, 18, 0.8)';
    roundRect(x - 6, y - 6, size + 12, size + 12, 10);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(x, y, size, size);
    context.clip();
    // Sea and sand.
    context.fillStyle = '#2e7fa8';
    context.fillRect(x, y, WATER_EDGE * scale, size);
    context.fillStyle = '#e8cf96';
    context.fillRect(x + WATER_EDGE * scale, y, (SAND_EDGE - WATER_EDGE) * scale, size);
    context.fillStyle = '#20242e';
    context.fillRect(x + SAND_EDGE * scale, y, size - SAND_EDGE * scale, size);
    // Roads.
    context.strokeStyle = '#6a707c';
    context.lineWidth = 2;
    for (const line of ROAD_LINES) {
      context.beginPath();
      context.moveTo(x + line * scale, y);
      context.lineTo(x + line * scale, y + size);
      context.stroke();
      context.beginPath();
      context.moveTo(x, y + line * scale);
      context.lineTo(x + size, y + line * scale);
      context.stroke();
    }
    // Landmarks.
    context.fillStyle = '#ffd23d';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      context.fillRect(x + lm.x * scale - 2, y + lm.y * scale - 2, 4, 4);
    }
    // Mission target.
    const objective = state.objective;
    if (objective && objective.target) {
      context.fillStyle = '#ffd23d';
      context.beginPath();
      context.arc(x + objective.target.x * scale, y + objective.target.y * scale, 5 + Math.sin(state.time * 4) * 1.5, 0, Math.PI * 2);
      context.fill();
    }
    // Police (red) and traffic (grey).
    for (const car of state.cars) {
      if (car.kind === 'police') {
        context.fillStyle = '#ff4d3d';
        context.fillRect(x + car.x * scale - 2, y + car.y * scale - 2, 4, 4);
      } else if (car.kind !== 'player') {
        context.fillStyle = 'rgba(200, 200, 200, 0.7)';
        context.fillRect(x + car.x * scale - 1, y + car.y * scale - 1, 2, 2);
      }
    }
    // Player arrow.
    const player = state.player;
    context.save();
    context.translate(x + player.x * scale, y + player.y * scale);
    context.rotate(player.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    // Viewport box.
    context.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    context.lineWidth = 1;
    context.strokeRect(
      x + (state.cam.x - VIEW.width / 2) * scale,
      y + (state.cam.y - VIEW.height / 2) * scale,
      VIEW.width * scale, VIEW.height * scale,
    );
    context.restore();
    text('SOLMAR CITY', x + size / 2, y + size + 22, 12, PALETTE.muted, 'center', true);
  }

  // ---------- menus ----------

  function drawTitle(state, ui) {
    // Dim the city behind the panel.
    context.fillStyle = 'rgba(8, 10, 16, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const cx = VIEW.width / 2;
    text('SOLMAR HEAT', cx, 150, 84, '#ffb02e', 'center', true);
    text('An open-world crime story in Solmar City', cx, 190, 22, PALETTE.text, 'center');
    text('Leo Marlow came to Solmar for a fresh start. Mara Voss has other plans.', cx, 226, 17, PALETTE.muted, 'center');
    panel(cx - 330, 260, 660, 250);
    const lines = [
      'WASD / arrows — move and drive      Mouse — aim',
      'Click — shoot      F — punch      E — steal / enter a car',
      'Shift — run      N — next job      P — pause      M — mute',
      '',
      'Steal cars, lose the cops, run Mara\u2019s jobs.',
      'Your progress saves — pick up where you left off.',
    ];
    lines.forEach((line, i) => text(line, cx, 292 + i * 30, 17, i < 3 ? PALETTE.text : PALETTE.muted, 'center'));
    const bw = 260;
    const bh = 52;
    button('start', cx - bw - 12, 536, bw, bh, 'Start New Game');
    button('continue', cx + 12, 536, bw, bh, 'Continue', ui.hasSave);
    if (ui.hasSave) {
      text(`Save: $${ui.saveMoney} · ${ui.saveMissions} job${ui.saveMissions === 1 ? '' : 's'} done`, cx, 622, 15, PALETTE.muted, 'center');
    }
    text('An original game — no Rockstar names, art or music.', cx, 668, 13, PALETTE.muted, 'center');
  }

  function drawPaused(state, ui) {
    context.fillStyle = 'rgba(8, 10, 16, 0.6)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const cx = VIEW.width / 2;
    panel(cx - 300, 130, 600, 400);
    text('Paused', cx, 190, 44, PALETTE.text, 'center', true);
    text(`$${state.player.money.toLocaleString('en-US')}  ·  ${state.stats.missionsDone} job${state.stats.missionsDone === 1 ? '' : 's'} done  ·  ${state.stats.carsStolen} cars stolen`, cx, 226, 17, PALETTE.muted, 'center');
    text('Jobs', cx, 268, 20, '#ffd23d', 'center', true);
    MISSIONS.forEach((m, i) => {
      const done = i < state.mission.index || (state.mission.storyDone && i === MISSIONS.length - 1);
      const current = state.mission.active && state.mission.index === i;
      const label = `${done ? '✓ ' : current ? '▶ ' : '· '}${m.title} — $${m.reward}`;
      text(label, cx, 298 + i * 26, 16, done ? '#7be495' : current ? '#ffd23d' : PALETTE.muted, 'center');
    });
    button('resume', cx - 272, 452, 170, 48, 'Resume');
    button('save', cx - 85, 452, 170, 48, 'Save Game');
    button('quit', cx + 102, 452, 170, 48, 'Quit to Title');
    if (ui.savedFlash) text('Saved!', cx, 516, 16, '#7be495', 'center', true);
  }

  function drawOver(state) {
    context.fillStyle = 'rgba(8, 10, 16, 0.72)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const cx = VIEW.width / 2;
    const busted = state.over === 'busted';
    text(busted ? 'BUSTED' : 'WASTED', cx, 250, 84, busted ? '#3d7bff' : '#ff4d3d', 'center', true);
    text(
      busted ? 'The Solmar PD caught up with you. $200 bail, and you start over at the hospital.' : 'Leo is down. The hospital patches him up — the city keeps moving.',
      cx, 300, 18, PALETTE.text, 'center',
    );
    button('respawn', cx - 140, 360, 280, 52, 'Get Back Up');
  }

  /** Paint one frame: the world through the camera, then the HUD or a menu. */
  function draw(state, screen, ui) {
    buttons = [];
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#11141b';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const scale = view.scale;
    context.setTransform(scale, 0, 0, scale, view.x, view.y);
    // Camera: world coordinates into the 1280x720 view.
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake * 18 : 0;
    const camX = clamp(state.cam.x, VIEW.width / 2, WORLD - VIEW.width / 2);
    const camY = clamp(state.cam.y, VIEW.height / 2, WORLD - VIEW.height / 2);
    const left = camX - VIEW.width / 2 + shakeX;
    const top = camY - VIEW.height / 2 + shakeY;
    context.save();
    context.translate(-left, -top);
    const right = left + VIEW.width;
    const bottom = top + VIEW.height;
    drawGround(state, left, top, right, bottom);
    drawRoads(left, top, right, bottom);
    drawBuildings(state, left, top, right, bottom);
    drawPickups(state);
    for (const car of state.cars) drawCar(car, state.time);
    for (const ped of state.peds) drawPerson(ped, state.time);
    for (const g of state.gang) drawPerson(g, state.time);
    drawPlayer(state, state.time);
    drawBullets(state);
    drawParticles(state);
    drawMarker(state);
    context.restore();

    if (screen === SCREEN_TITLE) {
      drawTitle(state, ui);
    } else {
      drawHud(state, screen, ui);
      if (screen === SCREEN_PAUSED) drawPaused(state, ui);
      else if (screen === SCREEN_OVER) drawOver(state);
    }
  }

  /** Buttons drawn by the last frame, in logical 1280x720 coordinates. */
  function lastButtons() {
    return buttons;
  }

  /** Convert a mouse position in CSS pixels over the canvas to logical view coordinates. */
  function toLogical(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - view.x / view.ratio) / (view.scale / view.ratio),
      y: (clientY - rect.top - view.y / view.ratio) / (view.scale / view.ratio),
    };
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, lastButtons, toLogical, view };
}
