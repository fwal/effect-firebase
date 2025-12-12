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

interface MaybeError {
  code?: unknown;
  name?: unknown;
  message?: unknown;
}

export class FirestoreError extends Data.TaggedError('FirestoreError')<{
  code: string;
  name: string;
  message: string;
}> {
  static fromError(error: unknown): FirestoreError {
    const maybeError = error as MaybeError;
    return new FirestoreError({
      code: maybeError.code?.toString() ?? 'unknown',
      name: maybeError.name?.toString() ?? 'UnknownError',
      message: maybeError.message?.toString() ?? String(error),
    });
  }
}
