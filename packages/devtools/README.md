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

const mock = make({
  fixtures: [posts, authors],
});

// Provide mock.layer wherever your app builds its Effect runtime.
// With effect-atom, for example:
//   const runtime = Atom.runtime(mock.layer);

export function App() {
  return (
    <>
      {/* ... */}
      <TanStackDevtools
        plugins={[firestoreMockPlugin(mock.controller)]}
      />
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

### Recovering from simulated errors

A simulated `error` fails live streams **terminally**, matching real `onSnapshot` semantics. Consumers must re-subscribe once the state recovers. Use `onStateChange` to hook your re-subscription mechanism — e.g. refreshing the atoms or queries that read from the collection:

```tsx
firestoreMockPlugin(mock.controller, {
  onStateChange: (collectionPath, state) => {
    if (state._tag !== 'Error') {
      registry.refresh(postsAtom); // effect-atom example
    }
  },
});
```

The same applies to `loading`: an already-resolved effect keeps its value; refresh it while the collection is loading to see your initial loading UI again.

## License

MIT
