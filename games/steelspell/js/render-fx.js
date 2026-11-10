// Drawing what lasts: craters, burning ground, beams, cones, whirlwinds and trails.

function traceSpiral(x, y, r, spin, turns) {
  ctx.beginPath();
  const steps = 36;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = spin + t * turns * TAU;
    const px = x + Math.cos(a) * r * t;
    const py = y + Math.sin(a) * r * t;
    if (i) ctx.lineTo(px, py);
    else ctx.moveTo(px, py);
  }
}

// Craters and fire: a filled circle, fire with a flickering dashed edge.
function drawRoundZone(z, fade) {
  const fire = z.look === 'fire' || z.look === 'trail';
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.globalAlpha = (z.look === 'trail' ? 0.07 : fire ? 0.14 + 0.05 * Math.sin(z.life * 11) : 0.16) * fade;
  ctx.fillStyle = pal[fire ? 'red-pencil' : 'ink-muted'];
  ctx.fill();
  ctx.globalAlpha = (z.look === 'trail' ? 0.45 : 0.8) * fade;
  ctx.strokeStyle = pal[fire ? 'red-pencil' : 'orange-pen'];
  ctx.lineWidth = fire ? (z.look === 'trail' ? 1 : 2) : 1.5;
  ctx.setLineDash(fire ? [10, 7] : []);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawGale(z, fade) {
  const fiery = z.look === 'tornado';
  ctx.beginPath();
  ctx.arc(z.x, z.y, z.r, 0, TAU);
  ctx.globalAlpha = 0.1 * fade;
  ctx.fillStyle = pal[z.pen];
  ctx.fill();
  if (fiery) {
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -z.age * 40;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  ctx.globalAlpha = 0.75 * fade;
  ctx.strokeStyle = pal[fiery ? 'orange-pen' : z.pen];
  ctx.lineWidth = 2;
  for (let arm = 0; arm < 2; arm++) {
    traceSpiral(z.x, z.y, z.r, -z.age * 7 + arm * Math.PI, 1.6);
    ctx.stroke();
  }
}

function strokeBeam(x0, y0, x1, y1, width, fade, pen) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.globalAlpha = 0.3 * fade;
  ctx.strokeStyle = pal[pen];
  ctx.lineWidth = width;
  ctx.stroke();
  ctx.globalAlpha = 0.95 * fade;
  ctx.lineWidth = Math.max(1.5, width * 0.3);
  ctx.stroke();
}

// As wide as what it really hits, with a little flicker.
function drawLaser(z, fade) {
  const d = z.w.cfg;
  const width = z.half * 2 * (0.8 + 0.2 * Math.sin(z.life * 45));
  ctx.lineCap = 'round';
  if (d.prism && z.split) {
    strokeBeam(z.x, z.y, z.split.x, z.split.y, width, fade, z.pen);
    for (let i = 0; i < d.prism; i++) {
      const a = z.a + (i - (d.prism - 1) / 2) * d.prismFan;
      strokeBeam(z.split.x, z.split.y, z.split.x + Math.cos(a) * d.prismLength, z.split.y + Math.sin(a) * d.prismLength, width, fade, z.pen);
    }
  } else {
    strokeBeam(z.x, z.y, z.x + Math.cos(z.a) * z.length, z.y + Math.sin(z.a) * z.length, width, fade, z.pen);
  }
  ctx.lineCap = 'butt';
}

function drawFlame(z, fade) {
  ctx.beginPath();
  ctx.moveTo(z.x, z.y);
  ctx.arc(z.x, z.y, z.length, z.a - z.half, z.a + z.half);
  ctx.closePath();
  ctx.globalAlpha = (0.2 + 0.08 * Math.sin(z.life * 23)) * fade;
  ctx.fillStyle = pal[z.pen];
  ctx.fill();
  ctx.globalAlpha = 0.8 * fade;
  ctx.strokeStyle = pal['orange-pen'];
  ctx.lineWidth = 1.5;
  ctx.setLineDash([9, 6]);
  ctx.lineDashOffset = z.life * 60;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

// Beams and cones start at the hero and are drawn over the horde; the rest lies under it.
const BEAM_DRAW = { laser: drawLaser, flame: drawFlame };
const GROUND_DRAW = { gale: drawGale, tornado: drawGale };

function drawZones() {
  for (const z of zones) {
    if (BEAM_DRAW[z.look] || !onScreen(z.x, z.y, z.r)) continue;
    (GROUND_DRAW[z.look] || drawRoundZone)(z, Math.min(1, z.life / 0.5));
  }
  ctx.globalAlpha = 1;
}

function drawBeams() {
  for (const z of zones) {
    if (BEAM_DRAW[z.look]) BEAM_DRAW[z.look](z, Math.min(1, z.life / 0.3));
  }
  ctx.globalAlpha = 1;
}

// ---- What the horde throws ----

// Physical shots are orange circles, magic ones violet diamonds, both outlined in ink so
// that they read on either theme.
function drawEnemyShots() {
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1;
  for (const s of enemyShots) {
    if (s.dead || !onScreen(s.x, s.y, 12)) continue;
    ctx.beginPath();
    if (s.kind === 'magic') {
      const r = s.r * 1.25;
      ctx.moveTo(s.x, s.y - r);
      ctx.lineTo(s.x + r, s.y);
      ctx.lineTo(s.x, s.y + r);
      ctx.lineTo(s.x - r, s.y);
      ctx.closePath();
    } else {
      ctx.arc(s.x, s.y, s.r, 0, TAU);
    }
    ctx.fillStyle = pal[KINDS[s.kind].pen];
    ctx.fill();
    ctx.stroke();
  }
}

// A strike on its way: the dashed outline is where it lands, the fill grows as it nears.
function drawWarnings() {
  ctx.strokeStyle = pal['red-pencil'];
  ctx.fillStyle = pal['red-pencil'];
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 5]);
  for (const w of warnings) {
    const k = 1 - w.life / w.max; // from 0 up to 1
    ctx.beginPath();
    if (w.shape === 'line') {
      const cx = Math.cos(w.a);
      const cy = Math.sin(w.a);
      ctx.moveTo(w.x - cy * w.half, w.y + cx * w.half);
      ctx.lineTo(w.x + cx * w.length - cy * w.half, w.y + cy * w.length + cx * w.half);
      ctx.lineTo(w.x + cx * w.length + cy * w.half, w.y + cy * w.length - cx * w.half);
      ctx.lineTo(w.x + cy * w.half, w.y - cx * w.half);
      ctx.closePath();
      ctx.globalAlpha = 0.1 + 0.2 * k;
      ctx.fill();
    } else {
      ctx.arc(w.x, w.y, w.r, 0, TAU);
      ctx.globalAlpha = 0.1;
      ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.r * k, 0, TAU);
      ctx.globalAlpha = 0.25;
      ctx.fill();
      continue;
    }
    ctx.globalAlpha = 0.9;
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}
