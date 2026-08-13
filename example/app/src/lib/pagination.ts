import type { Stream } from 'effect';
import { AsyncResult, Atom } from 'effect/unstable/reactivity';

/**
 * The value exposed by a paginated query atom.
 */
export interface Paginated<A> {
  readonly items: ReadonlyArray<A>;
  /** Whether another page exists beyond the currently loaded items. */
  readonly hasMore: boolean;
  /** Whether a fetchMore is in flight (initial loads report `false`). */
  readonly isFetchingMore: boolean;
}

/**
 * Build a realtime, growing-limit paginated atom from a stream-returning
 * query — the pattern used by FlutterFire UI's `FirestoreQueryBuilder`.
 *
 * The atom subscribes to `stream(pages * pageSize + 1)`: one extra row is
 * fetched beyond the visible window so `hasMore` is exact, and never
 * surfaced in `items`. Writing to the atom (any value) is `fetchMore`: it
 * grows the window by one page, ignored while a fetch is in flight or when
 * no more rows exist. Because the whole window is a single Firestore
 * listener, the entire list stays live — no cursor stitching, no gaps or
 * duplicates when documents shift between pages.
 *
 * @example
 * ```ts
 * const postsPaginatedAtom = makePaginatedQueryAtom(clientRuntime, {
 *   pageSize: 10,
 *   stream: (limit) =>
 *     Stream.unwrap(Effect.map(PostRepository, (r) =>
 *       r.queryStream(pipe(
 *         Query.orderBy('createdAt', 'desc'),
 *         Query.addLimit(limit),
 *       )),
 *     )),
 * });
 *
 * // const paginated = useAtomValue(postsPaginatedAtom)
 * // const fetchMore = useAtomSet(postsPaginatedAtom)
 * ```
 */
export const makePaginatedQueryAtom = <R, ER, A, E>(
  runtime: Atom.AtomRuntime<R, ER>,
  options: {
    readonly pageSize: number;
    readonly stream: (
      limit: number,
    ) => Stream.Stream<ReadonlyArray<A>, E, R | Atom.AtomRegistry>;
  },
) => {
  const pageCountAtom = Atom.make(1);

  const rowsAtom = runtime.atom((get) =>
    options.stream(get(pageCountAtom) * options.pageSize + 1),
  );

  return Atom.writable(
    (get) => {
      const visible = get(pageCountAtom) * options.pageSize;
      const rows = get(rowsAtom);
      // When the window grows, the rows atom rebuilds but keeps its previous
      // success with `waiting: true` — that window is exactly isFetchingMore.
      const isFetchingMore = AsyncResult.isSuccess(rows) && rows.waiting;
      return AsyncResult.map(rows, (all) => ({
        items: all.slice(0, visible),
        hasMore: all.length > visible,
        isFetchingMore,
      }));
    },
    (ctx, _value: void) => {
      const rows = ctx.get(rowsAtom);
      if (!AsyncResult.isSuccess(rows) || rows.waiting) return;
      const pages = ctx.get(pageCountAtom);
      if (rows.value.length <= pages * options.pageSize) return;
      ctx.set(pageCountAtom, pages + 1);
    },
  );
};
