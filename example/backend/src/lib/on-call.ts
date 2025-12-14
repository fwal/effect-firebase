import { onCallEffect } from '@effect-firebase/admin';
import { Effect, Option } from 'effect';
import { runtime } from './runtime.js';
import { OnExampleCall, PostRepository } from '@example/shared';

/**
 * Example using onCallEffect with schemas.
 * This is the simple approach - schemas handle decoding/encoding automatically.
 */
export const onExampleCall = onCallEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
    inputSchema: OnExampleCall.Input,
    outputSchema: OnExampleCall.Output,
  },
  (input) =>
    Effect.gen(function* () {
      const posts = yield* PostRepository;
      const post = yield* posts.getById(input.id);
      return Option.getOrThrow(post);
    })
);
