import { Array as Arr, Effect, Option, Schema, Stream, Struct } from 'effect';
import { Model } from 'effect/unstable/schema';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementError, UnknownError } from 'effect/Cause';
import { FirestoreError } from '../errors.js';
import * as Fetch from './fetch.js';
import type { QueryConstraint } from '../query/constraints.js';
import {
  isFieldPath,
  resolveFieldPath,
  type UpdateData,
} from './update-path.js';

export type { UpdateData } from './update-path.js';

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
   * whole value, so `metaData: { ... }` overwrites the entire map. Keys
   * the model does not declare fail with a `SchemaError` naming the key;
   * an empty payload fails with `FirestoreError` code `invalid-argument`.
   *
   * @param id - The ID of the document model to update.
   * @param data - The fields and field paths to update. See {@link UpdateData}.
   * @returns A unit value.
   */
  readonly update: (
    id: IdSchema['Type'],
    data: UpdateData<Omit<S['update']['Type'], Id>>,
  ) => Effect.Effect<
    void,
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['update']['EncodingServices']
  >;

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
    readonly spanPrefix: string;
  },
): Effect.Effect<Repository<S, Id, IdSchema>, never, FirestoreService> =>
  Effect.gen(function* () {
    const firestore = yield* FirestoreService;

    const idSchema = Model.fields[options.idField] as unknown as IdSchema;

    const structFromSnapshot = (snapshot: Snapshot) => {
      const [ref, data] = snapshot;
      return { ...data, [options.idField]: ref.id };
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

    // A dotted key ('metaData.deleted') names a nested field. It resolves to
    // its leaf schema in Model.update and is encoded on its own, wrapped in a
    // one-key struct so a failure still reports the offending path. A key
    // that does not resolve stays in the struct payload, where the strict
    // encoder rejects it by name. Encoders are cached per path because
    // Schema.encodeUnknownEffect compiles on construction.
    type LeafEncoder = (
      value: unknown,
    ) => Effect.Effect<unknown, Schema.SchemaError, unknown>;
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
          Effect.map(
            encodeLeaf({ [path]: value }),
            (encoded) => (encoded as Record<string, unknown>)[path],
          );
        leafEncoders.set(path, encoder);
        return encoder;
      });
    };

    const update = (
      id: IdSchema['Type'],
      data: UpdateData<Omit<S['update']['Type'], Id>>,
    ) =>
      Effect.gen(function* () {
        const fields: Record<string, unknown> = { [options.idField]: id };
        const paths: Array<readonly [string, unknown, LeafEncoder]> = [];
        for (const [key, value] of Object.entries(
          data as Record<string, unknown>,
        )) {
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
          payload[key] = yield* encode(value);
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
          attributes: { id, data },
        }),
      ) as Effect.Effect<
        void,
        ModelError,
        | S['DecodingServices']
        | S['EncodingServices']
        | S['update']['EncodingServices']
      >;

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

    const querySchema = Fetch.findAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .query(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>,
          )
          .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const query = (constraints: RepositoryQuery<S>) =>
      querySchema(constraints as ReadonlyArray<unknown>).pipe(
        Effect.withSpan(`${options.spanPrefix}.query`, {}),
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

    const queryStreamSchema = Fetch.streamAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .streamQuery(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>,
          )
          .pipe(Stream.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const queryStream = (constraints: RepositoryQuery<S>) =>
      queryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() => Effect.logTrace(`${options.spanPrefix}.streamQuery`)),
      );

    const getByQuerySchema = Fetch.findOneOption({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .query(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>,
          )
          .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const getByQuery = (constraints: RepositoryQuery<S>) =>
      getByQuerySchema(constraints as ReadonlyArray<unknown>).pipe(
        Effect.withSpan(`${options.spanPrefix}.getByQuery`, {}),
      );

    const getByQueryStreamSchema = Fetch.streamOne({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .streamQuery(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>,
          )
          .pipe(
            Stream.map((snapshots) =>
              Arr.head(snapshots.map(structFromSnapshot)),
            ),
          ),
    });

    const getByQueryStream = (constraints: RepositoryQuery<S>) =>
      getByQueryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() =>
          Effect.logTrace(`${options.spanPrefix}.getByQueryStream`),
        ),
      );

    return {
      add,
      set,
      update,
      getById,
      getByIdStream,
      delete: deleteById,
      deleteRecursive: deleteRecursiveById,
      query,
      queryStream,
      getByQuery,
      getByQueryStream,
    };
  });
