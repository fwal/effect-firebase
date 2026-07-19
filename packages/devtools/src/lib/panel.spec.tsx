import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Effect } from 'effect';
import { make, rawFixture } from '@effect-firebase/mock';
import { MockDevtoolsPanel } from './panel.js';
import { firestoreMockPlugin } from './plugin.js';

const makeHandle = () =>
  make({
    fixtures: [
      rawFixture('posts', {
        '1': { title: 'Alpha' },
        '2': { title: 'Beta' },
      }),
      rawFixture('authors', {
        '1': { name: 'Ada' },
      }),
    ],
  });

/** Builds the handle's layer so fixtures are seeded into the store. */
const seed = (handle: ReturnType<typeof make>) =>
  Effect.runPromise(
    Effect.provide(Effect.void, handle.layer) as Effect.Effect<void>
  );

describe('MockDevtoolsPanel', () => {
  it('lists collections with document counts', async () => {
    const handle = makeHandle();
    await seed(handle);

    render(<MockDevtoolsPanel controller={handle.controller} />);

    expect(await screen.findByText('posts')).toBeDefined();
    expect(await screen.findByText('authors')).toBeDefined();
    expect(await screen.findByText('2 docs')).toBeDefined();
    expect(await screen.findByText('1 docs')).toBeDefined();
  });

  it('toggles a collection state through the controller', async () => {
    const handle = makeHandle();
    await seed(handle);

    render(<MockDevtoolsPanel controller={handle.controller} />);
    await screen.findByText('posts');

    const postsRow = screen.getByText('posts').parentElement as HTMLElement;
    fireEvent.click(
      Array.from(postsRow.querySelectorAll('button')).find(
        (button) => button.textContent === 'loading'
      ) as HTMLElement
    );

    await waitFor(async () => {
      const states = await Effect.runPromise(handle.controller.states);
      expect(states['posts']?._tag).toBe('Loading');
    });
  });

  it('applies the selected error code', async () => {
    const handle = makeHandle();
    await seed(handle);

    render(<MockDevtoolsPanel controller={handle.controller} />);
    await screen.findByText('posts');

    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'permission-denied' },
    });
    const postsRow = screen.getByText('posts').parentElement as HTMLElement;
    fireEvent.click(
      Array.from(postsRow.querySelectorAll('button')).find(
        (button) => button.textContent === 'error'
      ) as HTMLElement
    );

    await waitFor(async () => {
      const states = await Effect.runPromise(handle.controller.states);
      const state = states['posts'];
      expect(state?._tag).toBe('Error');
      if (state?._tag === 'Error') {
        expect(state.error.code).toBe('permission-denied');
      }
    });
  });

  it('reflects external state changes live', async () => {
    const handle = makeHandle();
    await seed(handle);

    render(<MockDevtoolsPanel controller={handle.controller} />);
    await screen.findByText('posts');

    await Effect.runPromise(
      handle.controller.setDoc('comments/1', { body: 'Hi' })
    );

    expect(await screen.findByText('comments')).toBeDefined();
  });

  it('notifies onStateChange after a toggle', async () => {
    const handle = makeHandle();
    await seed(handle);
    const seen: Array<[string, string]> = [];

    render(
      <MockDevtoolsPanel
        controller={handle.controller}
        onStateChange={(collection, state) => {
          seen.push([collection, state._tag]);
        }}
      />
    );
    await screen.findByText('posts');

    const postsRow = screen.getByText('posts').parentElement as HTMLElement;
    fireEvent.click(
      Array.from(postsRow.querySelectorAll('button')).find(
        (button) => button.textContent === 'empty'
      ) as HTMLElement
    );

    expect(seen).toEqual([['posts', 'Empty']]);
  });
});

describe('firestoreMockPlugin', () => {
  it('produces a TanStack Devtools plugin descriptor', () => {
    const handle = makeHandle();
    const plugin = firestoreMockPlugin(handle.controller, {
      defaultOpen: true,
    });
    expect(plugin.id).toBe('effect-firebase-mock');
    expect(plugin.name).toBe('Firestore Mock');
    expect(plugin.defaultOpen).toBe(true);
    expect(plugin.render).toBeDefined();
  });
});
