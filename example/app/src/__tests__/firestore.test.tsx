import { render, screen } from '@testing-library/react';
import { Stream } from 'effect';
import { MockFirestoreService } from '@effect-firebase/mock';
import { describe, it, expect } from 'vitest';
import { RuntimeProvider } from '../lib/effect-react.js';
import { PostList } from '../routes/firestore.js';

describe('PostList', () => {
  it('renders the empty state when the mock layer yields no posts', async () => {
    const layer = MockFirestoreService({
      streamQuery: () => Stream.make([]),
    });

    render(
      <RuntimeProvider layer={layer}>
        <PostList onEdit={() => undefined} />
      </RuntimeProvider>,
    );

    expect(await screen.findByText(/No posts found/i)).toBeTruthy();
  });
});
