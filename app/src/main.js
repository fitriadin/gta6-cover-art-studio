// Bootstrap: build the state, the history and the editor, wait for the
// display fonts (canvas lettering needs them loaded, not just declared),
// paint the first frame, then hand over to the screenshot scenes.

import { createState, createHistory } from './state.js';
import { createEditor } from './editor.js';
import { applyShotParams } from './shots.js';

async function loadDisplayFonts() {
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load('40px Anton'),
        document.fonts.load('40px Pacifico'),
        document.fonts.ready,
      ]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  } catch {
    // A font that fails to load falls back to the canvas sans stack;
    // the app still works.
  }
}

async function boot() {
  const state = createState();
  const history = createHistory(state);
  const editor = createEditor(document, state, history);
  window.__coverStudio = editor;

  await loadDisplayFonts();
  const shotHandled = await applyShotParams(editor);
  if (!shotHandled) {
    editor.renderNow();
    window.__shotReady = true;
  }
}

boot();
