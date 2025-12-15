import { Effect, Option } from 'effect';
import { onRequestEffect } from '@effect-firebase/admin';
import { OnExampleRequest, PostId, PostRepository } from '@example/shared';
import { runtime } from './runtime.js';

/**
 * Example using onRequestEffect with schemas.
 * Body is parsed and response is encoded automatically.
 */
export const onExampleRequest = onRequestEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
    bodySchema: OnExampleRequest.Input,
    responseSchema: OnExampleRequest.Output,
  },
  (body) =>
    Effect.gen(function* () {
      const posts = yield* PostRepository;
      const id = PostId.make(body.id);
      const post = yield* posts.getById(id);
      return Option.getOrThrow(post);
    })
);
