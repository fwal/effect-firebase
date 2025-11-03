import { onCallEffect } from '@effect-firebase/admin';
import { Effect, Schema } from 'effect';
import { runtime } from './runtime.js';
import { PostRepository } from '@example/shared';
import { NoSuchElementException } from 'effect/Cause';

const Input = Schema.Struct({
  id: Schema.String,
});

export const onExampleCall = onCallEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
  },
  (request) =>
    Effect.gen(function* () {
      const input = yield* Schema.decodeUnknown(Input)(request.data);
      const posts = yield* PostRepository;
      const post = yield* posts.getPost(input.id);
      return post;
    }).pipe(
      Effect.catchAll((error) => {
        if (error instanceof NoSuchElementException) {
          return Effect.succeed({ error: 'Post not found' });
        }
        return Effect.die(error);
      })
    )
);
