---
name: effect-firebase-function
description: |
  Work with the effect-firebase library: define models and repositories, write Firestore queries,
  create Firebase Cloud Functions (onCallEffect, onRequestEffect, Firestore triggers,
  onMessagePublishedEffect, onTaskDispatchedEffect, onScheduleEffect), set up the functions runtime,
  test with the mock backend, or migrate a project from effect-firebase v0.x / Effect v3.
---

# effect-firebase

The authoritative, version-matched reference ships inside the installed package.
Do not rely on memorised API shapes — read these files first:

1. **Usage guide (always):** `node_modules/effect-firebase/AGENTS.md`
   Import map, models, repositories, queries, sentinels, transactions, layers
   (`Admin`/`Client`/mock), every Cloud Functions wrapper, testing, gotchas.
2. **Migration guide (only when upgrading):** `node_modules/effect-firebase/MIGRATION.md`
   Read it when the project is on `effect-firebase` `0.x`, `effect` `3.x`,
   `@effect/experimental`, or imports `Model` from `'effect-firebase'`.
3. Package READMEs for depth: `node_modules/@effect-firebase/admin/README.md`
   (trigger wrappers), `node_modules/@effect-firebase/mock/README.md` (fixtures,
   simulated states), `node_modules/effect-firebase/README.md`.

If the files are missing, install/upgrade first:
`npm install effect-firebase@beta @effect-firebase/admin@beta` (add
`@effect-firebase/client@beta`, `--save-dev @effect-firebase/mock@beta` as needed).

## Procedure

1. Check `package.json` for `effect-firebase` / `effect` versions. If a
   migration is needed, follow `MIGRATION.md` step by step before adding code.
2. Read `AGENTS.md`; follow its import map and gotchas checklist.
3. Implement, keeping one shared `FunctionsRuntime` per functions process,
   schemas on callable/HTTP inputs and outputs, and explicit lambdas (no
   point-free `Effect.map(fn)`).
4. Test against `@effect-firebase/mock` where possible.
