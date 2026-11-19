// The editor: every control on the page, the photo tray, the panel strip,
// canvas drag-to-pan and wheel-to-zoom, undo/redo and the one-click PNG
// export. It owns the photos (loaded images) and drives renderCover.

import { GRADES, gradeById } from './grades.js';
import { LAYOUTS, layoutById, layoutCells } from './layouts.js';
import { EXPORT_SIZES, LETTERING_STYLES, sizeById, syncPanelsToLayout, defaultPanel, spreadPhotoCrops } from './state.js';
import { renderCover } from './render.js';

const SAMPLES = {
  boulevard: { name: 'Boulevard', src: 'samples/boulevard.jpg' },
  pier: { name: 'Pier', src: 'samples/pier.jpg' },
};

const PREVIEW_LONG_SIDE = 720;

let photoSeq = 0;

export function createEditor(root, state, history) {
  const $ = (id) => root.getElementById(id);
  const canvas = $('previewCanvas');
  const ctx = canvas.getContext('2d');
  const photos = [];
  let renderQueued = false;
  let drag = null;

  // ---------- rendering ----------

  function previewSize() {
    const size = sizeById(state.size);
    const scale = Math.min(1, PREVIEW_LONG_SIDE / Math.max(size.w, size.h));
    return { w: Math.round(size.w * scale), h: Math.round(size.h * scale) };
  }

  function renderNow() {
    const { w, h } = previewSize();
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    renderCover(canvas, state, photos);
    $('emptyState').hidden = photos.length > 0;
    updatePanelControls();
  }

  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderNow();
    });
  }

  function showToast(message) {
    const toast = $('toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  // ---------- photos ----------

  function loadImage(src, name) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load ${name}`));
      img.src = src;
    });
  }

  async function addPhoto(src, name) {
    try {
      const img = await loadImage(src, name);
      const photo = { id: `photo-${++photoSeq}`, name, src, img };
      photos.push(photo);
      history.checkpoint();
      state.activePhoto = photo.id;
      // First photo fills every empty panel; later ones fill the selection.
      syncPanelsToLayout(state);
      if (photos.length === 1) {
        state.panels.forEach((p) => {
          if (!p.photo) p.photo = photo.id;
        });
        spreadPhotoCrops(state.panels, photo.id);
      } else {
        const selected = state.panels[state.selected];
        if (selected && !selected.photo) selected.photo = photo.id;
      }
      renderTray();
      renderPanelStrip();
      scheduleRender();
      return photo;
    } catch (err) {
      showToast(`${name} could not be read — try a JPG or PNG.`);
      return null;
    }
  }

  async function loadSample(key) {
    const sample = SAMPLES[key];
    if (!sample) return null;
    const existing = photos.find((p) => p.src === sample.src);
    if (existing) {
      state.activePhoto = existing.id;
      renderTray();
      return existing;
    }
    return addPhoto(sample.src, sample.name);
  }

  function removePhoto(id) {
    const index = photos.findIndex((p) => p.id === id);
    if (index === -1) return;
    history.checkpoint();
    const [removed] = photos.splice(index, 1);
    if (removed.src.startsWith('blob:')) URL.revokeObjectURL(removed.src);
    state.panels.forEach((p) => {
      if (p.photo === id) p.photo = null;
    });
    if (state.activePhoto === id) {
      state.activePhoto = photos.length ? photos[photos.length - 1].id : null;
    }
    renderTray();
    renderPanelStrip();
    scheduleRender();
  }

  function renderTray() {
    const tray = $('photoTray');
    tray.innerHTML = '';
    photos.forEach((photo) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'photo-thumb';
      button.setAttribute('role', 'listitem');
      button.setAttribute('aria-pressed', String(state.activePhoto === photo.id));
      button.title = `${photo.name} — click to use in the selected panel`;
      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.name;
      button.appendChild(img);
      const remove = document.createElement('span');
      remove.className = 'remove';
      remove.textContent = '×';
      remove.title = `Remove ${photo.name}`;
      remove.addEventListener('click', (event) => {
        event.stopPropagation();
        removePhoto(photo.id);
      });
      button.appendChild(remove);
      button.addEventListener('click', () => {
        history.checkpoint();
        state.activePhoto = photo.id;
        const selected = state.panels[state.selected];
        if (selected) {
          selected.photo = photo.id;
          selected.zoom = 1;
          selected.ox = 0;
          selected.oy = 0;
        }
        renderTray();
        renderPanelStrip();
        scheduleRender();
      });
      tray.appendChild(button);
    });
  }

  // ---------- panel strip + panel controls ----------

  function renderPanelStrip() {
    const strip = $('panelStrip');
    strip.innerHTML = '';
    const layout = layoutById(state.layout);
    state.panels.forEach((panel, i) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'panel-chip';
      chip.setAttribute('aria-pressed', String(state.selected === i));
      chip.title = `Select panel ${i + 1}`;
      const thumb = document.createElement('span');
      thumb.className = 'chip-thumb';
      const photo = photos.find((p) => p.id === panel.photo);
      if (photo) {
        const img = document.createElement('img');
        img.src = photo.src;
        img.alt = '';
        thumb.appendChild(img);
      } else {
        const empty = document.createElement('span');
        empty.className = 'chip-empty';
        empty.textContent = '+';
        thumb.appendChild(empty);
      }
      chip.appendChild(thumb);
      const label = document.createElement('span');
      label.textContent = layout.id === 'bleed' ? 'Cover photo' : `Panel ${i + 1}`;
      chip.appendChild(label);
      chip.addEventListener('click', () => {
        state.selected = i;
        renderPanelStrip();
        updatePanelControls();
      });
      strip.appendChild(chip);
    });
  }

  function updatePanelControls() {
    const panel = state.panels[state.selected];
    const photo = panel ? photos.find((p) => p.id === panel.photo) : null;
    const info = $('panelInfo');
    if (!panel) {
      info.textContent = 'No panel selected yet.';
      return;
    }
    info.textContent = photo
      ? `Panel ${state.selected + 1} · ${photo.name} · drag the photo on the canvas to reposition it.`
      : `Panel ${state.selected + 1} is empty — click a photo above to fill it.`;
    $('zoomInput').value = Math.round((panel.zoom || 1) * 100);
    $('zoomValue').textContent = `${Math.round((panel.zoom || 1) * 100)}%`;
    $('undoBtn').disabled = !history.canUndo();
    $('redoBtn').disabled = !history.canRedo();
  }

  // ---------- pickers ----------

  function buildOptionGrid(containerId, items, currentId, onPick, renderFace) {
    const container = $(containerId);
    container.innerHTML = '';
    items.forEach((item) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-btn';
      button.setAttribute('role', 'radio');
      button.setAttribute('aria-checked', String(item.id === currentId));
      button.title = item.hint || item.name;
      const face = renderFace(item);
      if (face) button.appendChild(face);
      const label = document.createElement('span');
      label.textContent = item.name;
      button.appendChild(label);
      button.addEventListener('click', () => {
        history.checkpoint();
        onPick(item.id);
        container.querySelectorAll('[role="radio"]').forEach((el) => {
          el.setAttribute('aria-checked', String(el === button));
        });
        scheduleRender();
      });
      container.appendChild(button);
    });
  }

  function layoutMini(layout) {
    const mini = document.createElement('span');
    mini.className = 'mini';
    mini.setAttribute('aria-hidden', 'true');
    const rects = {
      grid9: [
        [0, 0, 30, 30], [35, 0, 30, 30], [70, 0, 30, 30],
        [0, 35, 30, 30], [35, 35, 30, 30, true], [70, 35, 30, 30],
        [0, 70, 30, 30], [35, 70, 30, 30], [70, 70, 30, 30],
      ],
      hero3: [[0, 0, 100, 55], [0, 62, 30, 38], [35, 62, 30, 38], [70, 62, 30, 38]],
      quad: [[0, 0, 47, 38], [53, 0, 47, 38], [0, 44, 47, 38], [53, 44, 47, 38]],
      bleed: [[0, 0, 100, 100]],
      snaps: [[4, 8, 30, 84], [35, 2, 30, 92], [66, 8, 30, 84]],
    }[layout.id] || [];
    rects.forEach(([x, y, w, h, accent]) => {
      const cell = document.createElement('span');
      cell.className = `cell${accent ? ' cell-title' : ''}`;
      cell.style.left = `${x}%`;
      cell.style.top = `${y}%`;
      cell.style.width = `${w}%`;
      cell.style.height = `${h}%`;
      mini.appendChild(cell);
    });
    return mini;
  }

  function gradeSwatch(grade) {
    const swatch = document.createElement('span');
    swatch.className = 'mini-swatch';
    swatch.style.background = grade.swatch;
    swatch.setAttribute('aria-hidden', 'true');
    return swatch;
  }

  function sizeFace(size) {
    const face = document.createElement('span');
    face.className = 'mini';
    face.setAttribute('aria-hidden', 'true');
    const box = document.createElement('span');
    box.className = 'cell';
    const ratio = size.w / size.h;
    let w = 44;
    let h = 32;
    if (ratio > 1) {
      h = Math.round(44 / ratio);
    } else {
      w = Math.round(32 * ratio);
    }
    box.style.width = `${w}px`;
    box.style.height = `${h}px`;
    box.style.left = `${(44 - w) / 2}px`;
    box.style.top = `${(32 - h) / 2}px`;
    face.appendChild(box);
    return face;
  }

  function buildPickers() {
    buildOptionGrid('layoutPicker', LAYOUTS, state.layout, (id) => {
      state.layout = id;
      syncPanelsToLayout(state);
      renderPanelStrip();
    }, layoutMini);
    buildOptionGrid('gradePicker', GRADES, state.grade, (id) => {
      state.grade = id;
    }, gradeSwatch);
    buildOptionGrid('sizePicker', EXPORT_SIZES, state.size, (id) => {
      state.size = id;
    }, sizeFace);

    const lettering = $('letteringPicker');
    lettering.innerHTML = '';
    LETTERING_STYLES.forEach((style) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'option-chip';
      chip.setAttribute('role', 'radio');
      chip.setAttribute('aria-checked', String(style.id === state.lettering));
      chip.title = style.hint;
      chip.textContent = style.name;
      chip.addEventListener('click', () => {
        history.checkpoint();
        state.lettering = style.id;
        lettering.querySelectorAll('[role="radio"]').forEach((el) => {
          el.setAttribute('aria-checked', String(el === chip));
        });
        scheduleRender();
      });
      lettering.appendChild(chip);
    });
  }

  // ---------- canvas interaction ----------

  function canvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * (canvas.width / rect.width),
      y: (event.clientY - rect.top) * (canvas.height / rect.height),
    };
  }

  function panelAt(point) {
    const cells = layoutCells(layoutById(state.layout), canvas.width, canvas.height);
    for (let i = cells.length - 1; i >= 0; i--) {
      const c = cells[i];
      if (point.x >= c.x && point.x <= c.x + c.w && point.y >= c.y && point.y <= c.y + c.h) {
        return i;
      }
    }
    return -1;
  }

  function panOverflow(cell, panel) {
    const photo = photos.find((p) => p.id === panel.photo);
    if (!photo) return { x: 0, y: 0 };
    const iw = photo.img.naturalWidth;
    const ih = photo.img.naturalHeight;
    const base = Math.max(cell.w / iw, cell.h / ih);
    const scale = base * (panel.zoom || 1);
    return {
      x: Math.max(0, iw * scale - cell.w),
      y: Math.max(0, ih * scale - cell.h),
    };
  }

  canvas.addEventListener('pointerdown', (event) => {
    const point = canvasPoint(event);
    const index = panelAt(point);
    if (index === -1) return;
    history.checkpoint();
    state.selected = index;
    renderPanelStrip();
    updatePanelControls();
    const panel = state.panels[index];
    if (!panel || !panel.photo) return;
    canvas.setPointerCapture(event.pointerId);
    drag = { panel, index, lastX: point.x, lastY: point.y };
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const point = canvasPoint(event);
    const cells = layoutCells(layoutById(state.layout), canvas.width, canvas.height);
    const over = panOverflow(cells[drag.index], drag.panel);
    if (over.x > 0) {
      drag.panel.ox = Math.max(-1, Math.min(1, drag.panel.ox + ((point.x - drag.lastX) / over.x) * 2));
    }
    if (over.y > 0) {
      drag.panel.oy = Math.max(-1, Math.min(1, drag.panel.oy + ((point.y - drag.lastY) / over.y) * 2));
    }
    drag.lastX = point.x;
    drag.lastY = point.y;
    scheduleRender();
  });

  function endDrag() {
    drag = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    const panel = state.panels[state.selected];
    if (!panel || !panel.photo) return;
    history.checkpoint();
    const factor = Math.exp(-event.deltaY * 0.0012);
    panel.zoom = Math.max(1, Math.min(3, (panel.zoom || 1) * factor));
    updatePanelControls();
    scheduleRender();
  }, { passive: false });

  // ---------- controls ----------

  function refreshAll() {
    buildPickers();
    renderTray();
    renderPanelStrip();
    $('titleInput').value = state.title;
    $('subtitleInput').value = state.subtitle;
    $('placeInput').value = state.place;
    $('titleSizeInput').value = Math.round(state.titleSize * 100);
    $('titleSizeValue').textContent = `${Math.round(state.titleSize * 100)}%`;
    $('badgeToggle').checked = state.badge;
    $('starsInput').value = String(state.stars);
    // Update the undo/redo buttons synchronously: they must reflect the
    // new history state at once, not on the next animation frame.
    updatePanelControls();
    scheduleRender();
  }

  function bindTextInput(id, key) {
    const input = $(id);
    input.addEventListener('input', () => {
      state[key] = input.value;
      scheduleRender();
    });
    input.addEventListener('change', () => history.checkpoint());
  }

  bindTextInput('titleInput', 'title');
  bindTextInput('subtitleInput', 'subtitle');
  bindTextInput('placeInput', 'place');

  $('titleSizeInput').addEventListener('input', (event) => {
    state.titleSize = Number(event.target.value) / 100;
    $('titleSizeValue').textContent = `${event.target.value}%`;
    scheduleRender();
  });
  $('titleSizeInput').addEventListener('change', () => history.checkpoint());

  $('badgeToggle').addEventListener('change', (event) => {
    history.checkpoint();
    state.badge = event.target.checked;
    scheduleRender();
  });

  $('starsInput').addEventListener('change', (event) => {
    history.checkpoint();
    state.stars = Number(event.target.value);
    scheduleRender();
  });

  $('zoomInput').addEventListener('input', (event) => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    panel.zoom = Number(event.target.value) / 100;
    $('zoomValue').textContent = `${event.target.value}%`;
    scheduleRender();
  });
  $('zoomInput').addEventListener('change', () => history.checkpoint());

  $('resetCropBtn').addEventListener('click', () => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    history.checkpoint();
    panel.zoom = 1;
    panel.ox = 0;
    panel.oy = 0;
    scheduleRender();
  });

  $('clearPanelBtn').addEventListener('click', () => {
    const panel = state.panels[state.selected];
    if (!panel) return;
    history.checkpoint();
    Object.assign(panel, defaultPanel(null));
    renderPanelStrip();
    scheduleRender();
  });

  $('fillAllBtn').addEventListener('click', () => {
    if (!state.activePhoto) {
      showToast('Add a photo first, then fill every panel with it.');
      return;
    }
    history.checkpoint();
    state.panels.forEach((p) => {
      p.photo = state.activePhoto;
    });
    spreadPhotoCrops(state.panels, state.activePhoto);
    renderPanelStrip();
    scheduleRender();
    showToast('Every panel now uses the selected photo.');
  });

  // ---------- upload: button + drag and drop ----------

  const fileInput = $('fileInput');
  $('addPhotosBtn').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    for (const file of fileInput.files) {
      await addPhoto(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''));
    }
    fileInput.value = '';
  });

  const dropZone = $('dropZone');
  ['dragenter', 'dragover'].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.add('drag-over');
    });
  });
  ['dragleave', 'drop'].forEach((name) => {
    dropZone.addEventListener(name, (event) => {
      event.preventDefault();
      dropZone.classList.remove('drag-over');
    });
  });
  dropZone.addEventListener('drop', async (event) => {
    const files = [...event.dataTransfer.files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) {
      showToast('Drop an image file to add it as a photo.');
      return;
    }
    for (const file of files) {
      await addPhoto(URL.createObjectURL(file), file.name.replace(/\.[^.]+$/, ''));
    }
  });

  $('sampleBoulevardBtn').addEventListener('click', () => loadSample('boulevard'));
  $('samplePierBtn').addEventListener('click', () => loadSample('pier'));
  $('emptySampleBtn').addEventListener('click', () => loadSample('pier'));

  // ---------- undo / redo ----------

  function doUndo() {
    if (history.undo()) refreshAll();
  }
  function doRedo() {
    if (history.redo()) refreshAll();
  }
  $('undoBtn').addEventListener('click', doUndo);
  $('redoBtn').addEventListener('click', doRedo);
  document.addEventListener('keydown', (event) => {
    const mod = event.ctrlKey || event.metaKey;
    if (!mod || event.key.toLowerCase() !== 'z') return;
    if (event.target.matches('input, textarea, select')) return;
    event.preventDefault();
    if (event.shiftKey) doRedo();
    else doUndo();
  });

  // ---------- export ----------

  async function exportPng() {
    if (!photos.length) {
      showToast('Add a photo first — the cover needs at least one.');
      return;
    }
    const button = $('exportBtn');
    button.disabled = true;
    button.textContent = 'Exporting…';
    try {
      await document.fonts.ready;
      const size = sizeById(state.size);
      const offscreen = document.createElement('canvas');
      offscreen.width = size.w;
      offscreen.height = size.h;
      renderCover(offscreen, state, photos);
      const blob = await new Promise((resolve) => offscreen.toBlob(resolve, 'image/png'));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `neon-coast-cover-${size.w}x${size.h}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      showToast(`Exported ${size.w} × ${size.h} PNG — check your downloads.`);
    } finally {
      button.disabled = false;
      button.textContent = 'Export PNG';
    }
  }
  $('exportBtn').addEventListener('click', exportPng);

  // ---------- boot ----------

  syncPanelsToLayout(state);
  buildPickers();
  renderTray();
  renderPanelStrip();
  updatePanelControls();

  return {
    state,
    photos,
    renderNow,
    scheduleRender,
    loadSample,
    exportPng,
    refreshAll,
    setTitle(title) {
      state.title = title;
      $('titleInput').value = title;
    },
    setSubtitle(subtitle) {
      state.subtitle = subtitle;
      $('subtitleInput').value = subtitle;
    },
  };
}
