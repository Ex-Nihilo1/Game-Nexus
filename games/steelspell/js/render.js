// Drawing the world.

function onScreen(x, y, pad) {
  return x > cam.x - pad && x < cam.x + view.w + pad && y > cam.y - pad && y < cam.y + view.h + pad;
}

function gridLines(step, pen) {
  ctx.beginPath();
  for (let x = Math.floor(cam.x / step) * step; x < cam.x + view.w; x += step) {
    ctx.moveTo(x, cam.y);
    ctx.lineTo(x, cam.y + view.h);
  }
  for (let y = Math.floor(cam.y / step) * step; y < cam.y + view.h; y += step) {
    ctx.moveTo(cam.x, y);
    ctx.lineTo(cam.x + view.w, y);
  }
  ctx.strokeStyle = pen;
  ctx.lineWidth = 1 / view.scale;
  ctx.stroke();
}

function drawGround() {
  ctx.fillStyle = pal.paper;
  ctx.fillRect(cam.x, cam.y, view.w, view.h);
  gridLines(20, pal['grid-minor']);
  gridLines(100, pal['grid-major']);
}

function drawZones() {
  for (const z of zones) {
    if (!onScreen(z.x, z.y, z.r)) continue;
    const fade = Math.min(1, z.life / 0.5);
    const fire = z.look === 'fire';
    ctx.beginPath();
    ctx.arc(z.x, z.y, z.r, 0, TAU);
    ctx.globalAlpha = (fire ? 0.14 + 0.05 * Math.sin(z.life * 11) : 0.16) * fade;
    ctx.fillStyle = pal[fire ? 'red-pencil' : 'ink-muted'];
    ctx.fill();
    ctx.globalAlpha = 0.8 * fade;
    ctx.strokeStyle = pal[fire ? 'red-pencil' : 'orange-pen'];
    ctx.lineWidth = fire ? 2 : 1.5;
    ctx.setLineDash(fire ? [10, 7] : []);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }
}

function drawOrbs() {
  ctx.beginPath();
  for (const o of orbs) {
    if (!onScreen(o.x, o.y, 10)) continue;
    const r = o.value >= Math.max(5, xpNext * 0.1) ? 7 : 4.5; // the big ones are worth walking to
    ctx.moveTo(o.x, o.y - r);
    ctx.lineTo(o.x + r, o.y);
    ctx.lineTo(o.x, o.y + r);
    ctx.lineTo(o.x - r, o.y);
    ctx.closePath();
  }
  ctx.fillStyle = pal['green-ink'];
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 0.75;
  ctx.stroke();
}

