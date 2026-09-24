import {
  Array as Arr,
  Effect,
  Option,
  Schema,
  SchemaIssue,
  Stream,
  Struct,
} from 'effect';
import { Model } from 'effect/unstable/schema';
import { FirestoreService } from '../firestore-service.js';
import { collectionIdOf, validateCollectionId } from '../path.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementError, UnknownError } from 'effect/Cause';
import { FirestoreError } from '../errors.js';
import * as Fetch from './fetch.js';
import type { QueryConstraint } from '../query/constraints.js';
import {
  flattenForMerge,
  isFieldPath,
  resolveFieldPath,
  type MergeUpdateData,
  type UpdateData,
} from './update-path.js';

export type { MergeUpdateData, UpdateData } from './update-path.js';

export type UpdateOptions = {
  /**
   * Flatten nested objects into dotted field paths before writing, so a
   * nested partial merges into the stored map instead of replacing it.
   * @default false
   */
  readonly merge?: boolean;
};

export type ModelError =
  FirestoreError | UnknownError | NoSuchElementError | Schema.SchemaError;

export type RepositoryQuery<S> = ReadonlyArray<QueryConstraint> & {
  readonly _schema?: S;
};

/**
 * A write for {@link Repository.set}, carrying the payload plus the two
 * decisions `set` cannot make on the caller's behalf: which schema variant
 * encodes the payload, and whether to merge into an existing document.
 */
export type SetWrite<S extends Model.Any> =
  | {
      /**
       * Encode through `Model.insert`. Insert-only fields (for example
       * `Model.DateTimeInsert`) are stamped with the current time.
       * @default 'insert'
       */
      readonly variant?: 'insert';
      readonly data: S['insert']['Type'];
      /**
       * Merge into an existing document instead of replacing it.
       * @default false
       */
      readonly merge?: boolean;
    }
  | {
      /**
       * Encode through `Model.update`. Insert-only fields are omitted from
       * the payload entirely, so a merge leaves them untouched and a full
       * overwrite drops them from the stored document.
       */
      readonly variant: 'update';
      readonly data: S['update']['Type'];
      /**
       * Merge into an existing document instead of replacing it.
       * @default false
       */
      readonly merge?: boolean;
    };

/**
 * The query surface of a {@link Repository}, available both on the
 * repository itself and on its collection group view `repo.group`.
 */
export type RepositoryQueries<S extends Model.Any> = {
  /**
   * Query the database.
   * @param constraints - The constraints to apply to the query.
   * @returns A list of the results of the query.
   */
  readonly query: (
    constraints: RepositoryQuery<S>,
  ) => Effect.Effect<
    ReadonlyArray<S['Type']>,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;

  /**
   * Stream the results of a query.
   * @param constraints - The constraints to apply to the query.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the results of the query.
   */
  readonly queryStream: (
    constraints: RepositoryQuery<S>,
  ) => Stream.Stream<
    ReadonlyArray<S['Type']>,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;

  /**
   * Query the database and return the first result.
   * @param constraints - The constraints to apply to the query.
   * @returns The first result of the query, or `None` if no results.
   */
  readonly getByQuery: (
    constraints: RepositoryQuery<S>,
  ) => Effect.Effect<
    Option.Option<S['Type']>,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;

  /**
   * Stream the first result of a query.
   * @param constraints - The constraints to apply to the query.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the first result and any updates to it.
   */
  readonly getByQueryStream: (
    constraints: RepositoryQuery<S>,
  ) => Stream.Stream<
    Option.Option<S['Type']>,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;
};

export type Repository<
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['fields'],
  IdSchema extends (S['fields'][Id] extends Schema.String
    ? S['fields'][Id]
    : never),
