import { Firestore, Query } from 'effect-firebase';
import { PostModel } from './post.js';
import { Effect } from 'effect';

export const PostRepository = Firestore.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: PostModel.idField,
  spanPrefix: 'example.PostRepository',
}).pipe(
  Effect.map((repository) => ({
    ...repository,
    // Additional methods can be added here
    latestPosts: () =>
      repository.queryStream(Query.orderBy('createdAt', 'desc')),
  }))
);
