import { Effect, Schema } from 'effect';
import { FirestoreService } from 'effect-firebase';
import { PostSchema } from './post-schema.js';

export class PostRepository extends Effect.Service<PostRepository>()(
  'example/PostRepository',
  {
    effect: Effect.gen(function* () {
      const firestore = yield* FirestoreService;
      const decoder = Schema.decodeUnknown(PostSchema);

      const getPost = (id: string) =>
        firestore.get(`posts/${id}`).pipe(Effect.map(decoder));

      return { getPost };
    }),
    dependencies: [],
  }
) {}
