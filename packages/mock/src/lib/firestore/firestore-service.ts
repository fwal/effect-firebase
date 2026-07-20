import { Layer } from 'effect';
import { FirestoreService, FirestoreServiceShape } from 'effect-firebase';

/**
 * Mock Firestore Service for testing purposes.
 * @param overrides - The overrides for the Firestore service.
 * @returns The mocked Firestore service.
 */
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
    delete: () => {
      throw new Error('MockFirestoreService.delete not implemented.');
    },
    deleteRecursive: () => {
      throw new Error('MockFirestoreService.deleteRecursive not implemented.');
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
    // The mock has no concurrency or staging semantics, so transactions and
    // batches simply run the effect: reads and writes hit the overridden
    // methods directly.
    withTransaction: (self) => self,
    withBatch: (self) => self,
    ...overrides,
  });
