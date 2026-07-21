import { Effect, Schema } from 'effect';
import { Model } from 'effect/unstable/schema';
import type { DocData } from './value.js';

/**
 * A set of hard-coded documents to seed the mock backend with.
 * Create one with {@link fixture} (schema-encoded models) or
 * {@link rawFixture} (already-encoded document data).
 */
export interface Fixture<R = never> {
  readonly collectionPath: string;
  /**
   * Builds the documents, keyed by full document path.
   */
  readonly build: Effect.Effect<
    Readonly<Record<string, DocData>>,
    Schema.SchemaError,
    R
  >;
}

/**
 * Create a fixture from hard-coded models. Documents are encoded through the
 * model's schema, so reads exercise the exact same decoding path as real data.
 *
 * @example
 * ```ts
 * const posts = fixture(PostModel, {
 *   collectionPath: 'posts',
 *   idField: 'id',
 *   docs: [
 *     new PostModel({ id: PostId.make('1'), title: 'Hello', ... }),
 *   ],
 * });
 * ```
 */
export const fixture = <
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['fields']
>(
  model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    readonly docs: ReadonlyArray<S['Type']>;
  }
): Fixture<S['EncodingServices']> => ({
  collectionPath: options.collectionPath,
  build: Effect.gen(function* () {
    const result: Record<string, DocData> = {};
    for (const doc of options.docs) {
      const encoded = (yield* Schema.encodeEffect(model as Schema.Top)(
        doc
      )) as Record<string, unknown>;
      const { [options.idField as string]: id, ...data } = encoded;
      if (typeof id !== 'string' || id.length === 0) {
        return yield* Effect.die(
          new Error(
            `fixture(${options.collectionPath}): document is missing a string '${String(
              options.idField
            )}' field`
          )
        );
      }
      result[`${options.collectionPath}/${id}`] = data;
    }
    return result;
  }) as Fixture<S['EncodingServices']>['build'],
});

/**
 * Create a fixture from already-encoded document data, keyed by document ID.
 * Useful when there is no model schema, or for ad-hoc documents.
 *
 * @example
 * ```ts
 * const settings = rawFixture('settings', {
 *   general: { theme: 'dark' },
 * });
 * ```
 */
export const rawFixture = (
  collectionPath: string,
  docs: Readonly<Record<string, DocData>>
): Fixture => ({
  collectionPath,
  build: Effect.sync(() =>
    Object.fromEntries(
      Object.entries(docs).map(([id, data]) => [
        `${collectionPath}/${id}`,
        data,
      ])
    )
  ),
});