> = {
  /**
   * Add a document model.
   * @param data - The data to add the document model with.
   * @returns The ID of the added document model.
   */
  readonly add: (
    data: S['insert']['Type'],
  ) => Effect.Effect<
    IdSchema['Type'],
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['insert']['EncodingServices']
  >;

  /**
   * Set (upsert) a document model at a known ID: inserts when the document
   * is absent, overwrites every field when it exists.
   *
   * Two properties make this sharper than it looks.
   *
   * **It is nondeterministic.** One call is two operations, chosen by state
   * the call site cannot see, and both succeed silently — so a `set` meant
   * to create can replace an existing document instead. Where the intent is
   * fixed, say so with an operation that can only do that: {@link add}
   * always inserts (Firestore picks the ID), {@link update} always updates
   * and fails `not-found` if the document is absent. To claim a known ID
   * without clobbering, read and branch inside `Firestore.withTransaction`
   * — a bare `getById`-then-`set` is a race.
   *
   * **It must choose a schema variant before it knows which operation it
   * is.** That choice decides the fate of insert-only fields such as
   * `Model.DateTimeInsert` (`createdAt`), which `Model.insert` stamps with
   * the current time and `Model.update` omits altogether. Neither is right
   * in both cases, so `write.variant` leaves it to the caller:
   *
   * - `'insert'` (default) re-stamps `createdAt` on every write, `merge`
   *   included — overwriting the original creation time, which cannot be
   *   recovered.
   * - `'update'` never sends `createdAt`, so `{ merge: true }` preserves
   *   it, while a full overwrite drops it from the stored document.
   *
   * Rule of thumb: `'insert'` for a document you expect to be new,
   * `'update'` with `{ merge: true }` for one you expect to exist. Both are
   * assertions, not checks — `set` still will not verify which case it is
   * in.
   *
   * @param id - The ID to write the document model at.
   * @param write - The payload, the schema {@link SetWrite.variant} that
   *   encodes it, and whether to merge.
   * @returns A unit value.
   */
  readonly set: (
    id: IdSchema['Type'],
    write: SetWrite<S>,
  ) => Effect.Effect<
    void,
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['insert']['EncodingServices']
    | S['update']['EncodingServices']
    | S['fields'][Id]['EncodingServices']
  >;

  /**
   * Update a document model. Fails with `FirestoreError` code `not-found`
   * if the document is absent.
   *
   * `data` is any subset of the `update` variant's fields, plus Firestore
   * dot-separated paths into nested maps (`'metaData.deleted': true`)
   * which update just that nested field. A whole-field key replaces the
   * whole value, so `metaData: { ... }` overwrites the entire map. With
   * `{ merge: true }`, `data` is instead a deep partial: nested objects are
   * flattened into dotted paths, so `metaData: { deleted: true }` updates
   * only `metaData.deleted`.
   *
   * Keys the model does not declare fail with a `SchemaError` naming the
   * key; an empty payload fails with `FirestoreError` code
   * `invalid-argument`. An explicit `undefined` for a *declared* key
   * likewise fails with a `SchemaError` naming the key rather than being
   * forwarded to Firestore, where the SDKs reject `undefined` as a value at
   * write time. Omit the key to leave a field untouched instead.
   *
   * @param id - The ID of the document model to update.
   * @param data - The fields and field paths to update. See
   *   {@link UpdateData} and {@link MergeUpdateData}.
   * @param options - See {@link UpdateOptions}.
   * @returns A unit value.
   */
  readonly update: {
    (
      id: IdSchema['Type'],
      data: UpdateData<Omit<S['update']['Type'], Id>>,
      options?: { readonly merge?: false },
    ): Effect.Effect<
      void,
      ModelError,
      | S['DecodingServices']
      | S['EncodingServices']
      | S['update']['EncodingServices']
    >;
    (
      id: IdSchema['Type'],
      data: MergeUpdateData<Omit<S['update']['Type'], Id>>,
      options: { readonly merge: true },
    ): Effect.Effect<
      void,
      ModelError,
      | S['DecodingServices']
      | S['EncodingServices']
      | S['update']['EncodingServices']
    >;
  };

  /**
   * Get a document model by ID.
   * @param id - The ID of the document model to get.
   * @returns The document model.
   */
  readonly getById: (
    id: IdSchema['Type'],
  ) => Effect.Effect<
    Option.Option<S['Type']>,
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['fields'][Id]['EncodingServices']
  >;

  /**
   * Stream a document model by ID.
   * @param id - The ID of the document model to stream.
   * @returns A {@link https://effect.website/docs/stream/introduction/ | Stream} of the model and any updates to it.
   */
  readonly getByIdStream: (
    id: IdSchema['Type'],
  ) => Stream.Stream<
    Option.Option<S['Type']>,
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['fields'][Id]['EncodingServices']
  >;
  /**
   * Delete a document model by ID.
   * @param id - The ID of the document model to delete.
   * @returns A unit value.
   */
  readonly delete: (
    id: IdSchema['Type'],
  ) => Effect.Effect<
    void,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;

  /**
   * Recursively delete a document model and all its subcollections.
   *
   * **Admin SDK only.** This will cause a defect (`Effect.die`) if the
   * repository is run against the client SDK layer. Only use this in
   * admin / server-side contexts.
   *
   * @param id - The ID of the document model to delete.
   * @returns A unit value.
   */
  readonly deleteRecursive: (
    id: IdSchema['Type'],
  ) => Effect.Effect<
    void,
    ModelError,
    S['DecodingServices'] | S['EncodingServices']
  >;
} & RepositoryQueries<S> & {
    /**
     * The same four query methods, run over the **collection group** with this
     * repository's collection ID (the last segment of `collectionPath`): every
     * collection with that ID, at any depth. A repository over
     * `posts/{postId}/comments` therefore reads comments across all posts via
     * `repo.group.query(...)`.
     *
     * Firestore requires a collection-group index for the fields a group query
     * filters or orders on. Set `pathField` on the repository to learn which
     * collection each result came from.
     */
    readonly group: RepositoryQueries<S>;
  };

