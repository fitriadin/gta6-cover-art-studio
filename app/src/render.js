// The cover renderer: draws the whole poster onto a 2D canvas — backdrop,
// graded photo panels with keyline frames, bold lettering, badge and grain.
// The same function paints the live preview and the exported PNG; only the
// canvas size changes.

import { gradeById, buildGradeLookup, applyGradeToPixels } from './grades.js';
import { layoutById, layoutCells, layoutTitleZone } from './layouts.js';

const GRADED_MAX_SIDE = 1200;
const gradedCache = new Map();

let noiseCanvas = null;

function getNoiseCanvas() {
  if (noiseCanvas) return noiseCanvas;
  const size = 160;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(Math.random() * 255);
    img.data[i] = v;
    img.data[i + 1] = v;
    img.data[i + 2] = v;
    img.data[i + 3] = 28;
  }
  g.putImageData(img, 0, 0);
  noiseCanvas = c;
  return c;
}

// Grade a photo once per grade and cache the result, so dragging a crop
// never re-runs the pixel pass.
export function gradedPhotoCanvas(photo, gradeId) {
  const key = `${photo.id}:${gradeId}`;
  const hit = gradedCache.get(key);
  if (hit) return hit;
  const grade = gradeById(gradeId);
  const lut = buildGradeLookup(grade);
  const scale = Math.min(1, GRADED_MAX_SIDE / Math.max(photo.img.naturalWidth, photo.img.naturalHeight));
  const w = Math.max(1, Math.round(photo.img.naturalWidth * scale));
  const h = Math.max(1, Math.round(photo.img.naturalHeight * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  g.drawImage(photo.img, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  applyGradeToPixels(img.data, lut, grade.strength);
  g.putImageData(img, 0, 0);
  if (gradedCache.size > 24) gradedCache.clear();
  gradedCache.set(key, c);
  return c;
}

// Cover-fit draw with a pan/zoom transform. ox/oy run -1..1 across the
// overflow; zoom 1..3 magnifies from the cover fit.
function drawPanelPhoto(ctx, cell, source, transform) {
  const iw = source.width;
  const ih = source.height;
  const base = Math.max(cell.w / iw, cell.h / ih);
  const scale = base * (transform.zoom || 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const overX = Math.max(0, dw - cell.w);
  const overY = Math.max(0, dh - cell.h);
  const dx = cell.x - overX * (0.5 + (transform.ox || 0) * 0.5);
  const dy = cell.y - overY * (0.5 + (transform.oy || 0) * 0.5);
  ctx.drawImage(source, dx, dy, dw, dh);
}

function drawEmptyPanel(ctx, cell, index, W) {
  const g = ctx.createLinearGradient(cell.x, cell.y, cell.x, cell.y + cell.h);
  g.addColorStop(0, '#1e2745');
  g.addColorStop(1, '#0d1226');
  ctx.fillStyle = g;
  ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(cell.x, cell.y, cell.w, cell.h);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255,246,232,0.07)';
  ctx.lineWidth = Math.max(2, W * 0.004);
  const step = Math.max(18, W * 0.03);
  for (let x = -cell.h; x < cell.w + cell.h; x += step) {
    ctx.beginPath();
    ctx.moveTo(cell.x + x, cell.y + cell.h);
    ctx.lineTo(cell.x + x + cell.h, cell.y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.fillStyle = 'rgba(255,246,232,0.65)';
  ctx.font = `${Math.round(Math.min(cell.w, cell.h) * 0.16)}px Anton, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`PANEL ${index + 1}`, cell.x + cell.w / 2, cell.y + cell.h / 2);
}

function drawBackdrop(ctx, W, H, kind) {
  if (kind === 'paper') {
    ctx.fillStyle = '#fff6e8';
    ctx.fillRect(0, 0, W, H);
    return;
  }
  if (kind === 'sunset') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b1055');
    g.addColorStop(0.45, '#7597de');
    g.addColorStop(0.62, '#ff7e5f');
    g.addColorStop(0.8, '#feb47b');
    g.addColorStop(1, '#ffd194');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // Low sun disc with horizontal slits, the retro sunset mark.
    const sunR = Math.min(W, H) * 0.17;
    const sunX = W * 0.5;
    const sunY = H * 0.52;
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();
    const sg = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    sg.addColorStop(0, '#ffe259');
    sg.addColorStop(1, '#ff7518');
    ctx.fillStyle = sg;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);
    ctx.fillStyle = '#ff7e5f';
    let slitY = sunY + sunR * 0.05;
    let slitH = sunR * 0.05;
    while (slitY < sunY + sunR) {
      ctx.fillRect(sunX - sunR, slitY, sunR * 2, slitH);
      slitY += slitH * 2.4;
      slitH *= 1.35;
    }
    ctx.restore();
    return;
  }
  ctx.fillStyle = '#0d1226';
  ctx.fillRect(0, 0, W, H);
}

function starPath(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + Math.cos(a) * rad;
    const y = cy + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export function drawStarRow(ctx, cx, cy, starR, count, total = 5) {
  const gap = starR * 2.5;
  const startX = cx - ((total - 1) * gap) / 2;
  for (let i = 0; i < total; i++) {
    const x = startX + i * gap;
    starPath(ctx, x, cy, starR);
    if (i < count) {
      ctx.fillStyle = '#ffc93d';
      ctx.fill();
      ctx.lineWidth = Math.max(1, starR * 0.14);
      ctx.strokeStyle = '#14101f';
      ctx.stroke();
    } else {
      ctx.lineWidth = Math.max(1, starR * 0.14);
      ctx.strokeStyle = 'rgba(20,16,31,0.55)';
      ctx.stroke();
    }
  }
}

// Fit the title into a zone: shrink the font until the single line fits.
// Only when it still does not fit at the floor size does it wrap to two
// lines, at the most even word break — a two-line title must stay the
// exception, since short zones cannot hold the taller stack.
function fitTitleLines(ctx, text, maxWidth, startSize) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  let size = startSize;
  const lines = [text];
  const measure = (s) => {
    ctx.font = `${s}px Anton, "Arial Narrow", sans-serif`;
    return ctx.measureText(text).width;
  };
  while (size > 18 && measure(size) > maxWidth) {
    size = Math.floor(size * 0.94);
  }
  if (words.length > 1 && measure(size) > maxWidth) {
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' ');
      const b = words.slice(i).join(' ');
      ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
      const w = Math.max(ctx.measureText(a).width, ctx.measureText(b).width);
      if (!best || w < best.w) best = { lines: [a, b], w };
    }
    if (best) return { lines: best.lines, size };
  }
  return { lines, size };
}

function paintTitleText(ctx, text, x, y, size, style, align, W) {
  ctx.font = `${size}px Anton, "Arial Narrow", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  try {
    ctx.letterSpacing = `${Math.round(size * 0.02)}px`;
  } catch {
    /* letterSpacing is Chrome-only; ignore elsewhere */
  }
  const outline = Math.max(2, size * 0.09);
  const shadow = Math.max(3, size * 0.07);
  ctx.save();
  if (style === 'neon') {
    ctx.shadowColor = '#ff2e88';
    ctx.shadowBlur = size * 0.35;
  } else {
    ctx.shadowColor = 'rgba(10,8,20,0.85)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = shadow;
    ctx.shadowOffsetY = shadow;
  }
  if (style === 'sunset') {
    const g = ctx.createLinearGradient(0, y - size, 0, y + size * 0.15);
    g.addColorStop(0, '#ffd166');
    g.addColorStop(0.45, '#ff6b3d');
    g.addColorStop(1, '#ff2e88');
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = '#fff6e8';
  }
  ctx.lineJoin = 'round';
  ctx.lineWidth = outline;
  ctx.strokeStyle = '#14101f';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
  try {
    ctx.letterSpacing = '0px';
  } catch {
    /* ignore */
  }
}

function drawTitleBlock(ctx, zone, state, W, H) {
  const { title, subtitle, lettering, titleSize, badge, stars, place } = state;
  const scale = titleSize || 1;
  const zonePad = Math.min(zone.w, zone.h) * 0.08;
  const innerW = zone.w - zonePad * 2;
  const isCenter = zone.align === 'center';
  // Poster lettering is always set in caps, whatever the user typed.
  const displayTitle = (title || 'UNTITLED').toUpperCase();

  // The star row belongs to roomy title zones (the grid's centre cell,
  // the snapshots header). Over a photo or in the title band the ribbon
  // already carries the badge, and stars there collide with panel edges.
  const showStars = badge && !zone.overPhoto && !zone.band && zone.h > H * 0.15;
  // The place line only fits inside the grid's paper title cell; every
  // other layout shows the place on the ribbon instead.
  const showPlace = showStars && zone.align === 'center' && zone.h > H * 0.2 && place;

  // Scrim so the title stays readable over a photo.
  if (zone.overPhoto) {
    const g = ctx.createLinearGradient(0, zone.y - zone.h * 0.35, 0, zone.y + zone.h);
    g.addColorStop(0, 'rgba(8,6,18,0)');
    g.addColorStop(1, 'rgba(8,6,18,0.72)');
    ctx.fillStyle = g;
    ctx.fillRect(0, zone.y - zone.h * 0.35, W, zone.h * 1.35);
  }
  if (zone.band) {
    ctx.fillStyle = '#14101f';
    ctx.fillRect(0, zone.y - zone.h * 0.12, W, zone.h * 1.24);
  }

  const titleStart = Math.round(Math.min(zone.h * 0.52, zone.w * 0.22) * scale);
  const fitted = fitTitleLines(ctx, displayTitle, innerW, titleStart);
  const lines = fitted.lines;
  let size = fitted.size;

  // Stack geometry, recomputed as the title shrinks: title, subtitle,
  // then the badge block. If the stack is taller than the zone, shrink
  // the whole stack until it fits instead of overflowing the cell.
  const stackMetrics = (s) => {
    const lineH = s * 1.02;
    const subSize = Math.round(Math.min(s * 0.34, zone.h * 0.16));
    const starR = Math.round(Math.min(s * 0.16, zone.h * 0.1));
    let badgeH = 0;
    if (showStars) badgeH = starR * 2.2 + (showPlace ? starR * 3.3 : 0);
    const stackH = lineH * lines.length + (subtitle ? subSize * 1.5 : 0) + badgeH;
    return { lineH, subSize, starR, stackH };
  };
  let m = stackMetrics(size);
  while (m.stackH > zone.h * 0.94 && size > 14) {
    size = Math.floor(size * 0.9);
    m = stackMetrics(size);
  }

  const x = isCenter ? zone.x + zone.w / 2 : zone.x + zonePad;
  const align = isCenter ? 'center' : 'left';

  let cursorY;
  if (zone.overPhoto || zone.band) {
    cursorY = zone.y + zone.h - (m.stackH - m.lineH * lines.length) - size * 0.12;
  } else {
    cursorY = zone.y + (zone.h - m.stackH) / 2 + size * 0.82;
  }
  lines.forEach((line, i) => {
    paintTitleText(ctx, line, x, cursorY + i * m.lineH, size, lettering, align, W);
  });
  let afterTitle = cursorY + (lines.length - 1) * m.lineH + size * 0.18;

  if (subtitle) {
    ctx.font = `${m.subSize}px Pacifico, cursive`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = zone.overPhoto || zone.band ? '#ffd166' : '#e8531f';
    ctx.fillText(subtitle, x, afterTitle + m.subSize);
    afterTitle += m.subSize * 1.5;
  }

  if (showStars) {
    const starY = afterTitle + m.starR * 1.2;
    drawStarRow(ctx, isCenter ? x : x + m.starR * 5.4, starY, m.starR, stars || 5);
    if (showPlace) {
      ctx.font = `${Math.round(m.starR * 0.9)}px Anton, sans-serif`;
      ctx.textAlign = align;
      ctx.fillStyle = '#14101f';
      ctx.fillText(place.toUpperCase(), x, starY + m.starR * 2.4);
    }
  }
}

function drawPlaceRibbon(ctx, W, H, place, state) {
  if (!state.badge || !place) return;
  const text = place.toUpperCase();
  const fontSize = Math.round(Math.min(W, H) * 0.022);
  ctx.save();
  ctx.font = `${fontSize}px Anton, sans-serif`;
  const textW = ctx.measureText(text).width;
  const padX = fontSize * 0.9;
  const padY = fontSize * 0.5;
  const bw = textW + padX * 2;
  const bh = fontSize + padY * 2;
  const margin = Math.round(Math.min(W, H) * 0.025);
  // A sticker tag in the top-right corner, tilted a touch and fully
  // inside the canvas — never clipped by the edge.
  ctx.translate(W - margin - bw / 2, margin + bh / 2);
  ctx.rotate(0.06);
  ctx.shadowColor = 'rgba(10,8,20,0.4)';
  ctx.shadowBlur = Math.round(fontSize * 0.4);
  ctx.shadowOffsetY = Math.round(fontSize * 0.15);
  ctx.fillStyle = '#ff2e88';
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = '#fff6e8';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, fontSize * 0.06);
  ctx.restore();
}

function drawGrainAndVignette(ctx, W, H) {
  const noise = getNoiseCanvas();
  const pattern = ctx.createPattern(noise, 'repeat');
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const v = ctx.createRadialGradient(
    W / 2, H / 2, Math.min(W, H) * 0.42,
    W / 2, H / 2, Math.max(W, H) * 0.75,
  );
  v.addColorStop(0, 'rgba(8,6,18,0)');
  v.addColorStop(1, 'rgba(8,6,18,0.26)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);
}

// Main entry: paint the cover described by `state` onto `canvas`.
// `photos` is the array of loaded photos ({id, img}); panels reference
// them by id. The canvas keeps whatever size it already has.
export function renderCover(canvas, state, photos) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d');
  const layout = layoutById(state.layout);
  const byId = new Map(photos.map((p) => [p.id, p]));

  drawBackdrop(ctx, W, H, layout.backdrop);

  const cells = layoutCells(layout, W, H);
  const keyline = Math.max(2, Math.round(W * 0.004));
  const frame = layout.id === 'snaps' ? Math.max(6, Math.round(W * 0.012)) : 0;

  cells.forEach((cell, i) => {
    const panel = state.panels[i] || { photo: null, zoom: 1, ox: 0, oy: 0 };
    const photo = panel.photo ? byId.get(panel.photo) : null;
    // Rotated cells draw in a translated frame, so the photo rect moves
    // to the origin while the keyline below uses the original rect.
    let drawCell = cell;
    ctx.save();
    if (cell.rot) {
      ctx.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
      ctx.rotate((cell.rot * Math.PI) / 180);
      ctx.translate(-cell.w / 2, -cell.h / 2);
      drawCell = { x: 0, y: 0, w: cell.w, h: cell.h, rot: 0 };
    }
    if (frame) {
      ctx.shadowColor = 'rgba(10,8,20,0.45)';
      ctx.shadowBlur = Math.round(W * 0.02);
      ctx.shadowOffsetY = Math.round(W * 0.008);
      ctx.fillStyle = '#fff6e8';
      ctx.fillRect(drawCell.x - frame, drawCell.y - frame, drawCell.w + frame * 2, drawCell.h + frame * 2);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetY = 0;
    }
    ctx.beginPath();
    ctx.rect(drawCell.x, drawCell.y, drawCell.w, drawCell.h);
    ctx.clip();
    if (photo && photo.img && photo.img.naturalWidth) {
      const graded = gradedPhotoCanvas(photo, state.grade);
      drawPanelPhoto(ctx, drawCell, graded, panel);
    } else {
      drawEmptyPanel(ctx, drawCell, i, W);
    }
    ctx.restore();

    // Keyline frame, drawn unclipped so it sits on top of the photo.
    ctx.save();
    if (cells[i].rot) {
      ctx.translate(cells[i].x + cells[i].w / 2, cells[i].y + cells[i].h / 2);
      ctx.rotate((cells[i].rot * Math.PI) / 180);
      ctx.translate(-cells[i].w / 2, -cells[i].h / 2);
      ctx.strokeStyle = frame ? 'rgba(20,16,31,0.25)' : '#fff6e8';
      ctx.lineWidth = frame ? 1 : keyline;
      ctx.strokeRect(0, 0, cells[i].w, cells[i].h);
    } else {
      ctx.strokeStyle = frame ? 'rgba(20,16,31,0.25)' : '#fff6e8';
      ctx.lineWidth = frame ? 1 : keyline;
      ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
    }
    ctx.restore();
  });

  // Title block. The grid's centre cell gets a paper card behind it.
  const zone = layoutTitleZone(layout, W, H);
  if (layout.id === 'grid9') {
    ctx.fillStyle = '#fff6e8';
    ctx.fillRect(zone.x, zone.y, zone.w, zone.h);
    ctx.strokeStyle = '#14101f';
    ctx.lineWidth = Math.max(2, Math.round(W * 0.003));
    ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  }
  drawTitleBlock(ctx, zone, state, W, H);

  if (layout.id !== 'grid9') {
    drawPlaceRibbon(ctx, W, H, state.place, state);
  }

  drawGrainAndVignette(ctx, W, H);
  return canvas;
}
