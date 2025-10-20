import { Data } from 'effect';

export class UnexpectedTypeError extends Data.TaggedError(
  'UnexpectedTypeError'
)<{
  expected: 'Timestamp' | 'GeoPoint' | 'DocumentReference';
  actual: string;
}> {}

export class NotFoundError extends Data.TaggedError('NotFoundError')<{
  path: string;
}> {}

export class FirestoreError extends Data.TaggedError('FirestoreError')<{
  code: string;
  name: string;
  message: string;
}> {
  static fromError(error: unknown): FirestoreError {
    if (
      error instanceof Object &&
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof error.code === 'string' &&
      'name' in error &&
      typeof error.name === 'string' &&
      'message' in error &&
      typeof error.message === 'string'
    ) {
      return new FirestoreError({
        code: error.code,
        name: error.name,
        message: error.message,
      });
    }
    return this.unknown();
  }
  static unknown(): FirestoreError {
    return new FirestoreError({
      code: 'unknown',
      name: 'UnknownError',
      message: 'Unknown error',
    });
  }
}
