# @effect-firebase/devtools

Devtools for developing Effect Firebase apps against the [`@effect-firebase/mock`](../mock) backend: a panel that lets you toggle every collection between **data / empty / loading / error**, pick the simulated error code, dial in latency, and reset to your fixtures — live, while your app is running.

Ships as a [TanStack Devtools](https://tanstack.com/devtools/latest) plugin and as a standalone React component.

## Installation

```bash
npm install --save-dev @effect-firebase/devtools @effect-firebase/mock
```

## Usage with TanStack Devtools

Create the mock backend with `make()` (instead of `layer()`) so you get a handle both your app runtime and the devtools panel can share:

```tsx
import { TanStackDevtools } from '@tanstack/react-devtools';
import { make, fixture } from '@effect-firebase/mock';
import { firestoreMockPlugin } from '@effect-firebase/devtools';

// Fixtures built with fixture()/rawFixture() from @effect-firebase/mock —
// see that package's README.
const posts = fixture(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  docs: [new PostModel({/* ... */})],
});

const mock = make({
  fixtures: [posts],
});

// Provide mock.layer wherever your app builds its Effect runtime.
// With effect-atom, for example:
//   const runtime = Atom.runtime(mock.layer);

export function App() {
  return (
    <>
      {/* ... */}
      <TanStackDevtools plugins={[firestoreMockPlugin(mock.controller)]} />
    </>
  );
}
```

Only mount the devtools (and provide the mock layer) in development builds — for example behind `import.meta.env.DEV`.

## Standalone panel

The panel is a plain React component, so it can also live in a sidebar, a Storybook decorator, or anywhere else:

```tsx
import { MockDevtoolsPanel } from '@effect-firebase/devtools';

<MockDevtoolsPanel controller={mock.controller} />;
```

## Options

Both `firestoreMockPlugin(controller, options)` and `<MockDevtoolsPanel />` accept:

- `collections` — extra collection paths to always show, even before any document or state exists for them.
- `onStateChange(collectionPath, state)` — called after a toggle is applied.

`firestoreMockPlugin` additionally accepts `id`, `name` and `defaultOpen` for the TanStack Devtools shell.

### Making toggles visible on already-mounted pages

Two states are only observable at **subscription time**: a simulated `error` fails live streams terminally (matching `onSnapshot` semantics), and `loading` makes streams silent. A consumer that already holds data keeps showing it — with effect-atom, a result retains its previous value across `registry.refresh` and even component remounts, so neither is enough to reveal the toggled state.

Give the read a fresh **atom identity** instead: key it through `Atom.family` by an epoch that `onStateChange` bumps. A new epoch is a new atom, and a new atom starts from `Initial` against the toggled state — spinner for `loading`, failure for `error`, data on recovery:

```tsx
const mockEpochAtom = Atom.make(0);

const postsAtom = Atom.family((_epoch: number) =>
  runtime.atom(/* your stream */),
);

firestoreMockPlugin(mock.controller, {
  onStateChange: () => registry.update(mockEpochAtom, (epoch) => epoch + 1),
});

// In components:
const result = useAtomValue(postsAtom(useAtomValue(mockEpochAtom)));
```

Outside mock mode the epoch never changes, so the family behaves like a single shared atom. See `example/app` for the full wiring.

## License

MIT
