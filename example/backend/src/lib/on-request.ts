import { Effect } from 'effect';
import { onRequestEffect } from '@effect-firebase/admin';
import { PostRepository } from '@example/shared';
import { runtime } from './runtime.js';
import { NoSuchElementException } from 'effect/Cause';

export const onExampleRequest = onRequestEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
  },
  (_, response) =>
    Effect.gen(function* () {
      const posts = yield* PostRepository;
      const post = yield* posts.getPost('123');
      response.status(200).json(post);
    }).pipe(
      Effect.catchAll((error) => {
        if (error instanceof NoSuchElementException) {
          Effect.logDebug('Post not found');
          response.status(404).json({ error: 'Post not found' });
          return Effect.void;
        } else {
          response.status(500).json({ error: String(error) });
          return Effect.void;
        }
      })
    )
);