function drawRedOrbs() {
  const r = 7.5;
  for (const o of redOrbs) {
    if (!onScreen(o.x, o.y, 12)) continue;
    ctx.beginPath();
    ctx.arc(o.x, o.y, r, 0, TAU);
    ctx.fillStyle = pal['red-pencil'];
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(o.x - 4, o.y);
    ctx.lineTo(o.x + 4, o.y);
    ctx.moveTo(o.x, o.y - 4);
    ctx.lineTo(o.x, o.y + 4);
    ctx.strokeStyle = pal.paper;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawChests() {
  for (const c of chests) {
    if (!onScreen(c.x, c.y, 20)) continue;
    ctx.fillStyle = pal[CHESTS[c.type].pen];
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 1.5;
    ctx.fillRect(c.x - 12, c.y - 9, 24, 18);
    ctx.strokeRect(c.x - 12, c.y - 9, 24, 18);
    ctx.beginPath();
    ctx.moveTo(c.x - 12, c.y - 2);
    ctx.lineTo(c.x + 12, c.y - 2);
    ctx.stroke();
  }
}

function traceBody(e) {
  const { x, y, r } = e;
  switch (e.def.shape) {
    case 'square':
      ctx.rect(x - r * 0.88, y - r * 0.88, r * 1.76, r * 1.76);
      break;
    case 'diamond':
      ctx.moveTo(x, y - r * 1.15);
      ctx.lineTo(x + r * 1.15, y);
      ctx.lineTo(x, y + r * 1.15);
      ctx.lineTo(x - r * 1.15, y);
      ctx.closePath();
      break;
    case 'triangle': {
      const a = Math.atan2(hero.y - y, hero.x - x);
      ctx.moveTo(x + Math.cos(a) * r * 1.3, y + Math.sin(a) * r * 1.3);
      ctx.lineTo(x + Math.cos(a + 2.4) * r, y + Math.sin(a + 2.4) * r);
      ctx.lineTo(x + Math.cos(a - 2.4) * r, y + Math.sin(a - 2.4) * r);
      ctx.closePath();
      break;
    }
    default:
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, TAU);
  }
}

// The outline tells the armor: orange blunts physical damage, violet blunts magic.
function drawEnemies() {
  for (const def of ENEMY_LIST) {
    ctx.beginPath();
    for (const e of enemies) if (e.def === def && onScreen(e.x, e.y, 30)) traceBody(e);
    ctx.fillStyle = pal[def.pen];
    ctx.fill();
    const armored = def.armor >= 0.3;
    const warded = def.ward >= 0.3;
    ctx.strokeStyle = armored ? pal[KINDS.phys.pen] : warded ? pal[KINDS.magic.pen] : pal.ink;
    ctx.lineWidth = armored || warded ? 3 : 1;
    ctx.stroke();
  }
  ctx.fillStyle = pal.paper;
  for (const e of enemies) {
    if (!onScreen(e.x, e.y, 30)) continue;
    if (e.flash > 0) {
      ctx.globalAlpha = 0.65;
      ctx.beginPath();
      traceBody(e);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (e.slowLeft > 0 || e.freezeLeft > 0) {
      ctx.strokeStyle = pal['blue-pen'];
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r + 3, 0, TAU);
      ctx.stroke();
    }
    if (e.def.elite) {
      const w = e.r * 2.4;
      ctx.fillStyle = pal.desk;
      ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w, 5);
      ctx.fillStyle = pal['red-pencil'];
      ctx.fillRect(e.x - w / 2, e.y - e.r - 13, w * Math.max(0, e.hp / e.maxHp), 5);
      ctx.fillStyle = pal.paper;
    }
  }
}

function drawShots() {
  ctx.lineCap = 'round';
  for (const s of shots) {
    if (!onScreen(s.x, s.y, 40)) continue;
    const pen = pal[s.pen];
    if (s.look === 'ball') {
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
    } else if (s.look === 'arrow') {
      // As wide as what it really hits, so growing in Size shows.
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.beginPath();
      ctx.moveTo(s.r * 0.5 + 6, 0);
      ctx.lineTo(-s.r * 0.9 - 4, -s.r);
      ctx.lineTo(-s.r * 0.35, 0);
      ctx.lineTo(-s.r * 0.9 - 4, s.r);
      ctx.closePath();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pen;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-s.r * 0.35, 0);
      ctx.lineTo(-s.r * 0.35 - s.len, 0);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    } else if (s.look === 'boomerang') {
      const r = s.r;
      ctx.beginPath();
      ctx.moveTo(s.x + Math.cos(s.spin) * r, s.y + Math.sin(s.spin) * r);
      ctx.lineTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(s.spin + 1.9) * r, s.y + Math.sin(s.spin + 1.9) * r);
      ctx.strokeStyle = pen;
      ctx.lineWidth = 4;
      ctx.stroke();
    } else if (s.look === 'rocket') {
      const k = s.r / 8;
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.a);
      ctx.scale(k, k);
      ctx.beginPath();
      ctx.moveTo(-10, -3);
      ctx.lineTo(-18 - s.speed / 60, 0);
      ctx.lineTo(-10, 3);
      ctx.closePath();
      ctx.fillStyle = pal.highlighter;
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(13, 0);
      ctx.lineTo(4, -5);
      ctx.lineTo(-10, -5);
      ctx.lineTo(-10, 5);
      ctx.lineTo(4, 5);
      ctx.closePath();
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    } else if (s.look === 'drone') {
      // The disc is what it really hits, so growing in Size shows.
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = pen;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = pal.ink;
      for (let i = 0; i < 4; i++) {
        const a = s.a + TAU / 8 + i * TAU / 4;
        const ax = s.x + Math.cos(a) * 11;
        const ay = s.y + Math.sin(a) * 11;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(ax, ay);
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ax - Math.cos(s.spin + i) * 6, ay - Math.sin(s.spin + i) * 6);
        ctx.lineTo(ax + Math.cos(s.spin + i) * 6, ay + Math.sin(s.spin + i) * 6);
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.rect(s.x - 5, s.y - 5, 10, 10);
      ctx.fillStyle = pen;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  ctx.lineCap = 'butt';
}

