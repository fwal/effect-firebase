import { onCallEffect } from '@effect-firebase/admin';
import { Effect, Schema } from 'effect';
import { runtime } from './runtime.js';
import { OnExampleCall, PostRepository } from '@example/shared';
import { SerializeError } from './error-handler.js';

export const onExampleCall = onCallEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
  },
  (request) =>
    Effect.gen(function* () {
      const input = yield* Schema.decodeUnknown(OnExampleCall.Input)(
        request.data
      );
      const posts = yield* PostRepository;
      const post = yield* posts.getPost(input.id);
      return post;
    }).pipe(SerializeError)
);
