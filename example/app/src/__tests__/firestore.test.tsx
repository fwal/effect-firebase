import { render, screen } from '@testing-library/react';
import { Stream } from 'effect';
import { MockFirestoreService } from '@effect-firebase/mock';
import { RegistryProvider } from '@effect/atom-react';
import { describe, it, expect } from 'vitest';
import { firestoreLayerAtom } from '../lib/atoms.js';
import { PostList } from '../routes/firestore.js';

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
});
