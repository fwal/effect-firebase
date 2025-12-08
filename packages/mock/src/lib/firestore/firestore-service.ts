import { Layer } from 'effect';
import { FirestoreService, FirestoreServiceShape } from 'effect-firebase';

export const MockFirestoreService = (
  overrides: Partial<FirestoreServiceShape> = {}
) =>
  Layer.succeed(FirestoreService, {
    get: () => {
      throw new Error('MockFirestoreService.get not implemented.');
    },
    add: () => {
      throw new Error('MockFirestoreService.add not implemented.');
    },
    set: () => {
      throw new Error('MockFirestoreService.set not implemented.');
    },
    update: () => {
      throw new Error('MockFirestoreService.update not implemented.');
    },
    remove: () => {
      throw new Error('MockFirestoreService.remove not implemented.');
    },
    query: () => {
      throw new Error('MockFirestoreService.query not implemented.');
    },
    streamDoc: () => {
      throw new Error('MockFirestoreService.streamDoc not implemented.');
    },
    streamQuery: () => {
      throw new Error('MockFirestoreService.streamQuery not implemented.');
    },
    ...overrides,
  });
