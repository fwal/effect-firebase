import { Array as Arr, Effect, Option, Schema, Stream, Struct } from 'effect';
import { Model } from 'effect/unstable/schema';
import { FirestoreService } from '../firestore-service.js';
import { Snapshot } from '../snapshot.js';
import { NoSuchElementError, UnknownError } from 'effect/Cause';
import { FirestoreError } from '../errors.js';
import * as Fetch from './fetch.js';
import type { QueryConstraint } from '../query/constraints.js';

export type ModelError =
  | FirestoreError
  | UnknownError
  | NoSuchElementError
  | Schema.SchemaError;

export type RepositoryQuery<S> = ReadonlyArray<QueryConstraint> & {
  readonly _schema?: S;
};

export type Repository<
  S extends Model.Any,
  Id extends keyof S['Type'] & keyof S['fields'],
  IdSchema extends S['fields'][Id] extends Schema.String
    ? S['fields'][Id]
    : never
> = {
  /**
   * Add a document model.
   * @param data - The data to add the document model with.
   * @returns The ID of the added document model.
   */
  readonly add: (
    data: S['insert']['Type']
  ) => Effect.Effect<
    IdSchema['Type'],
    ModelError,
    | S['DecodingServices']
    | S['EncodingServices']
    | S['insert']['EncodingServices']
  >;

  /**
   * Update a document model.
   * @param id - The ID of the document model to update.
   * @param data - The partial data to update the document model with. All fields are optional.
   * @returns A unit value.
   */
  readonly update: (
    id: IdSchema['Type'],
    data: Partial<Omit<S['update']['Type'], Id>>
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
    id: IdSchema['Type']
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
    id: IdSchema['Type']
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
    id: IdSchema['Type']
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
    id: IdSchema['Type']
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
    constraints: RepositoryQuery<S>
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
    constraints: RepositoryQuery<S>
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
    constraints: RepositoryQuery<S>
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
    constraints: RepositoryQuery<S>
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
 * import { Model } from 'effect-firebase';
 * import { PostModel } from './post.js';
 *
 * const PostRepository = Model.makeRepository(PostModel, {
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
  IdSchema extends S['fields'][Id] extends Schema.String
    ? S['fields'][Id]
    : never
>(
  Model: S,
  options: {
    readonly collectionPath: string;
    readonly idField: Id;
    readonly spanPrefix: string;
  }
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
        })
      );

    // Create schema for update: required id + partial data fields (all optional)
    const PartialDataSchema = (
      Model.update as Schema.Struct<Schema.Struct.Fields>
    )
      .mapFields(Struct.omit([options.idField as string]))
      .mapFields(Struct.map(Schema.optional));

    const updateFieldsSchema = Schema.Struct({
      [options.idField]: idSchema,
    }).pipe(Schema.fieldsAssign(PartialDataSchema.fields));

    const updateSchema = Fetch.void({
      Request: updateFieldsSchema,
      execute: (input: unknown) => {
        const record = input as Record<string, unknown>;
        const { [options.idField as string]: id, ...data } = record;
        return firestore.update(
          `${options.collectionPath}/${id as string}`,
          data
        );
      },
    });

    const update = (
      id: IdSchema['Type'],
      data: Partial<Omit<S['update']['Type'], Id>>
    ) =>
      updateSchema({
        [options.idField]: id,
        ...data,
      } as Parameters<typeof updateSchema>[0]).pipe(
        Effect.withSpan(`${options.spanPrefix}.update`, {
          attributes: { id, data },
        })
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
                : ([] as ReadonlyArray<unknown>)
            )
          ),
    });

    const getById = (id: IdSchema['Type']) =>
      getByIdSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.findById`, {
          attributes: { id },
        })
      );

    const deleteSchema = Fetch.void({
      Request: idSchema,
      execute: (id) => firestore.delete(`${options.collectionPath}/${id}`),
    });

    const deleteById = (id: IdSchema['Type']) =>
      deleteSchema(id).pipe(
        Effect.withSpan(`${options.spanPrefix}.deleteById`, {
          attributes: { id },
        })
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
        })
      );

    const querySchema = Fetch.findAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .query(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const query = (constraints: RepositoryQuery<S>) =>
      querySchema(constraints as ReadonlyArray<unknown>).pipe(
        Effect.withSpan(`${options.spanPrefix}.query`, {})
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
          Effect.logTrace(`${options.spanPrefix}.streamById`, { id })
        )
      );

    const queryStreamSchema = Fetch.streamAll({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .streamQuery(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(Stream.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const queryStream = (constraints: RepositoryQuery<S>) =>
      queryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() => Effect.logTrace(`${options.spanPrefix}.streamQuery`))
      );

    const getByQuerySchema = Fetch.findOneOption({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .query(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(Effect.map((snapshots) => snapshots.map(structFromSnapshot))),
    });

    const getByQuery = (constraints: RepositoryQuery<S>) =>
      getByQuerySchema(constraints as ReadonlyArray<unknown>).pipe(
        Effect.withSpan(`${options.spanPrefix}.getByQuery`, {})
      );

    const getByQueryStreamSchema = Fetch.streamOne({
      Request: Schema.Array(Schema.Any),
      Result: Model,
      execute: (constraints: ReadonlyArray<unknown>) =>
        firestore
          .streamQuery(
            options.collectionPath,
            constraints as ReadonlyArray<QueryConstraint>
          )
          .pipe(
            Stream.map((snapshots) =>
              Arr.head(snapshots.map(structFromSnapshot))
            )
          ),
    });

    const getByQueryStream = (constraints: RepositoryQuery<S>) =>
      getByQueryStreamSchema(constraints as ReadonlyArray<unknown>).pipe(
        Stream.tap(() =>
          Effect.logTrace(`${options.spanPrefix}.getByQueryStream`)
        )
      );

    return {
      add,
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
