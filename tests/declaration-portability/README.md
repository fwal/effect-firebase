# Declaration portability regression test

Guards against **TS2742** in downstream packages that emit declaration files on
top of `effect-firebase`.

## What it checks

A downstream package such as:

```ts
export const JobRef = Model.Reference(JobId, 'jobs');
export class Job extends Model.Class<Job>('Job')({ /* ... */ }) {}
```

infers public types that reference `effect-firebase`'s schema classes
(`Reference`, `Timestamp`) and `@effect/experimental`'s `VariantSchema` types.
Under pnpm's **default** (symlinked, non-hoisted) `node_modules` layout those
symbols must be nameable through the bare `effect-firebase` specifier — never
through `effect-firebase/dist/lib/...` internals or a deep
`@effect/experimental` virtual-store path. If they aren't,
`tsc --emitDeclarationOnly` fails with:

> TS2742: The inferred type of 'X' cannot be named without a reference to
> '…'. This is likely not portable. A type annotation is necessary.

## How it works

`run.mjs`:

1. builds `effect-firebase`,
2. `pnpm pack`s it into a tarball,
3. installs the tarball + `effect` into a throwaway consumer (`fixture/`) in a
   temp dir using pnpm's **default** layout (it asserts `@effect/experimental`
   is *not* hoisted, i.e. no `node-linker=hoisted` / `shamefully-hoist`),
4. runs `tsc --emitDeclarationOnly` and fails if the output contains `TS2742`.

The consumer `tsconfig.json` is written by `run.mjs` into the temp copy rather
than committed under `tests/`, so that Nx's `tests/*` TypeScript plugin does not
pick the fixture up as a workspace project (which would type-check it against
effect-firebase's *source* and defeat the test).

The consumer deliberately depends only on `effect` and `effect-firebase` (not
`@effect/experimental`), matching the minimal realistic downstream package.

## Running

```sh
pnpm test:portability
# or
node tests/declaration-portability/run.mjs
```

Requires network access (the temp consumer install fetches `effect` and the
`@effect/experimental` peer from the registry; pnpm reuses its global store).
