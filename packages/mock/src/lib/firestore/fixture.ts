import { Effect, Schema } from 'effect';
import * as FastCheck from 'effect/testing/FastCheck';
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
  Id extends keyof S['Type'] & keyof S['fields'],
>(
  model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    readonly docs: ReadonlyArray<S['Type']>;
  },
): Fixture<S['EncodingServices']> => ({
  collectionPath: options.collectionPath,
  build: Effect.gen(function* () {
    const result: Record<string, DocData> = {};
    for (const doc of options.docs) {
      const encoded = (yield* Schema.encodeEffect(model as Schema.Top)(
        doc,
      )) as Record<string, unknown>;
      const { [options.idField as string]: id, ...data } = encoded;
      if (typeof id !== 'string' || id.length === 0) {
        return yield* Effect.die(
          new Error(
            `fixture(${options.collectionPath}): document is missing a string '${String(
              options.idField,
            )}' field`,
          ),
        );
      }
      result[`${options.collectionPath}/${id}`] = data;
    }
    return result;
  }) as Fixture<S['EncodingServices']>['build'],
});

/**
 * Create a fixture of documents generated from the model's schema via
 * `Schema.toArbitrary` and fast-check (bundled with effect — no extra
 * dependency). Useful for filling a page with volume — long lists,
 * pagination, layout stress — without writing documents by hand.
 *
 * Generation is deterministic: the same model, `count` and `seed` produce
 * the same documents on every run, so dev pages don't churn across reloads.
 * Document IDs are sequential (`generated-0001`, ...) rather than sampled,
 * keeping paths valid and collision-free; override with `id` if needed.
 *
 * Generated values satisfy the schema but read as noise (random strings,
 * extreme dates). For demo-quality content, write docs with {@link fixture}
 * — both are fixtures, so they compose in the same layer.
 *
 * @example
 * ```ts
 * const posts = generatedFixture(PostModel, {
 *   collectionPath: 'posts',
 *   idField: 'id',
 *   count: 50,
 * });
 * ```
 */
export const generatedFixture = <
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['fields'],
>(
  model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    /** Number of documents to generate. */
    readonly count: number;
    /** Seed for deterministic generation. Defaults to `1`. */
    readonly seed?: number;
    /** Custom document ID per index. Defaults to `generated-0001`, ... */
    readonly id?: (index: number) => string;
  },
): Fixture<S['EncodingServices']> => ({
  collectionPath: options.collectionPath,
  build: Effect.gen(function* () {
    const arbitrary = Schema.toArbitrary(model as Schema.Top);
    const samples = FastCheck.sample(arbitrary, {
      numRuns: options.count,
      seed: options.seed ?? 1,
    });
    const digits = String(Math.max(options.count, 1)).length;
    const result: Record<string, DocData> = {};
    for (const [index, doc] of samples.entries()) {
      const encoded = (yield* Schema.encodeEffect(model as Schema.Top)(
        doc,
      )) as Record<string, unknown>;
      // Sampled IDs can be empty or contain path separators; sequential IDs
      // keep paths valid and sort stably by document ID.
      const id =
        options.id?.(index) ??
        `generated-${String(index + 1).padStart(Math.max(digits, 4), '0')}`;
      const { [options.idField as string]: _ignored, ...data } = encoded;
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
  docs: Readonly<Record<string, DocData>>,
): Fixture => ({
  collectionPath,
  build: Effect.sync(() =>
    Object.fromEntries(
      Object.entries(docs).map(([id, data]) => [
        `${collectionPath}/${id}`,
        data,
      ]),
    ),
  ),
});
