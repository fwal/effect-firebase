import { Effect } from 'effect';
import { onRequestEffect } from '@effect-firebase/admin';
import { PostRepository } from '@example/shared';
import { runtime } from './runtime.js';
import { SerializeError } from './error-handler.js';

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
      SerializeError,
      Effect.map((result) => {
        if (!result) return;
        response
          .status(result.error.tag === 'NoSuchElementException' ? 404 : 500)
          .json(result.error);
      })
    )
);
