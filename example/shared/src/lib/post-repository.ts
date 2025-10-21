import { Effect, Schema } from 'effect';
import { FirestoreService } from 'effect-firebase';
import { PostSchema } from './post-schema.js';

export class PostRepository extends Effect.Service<PostRepository>()(
  'example/PostRepository',
  {
    effect: Effect.gen(function* () {
      const firestore = yield* FirestoreService;
      const decoder = Schema.decodeUnknown(PostSchema);

      return {
        getPost: (id: string) =>
          Effect.gen(function* () {
            return yield* firestore
              .get(`posts/${id}`)
              .pipe(Effect.map(decoder))
              .pipe(Effect.flatten);
          }),
      };
    }),
    dependencies: [],
  }
) {}
