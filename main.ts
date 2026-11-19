// Neon Coast Cover Studio — the program that hands this entry in.
//
// It runs on Node 22 with only the standard library, twice, in a fresh
// container with no network: /bot holds this repository read-only and
// /output is the writable hand-in directory. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
//
// The hand-in is three things: a copy of app/ (the static cover maker),
// a copy of screenshots/ (the cover and the editor, as the judge sees
// them), and dossier.json, written by the vendored make.fun library so
// the gate's own rebuild matches it byte for byte.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

// The gate's caps for this bounty (reference/gate.json): the dossier text
// is capped at 160 KiB; the rest refuse an entry the scorer would refuse.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 50331648,
  app_path_max_bytes: 1000,
};

function repoRoot(): string {
  return dirname(fileURLToPath(import.meta.url));
}

function outputDir(): string {
  return process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
}

function handIn(): void {
  const root = repoRoot();
  const out = outputDir();

  // Start from a clean directory so a second run writes the same bytes
  // as the first, even when an earlier run left files behind. Remove
  // the directory's contents, not the directory itself: the grader
  // mounts /output as a volume, and a mount point cannot be removed.
  mkdirSync(out, { recursive: true });
  for (const entry of readdirSync(out)) {
    rmSync(join(out, entry), { recursive: true, force: true });
  }

  cpSync(join(root, 'app'), join(out, 'app'), { recursive: true });

  const shots = join(root, 'screenshots');
  mkdirSync(join(out, 'screenshots'), { recursive: true });
  if (existsSync(shots)) {
    cpSync(shots, join(out, 'screenshots'), { recursive: true });
  }

  const dossier = buildDossier(out, DOSSIER_CAPS);
  writeFileSync(join(out, 'dossier.json'), dossier);
}

handIn();
