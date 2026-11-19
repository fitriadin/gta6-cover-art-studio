// Cover layouts. Every layout describes its photo slots as fractions of the
// cover (x, y, w, h in 0..1), a title zone, and the backdrop it paints
// behind the panels. Geometry is aspect-agnostic: the same layout renders
// at 1080x1080, 1080x1350 and 1920x1080.

export const LAYOUTS = [
  {
    id: 'grid9',
    name: 'Cover Grid',
    hint: 'Nine panels, title in the middle',
    slots: 8,
    backdrop: 'paper',
    // 3x3 grid; the centre cell holds the title block instead of a photo.
    cells(W, H) {
      const gap = 0.012;
      const cw = (1 - gap * 4) / 3;
      const ch = (1 - gap * 4) / 3;
      const cells = [];
      for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 3; col++) {
          if (row === 1 && col === 1) continue;
          cells.push({
            x: gap + col * (cw + gap),
            y: gap + row * (ch + gap),
            w: cw,
            h: ch,
            rot: 0,
          });
        }
      }
      return cells;
    },
    titleZone() {
      const gap = 0.012;
      const cw = (1 - gap * 4) / 3;
      const ch = (1 - gap * 4) / 3;
      return { x: gap + cw + gap, y: gap + ch + gap, w: cw, h: ch, align: 'center' };
    },
  },
  {
    id: 'hero3',
    name: 'Hero + Trio',
    hint: 'One big moment, three below',
    slots: 4,
    backdrop: 'night',
    cells() {
      const gap = 0.012;
      const heroH = 0.6;
      const rowY = heroH + gap;
      const rowH = 1 - rowY - gap;
      const cw = (1 - gap * 4) / 3;
      const cells = [{ x: gap, y: gap, w: 1 - gap * 2, h: heroH - gap, rot: 0 }];
      for (let i = 0; i < 3; i++) {
        cells.push({ x: gap + i * (cw + gap), y: rowY, w: cw, h: rowH, rot: 0 });
      }
      return cells;
    },
    titleZone() {
      return { x: 0.045, y: 0.36, w: 0.91, h: 0.2, align: 'left', overPhoto: true };
    },
  },
  {
    id: 'quad',
    name: 'Four Corners',
    hint: 'Four equal panels, title band',
    slots: 4,
    backdrop: 'night',
    cells() {
      const gap = 0.012;
      const bandH = 0.16;
      const areaH = 1 - bandH;
      const cw = (1 - gap * 3) / 2;
      const ch = (areaH - gap * 3) / 2;
      const cells = [];
      for (let row = 0; row < 2; row++) {
        for (let col = 0; col < 2; col++) {
          cells.push({
            x: gap + col * (cw + gap),
            y: gap + row * (ch + gap),
            w: cw,
            h: ch,
            rot: 0,
          });
        }
      }
      return cells;
    },
    titleZone() {
      return { x: 0.04, y: 0.845, w: 0.92, h: 0.13, align: 'left', band: true };
    },
  },
  {
    id: 'bleed',
    name: 'Full Bleed',
    hint: 'One photo, edge to edge',
    slots: 1,
    backdrop: 'night',
    cells() {
      return [{ x: 0, y: 0, w: 1, h: 1, rot: 0 }];
    },
    titleZone() {
      return { x: 0.05, y: 0.72, w: 0.9, h: 0.22, align: 'left', overPhoto: true };
    },
  },
  {
    id: 'snaps',
    name: 'Tilted Snaps',
    hint: 'Snapshots pinned on a sunset',
    slots: 3,
    backdrop: 'sunset',
    cells(W, H) {
      const portrait = H > W;
      if (portrait) {
        return [
          { x: 0.08, y: 0.3, w: 0.52, h: 0.3, rot: -4 },
          { x: 0.42, y: 0.5, w: 0.52, h: 0.3, rot: 3.5 },
          { x: 0.1, y: 0.68, w: 0.5, h: 0.26, rot: -2.5 },
        ];
      }
      return [
        { x: 0.06, y: 0.3, w: 0.3, h: 0.56, rot: -4 },
        { x: 0.36, y: 0.24, w: 0.3, h: 0.62, rot: 2.5 },
        { x: 0.66, y: 0.3, w: 0.3, h: 0.56, rot: 4 },
      ];
    },
    titleZone() {
      return { x: 0.06, y: 0.05, w: 0.88, h: 0.18, align: 'center', overPhoto: false };
    },
  },
];

export function layoutById(id) {
  return LAYOUTS.find((l) => l.id === id) || LAYOUTS[0];
}

// Panel rectangles in pixels for a cover of W x H.
export function layoutCells(layout, W, H) {
  return layout.cells(W, H).map((c) => ({
    x: c.x * W,
    y: c.y * H,
    w: c.w * W,
    h: c.h * H,
    rot: c.rot || 0,
  }));
}

export function layoutTitleZone(layout, W, H) {
  const z = layout.titleZone(W, H);
  return {
    x: z.x * W,
    y: z.y * H,
    w: z.w * W,
    h: z.h * H,
    align: z.align,
    overPhoto: !!z.overPhoto,
    band: !!z.band,
  };
}