/**
 * The keys of `S` whose field schema is a string, so a path field can be
 * filled with a document path.
 */
export type StringFieldKey<S extends Model.Any> = {
  [
    K in keyof S['fields'] & keyof S['Type']
  ]: S['fields'][K] extends Schema.String ? K : never;
}[keyof S['fields'] & keyof S['Type']];

/**
 * Create a repository for a document model.
 * @param Model - The model to create a repository for.
 * @param options - The options for the repository.
 * @returns The repository.
 *
 * @example
 * ```ts
 * import { Model } from 'effect/unstable/schema';
 * import { Firestore } from 'effect-firebase';
 * import { PostModel } from './post.js';
 *
 * const PostRepository = Firestore.makeRepository(PostModel, {
 *   collectionPath: 'posts',
 *   idField: 'id',
 *   spanPrefix: 'example.PostRepository',
 * });
 * ```
 *
 * @example
 * ```ts
 * import { PostRepository } from './post-repository.js';
 *
 * const post = yield* PostRepository.getById('123');
 * ```
 *
 * @example
 * ```ts
 * import { PostRepository } from './post-repository.js';
 *
 * const posts = yield* PostRepository.query(Query.orderBy('createdAt', 'desc'));
 * ```
 *
 * @example
 * ```ts
 * // A repository over a subcollection can read across every parent through
 * // its collection group view.
 * const CommentRepository = (postId: string) =>
 *   Firestore.makeRepository(CommentModel, {
 *     collectionPath: `posts/${postId}/comments`,
 *     idField: 'id',
 *     pathField: 'path',
 *     spanPrefix: 'example.CommentRepository',
 *   });
 *
 * const repo = yield* CommentRepository('p1');
 * const mine = yield* repo.query(Query.orderBy('createdAt', 'desc'));
 * const everywhere = yield* repo.group.query(Query.orderBy('createdAt', 'desc'));
 * ```
 */
export const makeRepository = <
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['fields'],
  IdSchema extends (S['fields'][Id] extends Schema.String
    ? S['fields'][Id]
    : never),
