// Screenshot scenes (?shot=...): deterministic setups for the entry's
// screenshots. ?shot=editor shows the full editor with a sample photo
// loaded; ?shot=cover shows the cover alone, full bleed. Both honour
// ?photo= (boulevard|pier), ?caption=, ?subtitle=, ?layout=, ?grade=,
// ?size= and ?place=. When the scene is painted, window.__shotReady is
// set so a screenshot driver knows the frame is final.

import { renderCover } from './render.js';
import { layoutById } from './layouts.js';
import { gradeById } from './grades.js';
import { sizeById } from './state.js';

function readParams() {
  const q = new URLSearchParams(window.location.search);
  return {
    shot: q.get('shot') || '',
    photo: q.get('photo') || 'pier',
    caption: q.get('caption') || '',
    subtitle: q.get('subtitle') || '',
    layout: q.get('layout') || '',
    grade: q.get('grade') || '',
    size: q.get('size') || '',
    place: q.get('place') || '',
  };
}

export async function applyShotParams(editor) {
  const params = readParams();
  if (!params.shot) return false;
  const { state } = editor;

  if (params.layout) state.layout = layoutById(params.layout).id;
  if (params.grade) state.grade = gradeById(params.grade).id;
  if (params.size) state.size = sizeById(params.size).id;
  if (params.caption) editor.setTitle(params.caption);
  if (params.subtitle) editor.setSubtitle(params.subtitle);
  if (params.place) {
    state.place = params.place;
    const input = document.getElementById('placeInput');
    if (input) input.value = params.place;
  }

  await editor.loadSample(params.photo);
  editor.refreshAll();

  if (params.shot === 'cover') {
    document.body.classList.add('shot-cover');
    // Paint the cover at the viewport's own size: the screenshot driver
    // opens a viewport whose aspect matches the chosen export size.
    const canvas = document.getElementById('previewCanvas');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    await document.fonts.ready;
    renderCover(canvas, state, editor.photos);
  } else {
    await document.fonts.ready;
    editor.renderNow();
  }

  window.__shotReady = true;
  return true;
}
