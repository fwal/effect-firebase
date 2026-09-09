import { fireEvent, render, screen } from '@testing-library/react';
import { Stream } from 'effect';
import { MockFirestoreService } from '@effect-firebase/mock';
import { FirestoreSchema } from 'effect-firebase';
import type { Snapshot } from 'effect-firebase';
import { RegistryProvider } from '@effect/atom-react';
import { describe, it, expect } from 'vitest';
import { firestoreLayerAtom } from '../lib/atoms.js';
import { PostList } from '../routes/firestore.js';

const makeSnapshot = (i: number): Snapshot => [
  { id: `post-${i}`, path: `posts/post-${i}` },
  {
    title: `Post ${i}`,
    content: `Content ${i}`,
    author: FirestoreSchema.Reference.makeFromPath('authors/1'),
    createdAt: FirestoreSchema.Timestamp.fromMillis(1700000000000 - i * 1000),
    updatedAt: FirestoreSchema.Timestamp.fromMillis(1700000000000 - i * 1000),
    checked: false,
    list: [],
  },
];

/** Mock layer whose streamQuery honors the query's Limit constraint. */
const layerWithPosts = (count: number) => {
  const snapshots = Array.from({ length: count }, (_, i) => makeSnapshot(i));
  return MockFirestoreService({
    streamQuery: (_path, constraints) => {
      const limit = constraints.find(
        (c): c is Extract<typeof c, { count: number }> => c._tag === 'Limit',
      )?.count;
      return Stream.make(
        limit === undefined ? snapshots : snapshots.slice(0, limit),
      );
    },
  });
};

describe('PostList', () => {
  it('renders the empty state when the mock layer yields no posts', async () => {
    const layer = MockFirestoreService({
      streamQuery: () => Stream.make([]),
    });

    render(
      <RegistryProvider initialValues={[[firestoreLayerAtom, layer] as const]}>
        <PostList onEdit={() => undefined} />
      </RegistryProvider>,
    );

    expect(await screen.findByText(/No posts found/i)).toBeTruthy();
  });

  it('paginates: shows one page plus a Load more button that grows the window', async () => {
    render(
      <RegistryProvider
        initialValues={[[firestoreLayerAtom, layerWithPosts(7)] as const]}
      >
        <PostList onEdit={() => undefined} />
      </RegistryProvider>,
    );

    // First window: pageSize (5) items, the extra probe row is not rendered.
    expect(await screen.findByText('Post 0')).toBeTruthy();
    expect(screen.getAllByText(/^Post \d+$/)).toHaveLength(5);

    fireEvent.click(screen.getByRole('button', { name: /Load more/i }));

    // Second window: all 7 items, and no further page exists.
    expect(await screen.findByText('Post 6')).toBeTruthy();
    expect(screen.getAllByText(/^Post \d+$/)).toHaveLength(7);
    expect(screen.queryByRole('button', { name: /Load more/i })).toBeNull();
  });

  it('hides Load more when the collection fits within one page', async () => {
    render(
      <RegistryProvider
        initialValues={[[firestoreLayerAtom, layerWithPosts(5)] as const]}
      >
        <PostList onEdit={() => undefined} />
      </RegistryProvider>,
    );

    expect(await screen.findByText('Post 0')).toBeTruthy();
    expect(screen.getAllByText(/^Post \d+$/)).toHaveLength(5);
    expect(screen.queryByRole('button', { name: /Load more/i })).toBeNull();
  });
});
