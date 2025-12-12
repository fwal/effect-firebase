import { onDocumentUpdatedEffect } from '@effect-firebase/admin';
import { Effect } from 'effect';
import { PostModel } from '@example/shared';
import { runtime } from './runtime.js';

export const onPostUpdated = onDocumentUpdatedEffect(
  {
    region: 'europe-north1',
    runtime: runtime,
    document: 'posts/{postId}',
    schema: PostModel,
    idField: PostModel.idField,
  },
  ({ after }) =>
    Effect.gen(function* () {
      const post = after;
      yield* Effect.log(`Post updated: ${post.id}`);
    }).pipe(Effect.withLogSpan('runtime'))
);
