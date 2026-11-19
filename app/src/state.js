// App state: everything the cover is made of, plus undo/redo over the
// serialisable part of it. Photos live outside the snapshots — an image
// element cannot be cloned into JSON — so undo covers layout, grade,
// caption, size and every panel's crop.

import { layoutById } from './layouts.js';

export const EXPORT_SIZES = [
  { id: '1080x1080', name: 'Square', w: 1080, h: 1080, label: '1080 × 1080' },
  { id: '1080x1350', name: 'Portrait', w: 1080, h: 1350, label: '1080 × 1350' },
  { id: '1920x1080', name: 'Wide', w: 1920, h: 1080, label: '1920 × 1080' },
  { id: '1080x1920', name: 'Story', w: 1080, h: 1920, label: '1080 × 1920' },
];

export function sizeById(id) {
  return EXPORT_SIZES.find((s) => s.id === id) || EXPORT_SIZES[1];
}

export const LETTERING_STYLES = [
  { id: 'block', name: 'Block', hint: 'White, hard shadow' },
  { id: 'sunset', name: 'Sunset', hint: 'Pink-orange gradient fill' },
  { id: 'neon', name: 'Neon', hint: 'White core, pink glow' },
];

export function defaultPanel(photoId) {
  return { photo: photoId || null, zoom: 1, ox: 0, oy: 0 };
}

// When one photo fills several panels, stagger each panel's crop so the
// grid reads as different shots instead of one repeated tile.
export const SPREAD_CROPS = [
  { ox: 0, oy: -0.7, zoom: 1.25 },
  { ox: 0.7, oy: 0, zoom: 1.25 },
  { ox: -0.7, oy: 0.3, zoom: 1.3 },
  { ox: 0, oy: 0.7, zoom: 1.2 },
  { ox: -0.5, oy: -0.5, zoom: 1.35 },
  { ox: 0.5, oy: 0.6, zoom: 1.3 },
  { ox: 0, oy: 0, zoom: 1 },
  { ox: 0.6, oy: -0.6, zoom: 1.4 },
];

export function spreadCropFor(index) {
  return SPREAD_CROPS[index % SPREAD_CROPS.length];
}

// Give every panel holding `photoId` its staggered crop.
export function spreadPhotoCrops(panels, photoId) {
  let n = 0;
  panels.forEach((panel) => {
    if (panel.photo !== photoId) return;
    Object.assign(panel, spreadCropFor(n));
    n += 1;
  });
}

export function createState() {
  return {
    layout: 'grid9',
    grade: 'sunset',
    size: '1080x1350',
    title: 'SUNSET HEIST',
    subtitle: 'a neon coast story',
    place: 'NEON COAST',
    lettering: 'sunset',
    titleSize: 1,
    badge: true,
    stars: 5,
    panels: [],
    selected: 0,
    activePhoto: null,
  };
}

// Grow or shrink the panel list to the layout's slot count, keeping the
// crops the user already made and filling new slots with the active photo.
export function syncPanelsToLayout(state) {
  const count = layoutById(state.layout).slots;
  const panels = state.panels.slice(0, count);
  while (panels.length < count) {
    const panel = defaultPanel(state.activePhoto);
    if (state.activePhoto) Object.assign(panel, spreadCropFor(panels.length));
    panels.push(panel);
  }
  state.panels = panels;
  if (state.selected >= count) state.selected = 0;
}

function snapshotOf(state) {
  return JSON.stringify({
    layout: state.layout,
    grade: state.grade,
    size: state.size,
    title: state.title,
    subtitle: state.subtitle,
    place: state.place,
    lettering: state.lettering,
    titleSize: state.titleSize,
    badge: state.badge,
    stars: state.stars,
    panels: state.panels,
    selected: state.selected,
    activePhoto: state.activePhoto,
  });
}

function applySnapshot(state, json) {
  const snap = JSON.parse(json);
  Object.assign(state, snap);
}

export function createHistory(state) {
  const undoStack = [];
  const redoStack = [];
  let last = snapshotOf(state);
  return {
    // Record the state before a change; call before mutating.
    checkpoint() {
      const now = snapshotOf(state);
      if (now === last) return;
      undoStack.push(last);
      if (undoStack.length > 60) undoStack.shift();
      redoStack.length = 0;
      last = now;
    },
    undo() {
      if (!undoStack.length) return false;
      redoStack.push(snapshotOf(state));
      const prev = undoStack.pop();
      applySnapshot(state, prev);
      last = prev;
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(snapshotOf(state));
      const next = redoStack.pop();
      applySnapshot(state, next);
      last = next;
      return true;
    },
    canUndo() {
      return undoStack.length > 0;
    },
    canRedo() {
      return redoStack.length > 0;
    },
  };
}