// A shaft out to `reach` from the hero, drawn in the rotated frame of the weapon.
function drawSpearhead(w, reach, size) {
  const tip = reach + w.thrust * 8 * size;
  ctx.beginPath();
  ctx.moveTo(hero.r, 0);
  ctx.lineTo(tip - 22 * size, 0);
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 2 + size;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tip, 0);
  ctx.lineTo(tip - 24 * size, -8 * size);
  ctx.lineTo(tip - 18 * size, 0);
  ctx.lineTo(tip - 24 * size, 8 * size);
  ctx.closePath();
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.stroke();
}

// The zone it hurts is drawn like the Aura, with the spear itself on top.
function drawSpear(w, angle) {
  const size = weaponSize(w);
  const length = w.cfg.length * size;
  const width = w.cfg.width * size;
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.rect(0, -width / 2, length, width);
  ctx.globalAlpha = 0.1 + 0.16 * w.thrust;
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pal[w.def.pen];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  drawSpearhead(w, length, size);
  ctx.restore();
}

function drawRadiantLance(w) {
  const size = weaponSize(w);
  const { x, y, long, wide } = lanceOval(w);
  ctx.beginPath();
  ctx.ellipse(x, y, long, wide, w.angle, 0, TAU);
  ctx.globalAlpha = 0.1 + 0.14 * w.thrust;
  ctx.fillStyle = pal[w.def.pen];
  ctx.fill();
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = pal[w.def.pen];
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.save();
  ctx.translate(hero.x, hero.y);
  ctx.rotate(w.angle);
  drawSpearhead(w, w.cfg.length * size, size);
  ctx.restore();
}

