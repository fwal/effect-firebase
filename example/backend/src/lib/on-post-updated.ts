import { onDocumentCreatedEffect } from '@effect-firebase/admin';
import { Effect } from 'effect';
import { PostModel, PostRepository } from '@example/shared';
import { runtime } from './runtime.js';

export const onPostCreated = onDocumentCreatedEffect(
  {
    region: 'europe-north1',
    runtime: runtime,
    document: 'posts/{postId}',
    schema: PostModel,
    idField: PostModel.idField,
  },
  (post) =>
    Effect.gen(function* () {
      yield* Effect.log(`Post updated, setting check for: ${post.id}`);
      const repo = yield* PostRepository;
      yield* repo.update(post.id, { checked: true });
    }).pipe(Effect.withLogSpan('runtime'), Effect.catchAll(Effect.logError))
);
