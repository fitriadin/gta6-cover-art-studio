// Colour grades for the cover engine. Each grade is a gradient map: the
// photo's luminance is remapped onto a sunset/neon ramp, then blended back
// with the original so faces and detail survive the treatment.

export const GRADES = [
  {
    id: 'sunset',
    name: 'Vice Sunset',
    hint: 'Pink dusk, orange heat',
    strength: 0.58,
    // shadow -> mid -> highlight
    stops: [
      [0.0, [16, 10, 54]],
      [0.28, [96, 28, 96]],
      [0.55, [255, 94, 60]],
      [0.8, [255, 178, 92]],
      [1.0, [255, 243, 214]],
    ],
    swatch: 'linear-gradient(90deg,#100a36,#601c60,#ff5e3c,#ffb25c,#fff3d6)',
  },
  {
    id: 'neon',
    name: 'Neon Night',
    hint: 'Hot pink and teal',
    strength: 0.62,
    stops: [
      [0.0, [6, 6, 40]],
      [0.3, [64, 10, 96]],
      [0.55, [255, 46, 136]],
      [0.78, [255, 120, 180]],
      [1.0, [190, 255, 250]],
    ],
    swatch: 'linear-gradient(90deg,#060628,#400a60,#ff2e88,#ff78b4,#befffa)',
  },
  {
    id: 'golden',
    name: 'Golden Hour',
    hint: 'Warm late light',
    strength: 0.5,
    stops: [
      [0.0, [30, 18, 8]],
      [0.3, [120, 66, 20]],
      [0.55, [232, 163, 61]],
      [0.8, [255, 214, 130]],
      [1.0, [255, 246, 216]],
    ],
    swatch: 'linear-gradient(90deg,#1e1208,#784214,#e8a33d,#ffd682,#fff6d8)',
  },
  {
    id: 'noir',
    name: 'Noir + Pink',
    hint: 'Black and white, pink highs',
    strength: 0.8,
    stops: [
      [0.0, [8, 8, 12]],
      [0.35, [74, 74, 84]],
      [0.65, [168, 168, 178]],
      [0.85, [255, 200, 220]],
      [1.0, [255, 236, 244]],
    ],
    swatch: 'linear-gradient(90deg,#08080c,#4a4a54,#a8a8b2,#ffc8dc,#ffecf4)',
  },
  {
    id: 'teal',
    name: 'Palm Teal',
    hint: 'Pool water, dusk sky',
    strength: 0.55,
    stops: [
      [0.0, [4, 32, 34]],
      [0.3, [10, 96, 102]],
      [0.55, [25, 194, 184]],
      [0.8, [150, 240, 224]],
      [1.0, [232, 255, 248]],
    ],
    swatch: 'linear-gradient(90deg,#042022,#0a6066,#19c2b8,#96f0e0,#e8fff8)',
  },
];

export function gradeById(id) {
  return GRADES.find((g) => g.id === id) || GRADES[0];
}

// Build a 256-entry lookup table: for each input luminance, the mapped RGB.
export function buildGradeLookup(grade) {
  const lut = new Uint8Array(256 * 3);
  const stops = grade.stops;
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let a = stops[0];
    let b = stops[stops.length - 1];
    for (let s = 0; s < stops.length - 1; s++) {
      if (t >= stops[s][0] && t <= stops[s + 1][0]) {
        a = stops[s];
        b = stops[s + 1];
        break;
      }
    }
    const span = b[0] - a[0] || 1;
    const f = Math.min(1, Math.max(0, (t - a[0]) / span));
    for (let c = 0; c < 3; c++) {
      lut[i * 3 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * f);
    }
  }
  return lut;
}

// Grade an ImageData buffer in place: mix the gradient-mapped luminance
// colour with the original pixel, then lift the contrast slightly.
export function applyGradeToPixels(data, lut, strength) {
  const mix = strength;
  const keep = 1 - strength;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const luma = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const k = luma * 3;
    let nr = r * keep + lut[k] * mix;
    let ng = g * keep + lut[k + 1] * mix;
    let nb = b * keep + lut[k + 2] * mix;
    // Gentle S-curve for punch: lift brights, deepen darks.
    nr = nr + (nr - 128) * 0.08;
    ng = ng + (ng - 128) * 0.08;
    nb = nb + (nb - 128) * 0.08;
    data[i] = Math.max(0, Math.min(255, nr));
    data[i + 1] = Math.max(0, Math.min(255, ng));
    data[i + 2] = Math.max(0, Math.min(255, nb));
  }
}
