import { Model } from 'effect-firebase';
import { AuthorModel } from './author.js';
import { Effect } from 'effect';

export const AuthorRepository = Model.makeRepository(AuthorModel, {
  collectionPath: 'authors',
  idField: 'id',
  spanPrefix: 'example.AuthorRepository',
}).pipe(
  Effect.map((repository) => ({
    ...repository,
    // Additional methods can be added here
  }))
);
