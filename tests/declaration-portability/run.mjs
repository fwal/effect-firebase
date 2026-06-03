#!/usr/bin/env node
// Regression test for downstream TS2742 ("inferred type ... cannot be named
// without a reference to ... This is likely not portable.").
//
// effect-firebase's public API leaks types from three sources into the
// *inferred* types of consumer declarations:
//   - `Reference`           (effect-firebase internal schema class)
//   - `Timestamp`           (effect-firebase internal schema class)
//   - `VariantSchema.*`     (@effect/experimental)
//
// Under pnpm's DEFAULT (symlinked, non-hoisted) node_modules layout those
// symbols are only reachable through non-portable paths, so a downstream
// package that emits declaration files fails to build.
//
// This script reproduces the exact downstream condition end-to-end:
//   1. build effect-firebase
//   2. `pnpm pack` it to a tarball
//   3. install the tarball + `effect` into a throwaway consumer in a temp dir,
//      using pnpm's default layout (NOT `node-linker=hoisted`)
//   4. run `tsc --emitDeclarationOnly` and assert it exits 0 with no TS2742
//
// The consumer intentionally does NOT depend on `@effect/experimental`
// directly, matching the minimal realistic downstream that only declares
// `effect` and `effect-firebase`.

import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const pkgDir = join(repoRoot, 'packages', 'effect-firebase');
const fixtureDir = join(__dirname, 'fixture');

const log = (msg) => console.log(`\n[declaration-portability] ${msg}`);

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    ...opts,
  });

let workDir;
try {
  // 1. Build effect-firebase so we pack fresh declarations. We invoke `tsc`
  //    directly (the same build `nx build effect-firebase` runs) to keep this
  //    regression test independent of the Nx graph / sync gate.
  log('Building effect-firebase…');
  run('npx', ['tsc', '-b', 'packages/effect-firebase/tsconfig.lib.json', '--force'], {
    cwd: repoRoot,
    stdio: 'inherit',
  });

  // 2. Pack the built package into a tarball.
  workDir = mkdtempSync(join(tmpdir(), 'eff-fb-portability-'));
  log(`Packing effect-firebase into ${workDir}…`);
  const packOut = run('pnpm', ['pack', '--pack-destination', workDir], {
    cwd: pkgDir,
  });
  const tarball = packOut
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.endsWith('.tgz'))
    .pop();
  if (!tarball) {
    throw new Error(`Could not determine packed tarball from:\n${packOut}`);
  }
  const absTarball = tarball.startsWith('/') ? tarball : join(workDir, tarball);

  // 3. Materialize the consumer fixture in the temp dir and point its
  //    effect-firebase dependency at the packed tarball.
  const consumerDir = join(workDir, 'consumer');
  cpSync(fixtureDir, consumerDir, { recursive: true });

  const consumerPkgPath = join(consumerDir, 'package.json');
  const consumerPkg = readFileSync(consumerPkgPath, 'utf8').replace(
    'EFFECT_FIREBASE_TARBALL',
    `file:${absTarball}`
  );
  writeFileSync(consumerPkgPath, consumerPkg);

  // The tsconfig is written here rather than committed under `tests/` so that
  // Nx's `tests/*` TypeScript plugin does not pick the fixture up as a
  // workspace project (which would type-check it against effect-firebase's
  // *source* via the `@effect-firebase/source` condition and defeat the test).
  writeFileSync(
    join(consumerDir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          module: 'nodenext',
          moduleResolution: 'nodenext',
          target: 'es2022',
          lib: ['es2022'],
          strict: true,
          skipLibCheck: true,
          // The conditions that reproduce the failure: a downstream package
          // that emits its own declaration files.
          declaration: true,
          declarationMap: true,
          emitDeclarationOnly: true,
          composite: true,
          outDir: 'dist',
          noEmitOnError: true,
        },
        include: ['src'],
      },
      null,
      2
    )
  );

  log('Installing consumer with pnpm (default symlinked layout)…');
  run('pnpm', ['install', '--ignore-workspace', '--config.confirmModulesPurge=false'], {
    cwd: consumerDir,
    stdio: 'inherit',
  });

  // Guard: make sure we are actually testing the non-hoisted layout. If
  // @effect/experimental were hoisted to the consumer's root node_modules the
  // test would be too lenient and wouldn't catch the VariantSchema leak.
  let hoisted = false;
  try {
    run('node', ['-e', 'require("fs").accessSync("node_modules/@effect/experimental")'], {
      cwd: consumerDir,
    });
    hoisted = true;
  } catch {
    hoisted = false;
  }
  if (hoisted) {
    throw new Error(
      '@effect/experimental was hoisted to the consumer root — the fixture is ' +
        'not reproducing pnpm\'s default layout (check .npmrc).'
    );
  }
  log('Confirmed @effect/experimental is NOT hoisted (default pnpm layout).');

  // 4. Emit declarations and assert no TS2742.
  log('Running `tsc --emitDeclarationOnly`…');
  let tscOutput = '';
  let tscFailed = false;
  try {
    tscOutput = run('npx', ['tsc', '--emitDeclarationOnly'], { cwd: consumerDir });
  } catch (err) {
    tscFailed = true;
    tscOutput = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }

  if (tscOutput.trim()) {
    console.log(tscOutput);
  }

  if (tscOutput.includes('TS2742')) {
    throw new Error(
      'Declaration emit produced TS2742 — effect-firebase is leaking a ' +
        'non-portable inferred type into downstream declarations.'
    );
  }
  if (tscFailed) {
    throw new Error('`tsc --emitDeclarationOnly` failed (see output above).');
  }

  log('PASS: downstream declaration emit is clean (no TS2742).');
} finally {
  if (workDir) {
    rmSync(workDir, { recursive: true, force: true });
  }
}
