import { onCallEffect } from '@effect-firebase/admin';
import { Effect, Option, Schema, pipe } from 'effect';
import { runtime } from './runtime.js';
import { OnExampleCall, postId, PostRepository } from '@example/shared';
import { SerializeError } from './error-handler.js';
import { CallableRequest } from 'firebase-functions/https';

export const onExampleCall = onCallEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
  },
  (request) =>
    pipe(
      request,
      parseInput,
      Effect.andThen(fetchPost),
      Effect.andThen(serializeOutput),
      SerializeError
    )
);

const parseInput = (request: CallableRequest) =>
  Schema.decodeUnknown(OnExampleCall.Input)(request.data);

const fetchPost = (input: typeof OnExampleCall.Input.Type) =>
  Effect.gen(function* () {
    const posts = yield* PostRepository;
    const id = yield* postId(input.id);
    const post = yield* posts.findById(id);
    return Option.getOrThrow(post);
  });

const serializeOutput = Schema.encodeUnknown(OnExampleCall.Output);