function drawHeroEffects() {
  const { x, y, r } = hero;
  const spear = owned('spear');
  if (spear) drawSpear(spear, spear.angle);
  if (spear && spear.cfg.back) drawSpear(spear, spear.angle + Math.PI);
  const lance = owned('radiantlance');
  if (lance) drawRadiantLance(lance);
  const aura = owned('aura') || owned('fireshield');
  if (aura) {
    ctx.beginPath();
    ctx.arc(x, y, auraRadius(aura), 0, TAU);
    ctx.globalAlpha = 0.1;
    ctx.fillStyle = pal[aura.def.pen];
    ctx.fill();
    ctx.globalAlpha = 0.7;
    ctx.strokeStyle = pal[aura.def.pen];
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  const dash = owned('phase');
  if (dash && hero.phaseLeft > 0) {
    ctx.beginPath();
    ctx.arc(x, y, auraRadius(dash), 0, TAU);
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = pal[dash.def.pen];
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  const shield = chargedWeapon();
  if (shield) {
    ctx.strokeStyle = pal[shield.def.pen];
    ctx.lineWidth = 2;
    for (let i = 0; i < shield.charges; i++) {
      ctx.beginPath();
      ctx.arc(x, y, r + 5 + i * 4, 0, TAU);
      ctx.stroke();
    }
  }
  if (berserkLeft > 0) {
    ctx.strokeStyle = pal['red-pencil'];
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(x, y, r + 15, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawHero() {
  const { x, y, r } = hero;
  const phased = hero.ghostLeft > 0 || hero.phaseLeft > 0;
  const blink = hero.iframes > 0 && Math.floor(elapsed * 20) % 2 === 0;
  ctx.globalAlpha = phased ? 0.45 : blink ? 0.6 : 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fillStyle = pal['red-pencil'];
  ctx.fill();
  ctx.strokeStyle = pal.ink;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + hero.faceX * r * 0.3, y + hero.faceY * r * 0.3);
  ctx.lineTo(x + hero.faceX * (r + 6), y + hero.faceY * (r + 6));
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.globalAlpha = 1;

  const w = 34;
  ctx.fillStyle = pal.desk;
  ctx.fillRect(x - w / 2, y + r + 6, w, 4);
  ctx.fillStyle = pal[hero.hp / hero.maxHp > 0.35 ? 'green-ink' : 'red-pencil'];
  ctx.fillRect(x - w / 2, y + r + 6, w * Math.max(0, hero.hp / hero.maxHp), 4);
}

function drawFx() {
  ctx.lineCap = 'round';
  for (const f of fx) {
    const k = f.life / f.max; // runs from 1 down to 0
    const pen = pal[f.pen];
    ctx.strokeStyle = pen;
    switch (f.type) {
      case 'ring':
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k * 0.4), 0, TAU);
        ctx.globalAlpha = k * 0.25;
        ctx.fillStyle = pen;
        ctx.fill();
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'bolt':
        ctx.beginPath();
        f.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.globalAlpha = k;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        break;
      case 'tracer':
        ctx.beginPath();
        ctx.moveTo(f.x0, f.y0);
        ctx.lineTo(f.x, f.y);
        ctx.globalAlpha = k;
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      case 'swing':
        ctx.beginPath();
        ctx.moveTo(hero.x, hero.y);
        ctx.arc(hero.x, hero.y, f.r, f.a - f.span / 2, f.a + f.span / 2);
        ctx.closePath();
        ctx.globalAlpha = k * 0.3;
        ctx.fillStyle = pen;
        ctx.fill();
        ctx.globalAlpha = k;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      case 'telegraph':
        ctx.globalAlpha = 0.8;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 5]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * (1 - k), 0, TAU);
        ctx.stroke();
        break;
    }
  }
  ctx.globalAlpha = 1;
  ctx.lineCap = 'butt';
}

function drawNumbers() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const n of numbers) {
    ctx.globalAlpha = Math.min(1, n.life * 3);
    ctx.font = `600 ${n.size}px ${FONT}`;
    ctx.fillStyle = pal[n.pen];
    ctx.fillText(n.text, n.x, n.y);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  dirty = false;
  cam.x = hero.x - view.w / 2;
  cam.y = hero.y - view.h / 2;
  const s = view.scale * DPR;
  ctx.setTransform(s, 0, 0, s, -cam.x * s, -cam.y * s);
  ctx.lineJoin = 'round';
  drawGround();
  drawZones();
  drawChests();
  drawOrbs();
  drawRedOrbs();
  drawEnemies();
  drawShots();
  drawHeroEffects();
  drawHero();
  drawFx();
  drawNumbers();
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (phase !== 'start') {
    drawHud();
    updateActiveButton();
  }
}

function resize() {
  const box = stageEl.getBoundingClientRect();
  view.cssW = Math.max(1, Math.round(box.width));
  view.cssH = Math.max(1, Math.round(box.height));
  view.scale = Math.max(MIN_SCALE, Math.min(view.cssW, view.cssH) / VIEW_SHORT);
  view.w = view.cssW / view.scale;
  view.h = view.cssH / view.scale;
  canvas.width = Math.round(view.cssW * DPR);
  canvas.height = Math.round(view.cssH * DPR);
  dirty = true;
}

function readTheme() {
  pal = Theme.palette();
  dirty = true;
}