>(
  Model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    /**
     * A string field to fill with each document's full path on read (for
     * example `posts/p1/comments/c1`). Declare it as
     * `Model.GeneratedByDb(Schema.String)` so it is never part of a write
     * payload. Mostly useful together with {@link Repository.group}, whose
     * results span many parent documents.
     */
    readonly pathField?: StringFieldKey<S>;
    readonly spanPrefix: string;
  },
): Effect.Effect<Repository<S, Id, IdSchema>, never, FirestoreService> =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;

    const collectionId = collectionIdOf(options.collectionPath);
    const invalidId = validateCollectionId(collectionId);
    if (invalidId !== undefined) {
      return yield* Effect.die(
        new Error(`${options.spanPrefix}: ${invalidId}`),
      );
    }

    const idSchema = Model.fields[options.idField] as unknown as IdSchema;

    const structFromSnapshot = (snapshot: Snapshot) => {
      const [ref, data] = snapshot;
      return {
        ...data,
        [options.idField]: ref.id,
        ...(options.pathField === undefined
          ? {}
          : { [options.pathField]: ref.path }),
      };
    };

    const addSchema = Fetch.findOne({
      Request: Model.insert,
      Result: idSchema,
      execute: (data: unknown) =>
        firestore
          .add(options.collectionPath, data as Record<string, unknown>)
          .pipe(Effect.map((value) => [value.id])),
    });

    const add = (data: S['insert']['Type']) =>
      addSchema(data).pipe(
        Effect.withSpan(`${options.spanPrefix}.add`, {
          attributes: { data },
        }),
      );

    // Request schemas for set: required id + the variant's data fields.
    // The id field is omitted from the data fields (when present at all —
    // generated ids are not part of either variant) since the explicit id
    // argument decides the document path.
    const setFieldsSchema = (variantSchema: Schema.Top) =>
      Schema.Struct({
        [options.idField]: idSchema,
      }).pipe(
        Schema.fieldsAssign(
          (variantSchema as Schema.Struct<Schema.Struct.Fields>).mapFields(
            Struct.omit([options.idField as string]),
          ).fields,
        ),
      );

    const setInsertFieldsSchema = setFieldsSchema(Model.insert);
    const setUpdateFieldsSchema = setFieldsSchema(Model.update);

    const makeSetWriter = (
      Request: ReturnType<typeof setFieldsSchema>,
      writeOptions?: { readonly merge: true },
    ) =>
      Fetch.void({
        Request,
        execute: (input: unknown) => {
          const record = input as Record<string, unknown>;
          const { [options.idField as string]: id, ...data } = record;
          return firestore.set(
            `${options.collectionPath}/${id as string}`,
            data,
            writeOptions,
          );
        },
      });

    // All four combinations are built up front: Fetch.void compiles its
    // request encoder on construction, so building per call would recompile
    // a schema on every write.
    const setWriters = {
      insert: {
        replace: makeSetWriter(setInsertFieldsSchema),
        merge: makeSetWriter(setInsertFieldsSchema, { merge: true }),
      },
      update: {
        replace: makeSetWriter(setUpdateFieldsSchema),
        merge: makeSetWriter(setUpdateFieldsSchema, { merge: true }),
      },
    };

    const set = (id: IdSchema['Type'], write: SetWrite<S>) => {
      const variant = write.variant ?? 'insert';
      const writer =
        setWriters[variant][write.merge === true ? 'merge' : 'replace'];
      return writer({
        ...(write.data as Record<string, unknown>),
        [options.idField]: id,
      } as Parameters<typeof writer>[0]).pipe(
        Effect.withSpan(`${options.spanPrefix}.set`, {
          attributes: {
            id,
            data: write.data,
            variant,
            merge: write.merge ?? false,
          },
        }),
      );
    };

    // Request schema for update: required id + partial data fields (all
    // optional). Encoded strictly, so an undeclared key fails with a
    // SchemaError naming it instead of being dropped from the payload.
    //
    // Each field is wrapped with `Schema.optional` (not `Schema.optionalKey`)
    // so a missing input key stays missing in the encoded payload: an omitted
    // field is left untouched, matching the documented contract ("Omit the key
    // to leave a field untouched instead"). `Schema.optionalKey` instead fills
    // a missing key for a field whose `update` schema encodes `Option.none()`
    // as a present `null` (the `Firestore.Optional` helper's
    // `OptionFromOptionalNullOr({ onNoneEncoding: null })` arm), which makes
    // `repo.update(id, { sibling: v })` silently write `null` to the omitted
    // `Optional` field — clearing whatever was stored there.
    //
    // `Schema.optional` accepts an explicit `{ field: undefined }` value
    // (encoding it as a missing key), so an explicit-undefined pre-check below
    // rejects it with a `SchemaError` naming the field before encoding, instead
    // of letting the Firebase SDKs reject `undefined` at write time with a less
    // helpful error (AGENTS.md gotcha #11).
    const PartialDataSchema = (
      Model.update as Schema.Struct<Schema.Struct.Fields>
    )
      .mapFields(Struct.omit([options.idField as string]))
      .mapFields(Struct.map(Schema.optional));

    const updateFieldsSchema = Schema.Struct({
      [options.idField]: idSchema,
    }).pipe(Schema.fieldsAssign(PartialDataSchema.fields));

    const encodeUpdateFields = Schema.encodeUnknownEffect(
      updateFieldsSchema,
      Fetch.strictEncoding,
    );

    // An explicit `{ field: undefined }` is rejected before encoding. The
    // `Schema.optional` wrapping would otherwise accept it (encoding it as a
    // missing key), and Firestore rejects `undefined` as a value at write time
    // with a less helpful error. The issue points at the offending key so the
    // caller sees which field was at fault; the message echoes the documented
    // remedy ("Omit the key to leave a field untouched instead" — see the
    // `update` doc above). Built once: it carries no per-call data, only the
    // key path which is added per call via `SchemaIssue.Pointer`.
    const undefinedFieldIssue = new SchemaIssue.InvalidValue({
      message:
        'must not be `undefined`; omit the key to leave the field untouched',
    });

    // A dotted key ('metaData.deleted') names a nested field. It resolves to
    // its leaf schema in Model.update and is encoded on its own, wrapped in a
    // one-key struct so a failure still reports the offending path. A key
    // that does not resolve stays in the struct payload, where the strict
    // encoder rejects it by name. Encoders are cached per path because
    // Schema.encodeUnknownEffect compiles on construction.
    // A leaf whose schema omits the key on encode (for example an
    // `OptionalDeletable` given `Option.none()`) resolves to `None`, so the
    // caller can leave it out of the payload rather than write `undefined`.
    type LeafEncoder = (
      value: unknown,
    ) => Effect.Effect<Option.Option<unknown>, Schema.SchemaError, unknown>;
    const leafEncoders = new Map<string, LeafEncoder>();
    const leafEncoder = (path: string): Option.Option<LeafEncoder> => {
      const cached = leafEncoders.get(path);
      if (cached !== undefined) return Option.some(cached);
      return Option.map(resolveFieldPath(PartialDataSchema, path), (leaf) => {
        const encodeLeaf = Schema.encodeUnknownEffect(
          Schema.Struct({ [path]: leaf }),
          Fetch.strictEncoding,
        );
        const encoder: LeafEncoder = (value) =>
          Effect.map(encodeLeaf({ [path]: value }), (encoded) => {
            const record = encoded as Record<string, unknown>;
            return Object.hasOwn(record, path)
              ? Option.some(record[path])
              : Option.none();
          });
        leafEncoders.set(path, encoder);
        return encoder;
      });
    };

    const update = (
      id: IdSchema['Type'],
      data: Record<string, unknown>,
      updateOptions?: UpdateOptions,
    ) =>
      Effect.gen(function* () {
        const entries =
          updateOptions?.merge === true ? flattenForMerge(data) : data;
        const fields: Record<string, unknown> = { [options.idField]: id };
        const paths: Array<readonly [string, unknown, LeafEncoder]> = [];
        for (const [key, value] of Object.entries(entries)) {
          if (value === undefined) {
            return yield* Effect.fail(
              new Schema.SchemaError(
                new SchemaIssue.Pointer([key], undefinedFieldIssue),
              ),
            );
          }
          const encoder = isFieldPath(key) ? leafEncoder(key) : Option.none();
          if (Option.isSome(encoder)) {
            paths.push([key, value, encoder.value]);
          } else {
            fields[key] = value;
          }
        }

        const { [options.idField as string]: encodedId, ...payload } =
          (yield* encodeUpdateFields(fields)) as Record<string, unknown>;
        for (const [key, value, encode] of paths) {
          const encoded = yield* encode(value);
          if (Option.isSome(encoded)) {
            payload[key] = encoded.value;
          }
        }

        // Firestore rejects an empty update with a message about argument
        // shape; name the actual problem instead.
        if (Object.keys(payload).length === 0) {
          return yield* new FirestoreError({
            code: 'invalid-argument',
            name: 'FirestoreError',
            message: `${options.spanPrefix}.update: at least one field must be updated (payload was empty)`,
          });
        }

        yield* firestore.update(
          `${options.collectionPath}/${encodedId as string}`,
          payload,
        );
      }).pipe(
        Effect.withSpan(`${options.spanPrefix}.update`, {
          attributes: { id, data, merge: updateOptions?.merge ?? false },
        }),
      );

    const getByIdSchema = Fetch.findOneOption({
      Request: idSchema,
      Result: Model,
      execute: (id) =>
        firestore
          .get(`${options.collectionPath}/${id}`)
          .pipe(
            Effect.map((opt) =>
              Option.isSome(opt)
                ? ([structFromSnapshot(opt.value)] as ReadonlyArray<unknown>)
                : ([] as ReadonlyArray<unknown>),
            ),
          ),
    });

    const getById = (id: IdSchema['Type']) =>
      getByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, {
          attributes: { id },
        }),
      );

    const deleteSchema = Fetch.void({
      Request: idSchema,
      execute: (id) => firestore.delete(`${options.collectionPath}/${id}`),
    });

    const deleteById = (id: IdSchema['Type']) =>
      deleteSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.deleteById`, {
          attributes: { id },
        }),
      );

    const deleteRecursiveSchema = Fetch.void({
      Request: idSchema,
      execute: (id) =>
        firestore.deleteRecursive(`${options.collectionPath}/${id}`),
    });

    const deleteRecursiveById = (id: IdSchema['Type']) =>
      deleteRecursiveSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.deleteRecursiveById`, {
          attributes: { id },
        }),
      );

    const getByIdStreamSchema = Fetch.streamOne({
      Request: idSchema,
      Result: Model,
      execute: (id: unknown) =>
        firestore
          .streamDoc(`${options.collectionPath}/${id as string}`)
          .pipe(Stream.map(Option.map((value) => structFromSnapshot(value)))),
    });

    const getByIdStream = (id: IdSchema['Type']) =>
      getByIdStreamSchema(id).pipe(
        Stream.tap(() =>
          Effect.logTrace(`${options.spanPrefix}.streamById`, { id }),
        ),
      );

    const queries = makeQueries({
      Model,
      spanPrefix: options.spanPrefix,
      structFromSnapshot,
      query: (constraints) =>
        firestore.query(options.collectionPath, constraints),
      streamQuery: (constraints) =>
        firestore.streamQuery(options.collectionPath, constraints),
    });

    const group = makeQueries({
      Model,
      spanPrefix: `${options.spanPrefix}.group`,
      structFromSnapshot,
      query: (constraints) => firestore.queryGroup(collectionId, constraints),
      streamQuery: (constraints) =>
        firestore.streamQueryGroup(collectionId, constraints),
    });

    return {
      add,
      set,
      update: update as Repository<S, Id, IdSchema>['update'],
      getById,
      getByIdStream,
      delete: deleteById,
      deleteRecursive: deleteRecursiveById,
      ...queries,
      group,
    };
  });

