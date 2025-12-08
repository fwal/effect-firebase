import { Model, Query } from 'effect-firebase';
import { PostModel } from './post.js';
import { Effect } from 'effect';

export const PostRepository = Model.makeRepository(PostModel, {
  collectionPath: 'posts',
  idField: 'id',
  spanPrefix: 'example.PostRepository',
}).pipe(
  Effect.map((repository) => ({
    ...repository,
    // Additional methods can be added here
    streamLatest: () =>
      repository.streamQuery(Query.orderBy('createdAt', 'desc')),
  }))
);
