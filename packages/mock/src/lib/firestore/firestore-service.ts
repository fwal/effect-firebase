import { Layer } from 'effect';
import { FirestoreService, FirestoreServiceShape } from 'effect-firebase';

export const MockFirestoreService = (
  overrides: Partial<FirestoreServiceShape> = {}
) =>
  Layer.succeed(FirestoreService, {
    get: () => {
      throw new Error('Function not implemented.');
    },
    add: () => {
      throw new Error('Function not implemented.');
    },
    set: () => {
      throw new Error('Function not implemented.');
    },
    update: () => {
      throw new Error('Function not implemented.');
    },
    remove: () => {
      throw new Error('Function not implemented.');
    },
    ...overrides,
  });
