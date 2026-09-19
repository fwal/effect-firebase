import {
  Snapshot,
  validateCollectionId,
  validateCollectionPath,
  validateDocPath,
} from 'effect-firebase';

export { validateCollectionId, validateCollectionPath, validateDocPath };
import type * as MockState from './state.js';
import { type DocData } from './value.js';

/**
 * The full state of the mock backend at a point in time: every stored
 * document (keyed by full document path) and every simulated collection state.
 */
export interface StoreSnapshot {
  readonly docs: Readonly<Record<string, DocData>>;
  readonly states: Readonly<Record<string, MockState.State>>;
}

/**
 * The collection path a document path belongs to (everything before the
 * final segment).
 */
export const parentPath = (path: string): string => {
  const segments = path.split('/');
  return segments.slice(0, -1).join('/');
};

/**
 * The document ID (final segment) of a document path.
 */
export const idOf = (path: string): string => {
  const segments = path.split('/');
  return segments[segments.length - 1];
};

/**
 * Build a snapshot tuple for a stored document.
 */
export const makeSnapshot = (path: string, data: DocData): Snapshot => [
  { id: idOf(path), path },
  data,
];

/**
 * All direct child documents of a collection, ordered by document ID.
 */
export const docsInCollection = (
  docs: Readonly<Record<string, DocData>>,
  collectionPath: string,
): ReadonlyArray<Snapshot> => {
  const prefix = `${collectionPath}/`;
  return Object.entries(docs)
    .filter(
      ([path]) =>
        path.startsWith(prefix) && !path.slice(prefix.length).includes('/'),
    )
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, data]) => makeSnapshot(path, data));
};

/**
 * All documents in any collection whose ID is `collectionId`, at any depth,
 * ordered by full document path.
 */
export const docsInCollectionGroup = (
  docs: Readonly<Record<string, DocData>>,
  collectionId: string,
): ReadonlyArray<Snapshot> =>
  Object.entries(docs)
    .filter(([path]) => {
      const segments = path.split('/');
      return segments[segments.length - 2] === collectionId;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, data]) => makeSnapshot(path, data));
