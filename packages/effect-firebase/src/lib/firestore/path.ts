/**
 * Validate a full path, returning an error message when it is malformed.
 * Documents sit at an even number of segments, collections at an odd number;
 * `split` never yields fewer than one segment, so requiring every segment to
 * be non-empty already rules out the empty path.
 */
const validatePath = (
  path: string,
  kind: 'document' | 'collection',
): string | undefined => {
  const segments = path.split('/');
  const parity = kind === 'document' ? 0 : 1;
  return segments.length % 2 === parity &&
    segments.every((segment) => segment.length > 0)
    ? undefined
    : `Invalid ${kind} path '${path}': expected a non-empty path with an ${
        parity === 0 ? 'even' : 'odd'
      } number of segments`;
};

/**
 * Validate a full document path, returning an error message when it is
 * malformed.
 *
 * Shared by every backend so the rule and its message stay in one place; the
 * client/admin layers gate `doc(db, path)` on it so the SDK's synchronous
 * parity throw becomes a typed `FirestoreError` instead of a defect or a
 * stream stall, matching the mock.
 */
export const validateDocPath = (path: string): string | undefined =>
  validatePath(path, 'document');

/**
 * Validate a full collection path, returning an error message when it is
 * malformed.
 *
 * Shared by every backend so the rule and its message stay in one place; the
 * client/admin layers gate `collection(db, path)` on it so the SDK's
 * synchronous parity throw becomes a typed `FirestoreError` instead of a
 * defect or a stream stall, matching the mock.
 */
export const validateCollectionPath = (path: string): string | undefined =>
  validatePath(path, 'collection');

/**
 * Validate a collection ID (a single path segment, as used by collection
 * group queries), returning an error message when it is malformed.
 *
 * Shared by the repository factory and every backend so the rule and its
 * message stay in one place.
 */
export const validateCollectionId = (
  collectionId: string,
): string | undefined =>
  collectionId.length > 0 && !collectionId.includes('/')
    ? undefined
    : `Invalid collection ID '${collectionId}': expected a single non-empty path segment`;

/**
 * The collection ID (final segment) of a collection path.
 */
export const collectionIdOf = (collectionPath: string): string => {
  const segments = collectionPath.split('/');
  return segments[segments.length - 1];
};
