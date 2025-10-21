import { Effect, Layer } from 'effect';
import { Admin, makeRuntime, onRequestEffect } from '@effect-firebase/admin';
import { PostRepository } from '@example/shared';

const runtime = makeRuntime(
  PostRepository.Default.pipe(Layer.merge(Admin.layer))
);

// Final interface for the user
export const functionB = onRequestEffect(
  {
    region: 'europe-north1',
    cors: true,
    runtime,
  },
  (request, response) =>
    Effect.gen(function* () {
      const posts = yield* PostRepository;
      const post = yield* posts.getPost(request.params['id']);
      return post;
    }).pipe(
      Effect.catchAll((error) => {
        console.error(error);
        response.status(500).send(String(error));
        return Effect.void;
      })
    )
);