/**
 * Build the four query methods over a pair of raw query/stream functions.
 * Used for both the collection-scoped methods of a {@link Repository} and
 * its {@link Repository.group} view.
 */
const makeQueries = <S extends Model.Any>(options: {
  readonly Model: S;
  readonly spanPrefix: string;
  readonly structFromSnapshot: (snapshot: Snapshot) => Record<string, unknown>;
  readonly query: (
    constraints: ReadonlyArray<QueryConstraint>,
  ) => Effect.Effect<ReadonlyArray<Snapshot>, FirestoreError | UnknownError>;
  readonly streamQuery: (
    constraints: ReadonlyArray<QueryConstraint>,
  ) => Stream.Stream<ReadonlyArray<Snapshot>, FirestoreError>;
}): RepositoryQueries<S> => {
  const { Model, spanPrefix, structFromSnapshot } = options;

  const runQuery = (constraints: ReadonlyArray<unknown>) =>
    options
      .query(constraints as ReadonlyArray<QueryConstraint>)
      .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot)));

  const runStreamQuery = (constraints: ReadonlyArray<unknown>) =>
    options
      .streamQuery(constraints as ReadonlyArray<QueryConstraint>)
      .pipe(Stream.map((snapshots) => snapshots.map(structFromSnapshot)));

  const querySchema = Fetch.findAll({
    Request: Schema.Array(Schema.Any),
    Result: Model,
    execute: runQuery,
  });

  const query = (constraints: RepositoryQuery<S>) =>
    querySchema(constraints as ReadonlyArray<unknown>).pipe(
      Effect.withSpan(`${spanPrefix}.query`, {}),
    );

  const queryStreamSchema = Fetch.streamAll({
    Request: Schema.Array(Schema.Any),
    Result: Model,
    execute: runStreamQuery,
  });

  const queryStream = (constraints: RepositoryQuery<S>) =>
    queryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
      Stream.tap(() => Effect.logTrace(`${spanPrefix}.streamQuery`)),
    );

  const getByQuerySchema = Fetch.findOneOption({
    Request: Schema.Array(Schema.Any),
    Result: Model,
    execute: runQuery,
  });

  const getByQuery = (constraints: RepositoryQuery<S>) =>
    getByQuerySchema(constraints as ReadonlyArray<unknown>).pipe(
      Effect.withSpan(`${spanPrefix}.getByQuery`, {}),
    );

  const getByQueryStreamSchema = Fetch.streamOne({
    Request: Schema.Array(Schema.Any),
    Result: Model,
    execute: (constraints: ReadonlyArray<unknown>) =>
      runStreamQuery(constraints).pipe(
        Stream.map((structs) => Arr.head(structs)),
      ),
  });

  const getByQueryStream = (constraints: RepositoryQuery<S>) =>
    getByQueryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
      Stream.tap(() => Effect.logTrace(`${spanPrefix}.getByQueryStream`)),
    );

  return { query, queryStream, getByQuery, getByQueryStream };
};
