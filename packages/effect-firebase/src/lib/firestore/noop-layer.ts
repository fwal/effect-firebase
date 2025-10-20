import { Data, Effect, Layer } from 'effect';
import { FirestoreService } from './firestore-service.js';

export class NotInitializedError extends Data.TaggedError(
  'NotInitializedError'
)<{
  message: string;
}> {}

const NotInitiallized = <T>(): T =>
  Effect.fail(
    new NotInitializedError({
      message: 'Firestore is not initialized',
    })
  ) as unknown as T;

export const noopLayer = Layer.succeed(FirestoreService, {
  get: NotInitiallized,
  convertToTimestamp: NotInitiallized,
  convertFromTimestamp: NotInitiallized,
  convertToGeoPoint: NotInitiallized,
  convertFromGeoPoint: NotInitiallized,
  convertFromReference: NotInitiallized,
  convertToReference: NotInitiallized,
});
