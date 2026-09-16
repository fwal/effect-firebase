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
