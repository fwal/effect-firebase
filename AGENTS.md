# AGENTS.md — effect-firebase monorepo

Guidance for agents working **on this repository**. If you are working in a
project that _uses_ effect-firebase, read
[`packages/effect-firebase/AGENTS.md`](./packages/effect-firebase/AGENTS.md)
instead — that file ships inside the npm package together with
[`packages/effect-firebase/MIGRATION.md`](./packages/effect-firebase/MIGRATION.md).

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

## Layout

| Path                       | What                                                                                                                                               |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/effect-firebase` | Core: `Firestore` field helpers + sentinels, `makeRepository`, `Query`, `FirestoreService`, `FirestoreSchema`. Ships `AGENTS.md` + `MIGRATION.md`. |
| `packages/admin`           | Admin SDK `FirestoreService` layer, Cloud Functions wrappers (`on*Effect`), Cloud Logging logger.                                                  |
| `packages/client`          | Client SDK `FirestoreService` layer.                                                                                                               |
| `packages/mock`            | In-memory reactive backend, fixtures, `MockController`.                                                                                            |
| `packages/devtools`        | TanStack Devtools plugin / React panel for the mock.                                                                                               |
| `example/shared`           | Reference models + repositories (`PostModel`, `AuthorModel`) used by app and backend.                                                              |
| `example/backend`          | Cloud Functions example (emulator).                                                                                                                |
| `example/app`              | React + `@effect/atom-react` reference app; has its own `AGENTS.md` for UI conventions.                                                            |
| `.agents/skills`           | `create-firebase-function` skill (symlinked from `.claude/skills`); only points at the packaged `AGENTS.md`/`MIGRATION.md`.                        |

Published packages: `effect-firebase`, `@effect-firebase/{admin,client,mock,devtools}`.
They are versioned together by `nx release` (conventional commits) and
published from CI on `v*` tags; prerelease tags map to the npm dist-tag
(`v1.0.0-beta.5` → `beta`).

## Commands

```bash
pnpm install
pnpm nx run-many -t build          # tsc per package, dist/ next to each package
pnpm nx run-many -t test           # vitest (@effect/vitest)
pnpm nx run-many -t lint
pnpm nx affected -t lint test build
pnpm format                        # prettier (singleQuote), also formats markdown
pnpm example:emulator              # Firebase emulator + backend
pnpm example:hosting               # example app against the emulator
pnpm example:mock                  # example app against the in-memory mock + devtools
```

Inside `packages/effect-firebase`, `npm pack --dry-run` shows exactly what
gets published (`dist/`, `README.md`, `AGENTS.md`, `MIGRATION.md`).

## Conventions

- **Effect v4 only.** Peer dependency range lives in `pnpm-workspace.yaml`
  (`catalog:`). `@effect/atom-react` must be bumped in lockstep with `effect`.
- **Model helpers split:** generic helpers (`Model.Class`, `GeneratedByDb`,
  `Field`, `fieldEvolve`) come from `effect/unstable/schema`; anything
  Firestore-specific lives under the `Firestore` namespace in
  `packages/effect-firebase/src/lib/firestore/firestore.ts`. Do not
  re-export `Model` from `effect-firebase`.
- **Variant names** are Effect's: `select` / `insert` / `update` / `json` /
  `jsonCreate` / `jsonUpdate`.
- **Sentinels** (`Delete`, `ArrayUnion`, `ArrayRemove`, `Increment`,
  `ServerTimestamp`) are plain classes in core; each SDK package converts them
  in its own `firestore-service.ts` converter, and the mock materialises them.
  Adding a sentinel means touching core, admin, client and mock.
- **`FirestoreService` is the only seam.** New capabilities go on
  `FirestoreServiceShape` and must be implemented in admin, client, mock,
  `noopLayer` and `MockFirestoreService`.
- **Cloud Functions wrappers** follow one pattern (`run.ts`): options extend the
  native firebase-functions options with `runtime`, handlers are wrapped in
  `Effect.withSpan`, defects are logged via `firebase-functions/logger`.
- **Code style:** explicit lambdas, no tacit `Effect.map(fn)` or `flow`.
  Prettier with single quotes. Conventional commit messages (`feat(scope):`,
  `fix(scope):`, `feat!:` for breaking) because they drive the release notes.
- **Tests** live next to sources as `*.test.ts` / `*.spec.ts` and use
  `@effect/vitest`. The admin/client converters have roundtrip tests; the mock
  has query-filter and state tests. Prefer exercising behaviour through the
  public typings (see `repository.test.ts`).

## Docs to update when the public API changes

| Change                            | Update                                                                                                          |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Any breaking change               | `packages/effect-firebase/MIGRATION.md` (new numbered step or table row)                                        |
| New/renamed export in any package | `packages/effect-firebase/AGENTS.md` (import map, tables, gotchas) and that package's `README.md`               |
| New Cloud Functions wrapper       | `packages/admin/README.md`, root `README.md` list, and the wrapper list in `packages/effect-firebase/AGENTS.md` |
| React-facing behaviour            | `REACT.md` and `example/app`                                                                                    |
| Mock semantics                    | `packages/mock/README.md` (and devtools README if the panel is affected)                                        |

Root `MIGRATION.md` is only a pointer to the packaged file; keep it that way.

## Effect documentation

Overview: https://effect.website/llms.txt — full docs: https://effect.website/llms-full.txt

### Avoid tacit usage

Avoid point-free calls such as `Effect.map(fn)` or `flow` from
`effect/Function`. Write `Effect.map((x) => fn(x))` instead — it keeps type
inference and stack traces predictable.
