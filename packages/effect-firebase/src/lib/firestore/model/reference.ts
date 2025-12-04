import { Schema } from 'effect';
import { Field } from './core.js';
import * as FirestoreSchema from '../schema/schema.js';

/**
 * Constraint for string-based schemas (including branded strings).
 */
type StringBasedSchema = Schema.Schema.AnyNoContext & { readonly Type: string };

/**
 * A reference field that stores DocumentReference in DB and exposes the ID as a string in JSON.
 *
 * Use this for untyped references where you just need the ID string.
 *
 * @example
 * ```ts
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   // Untyped reference - just stores/returns the ID string
 *   authorId: Model.AnyIdReference,
 * }) {}
 * ```
 */
export const AnyIdReference = Field({
  get: FirestoreSchema.AnyDocumentReferenceId,
  add: FirestoreSchema.AnyDocumentReferenceId,
  update: FirestoreSchema.AnyDocumentReferenceId,
  json: Schema.String,
  jsonAdd: Schema.String,
  jsonUpdate: Schema.String,
});

/**
 * A reference field that stores DocumentReference in DB and exposes the path as a string in JSON.
 *
 * Use this when you need the full path for nested collections or cross-collection queries.
 *
 * @example
 * ```ts
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   // Untyped reference - stores/returns the full path
 *   authorPath: Model.AnyPathReference,
 * }) {}
 * ```
 */
export const AnyPathReference = Field({
  get: FirestoreSchema.AnyDocumentReferencePath,
  add: FirestoreSchema.AnyDocumentReferencePath,
  update: FirestoreSchema.AnyDocumentReferencePath,
  json: Schema.String,
  jsonAdd: Schema.String,
  jsonUpdate: Schema.String,
});

/**
 * Create a typed reference field that stores DocumentReference in DB
 * and exposes the branded ID in JSON.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect';
 * import { Model } from 'effect-firebase';
 *
 * const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
 *
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   id: Model.Generated(PostId),
 *   // Type-safe reference - JSON will be the branded AuthorId
 *   author: Model.Reference(AuthorId, 'authors'),
 * }) {}
 * ```
 */
export const Reference = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  const typedRefSchema = FirestoreSchema.DocumentReferenceId(
    idSchema,
    collectionPath
  );

  return Field({
    get: typedRefSchema,
    add: typedRefSchema,
    update: typedRefSchema,
    json: idSchema,
    jsonAdd: idSchema,
    jsonUpdate: idSchema,
  });
};

/**
 * Create a typed reference field that stores DocumentReference in DB
 * and exposes the full path in JSON.
 *
 * @example
 * ```ts
 * import { Schema } from 'effect';
 * import { Model } from 'effect-firebase';
 *
 * const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
 *
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   id: Model.Generated(PostId),
 *   // Reference - JSON will be the full path string
 *   author: Model.ReferencePath(AuthorId, 'authors'),
 * }) {}
 * ```
 */
export const ReferencePath = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  const typedRefSchema = FirestoreSchema.DocumentReferenceId(
    idSchema,
    collectionPath
  );
  const pathSchema = Schema.String.pipe(
    Schema.filter((path) => path.startsWith(`${collectionPath}/`), {
      message: () => `Path must start with "${collectionPath}/"`,
    })
  );

  return Field({
    get: typedRefSchema,
    add: typedRefSchema,
    update: typedRefSchema,
    json: pathSchema,
    jsonAdd: pathSchema,
    jsonUpdate: pathSchema,
  });
};

/**
 * Create an optional typed reference field that stores DocumentReference in DB
 * and exposes the branded ID in JSON.
 *
 * @example
 * ```ts
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   // Optional author reference
 *   author: Model.TypedReferenceAsIdOptional(AuthorId, 'authors'),
 * }) {}
 * ```
 */
export const TypedReferenceAsIdOptional = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  const typedRefSchema = FirestoreSchema.DocumentReferenceId(
    idSchema,
    collectionPath
  );

  return Field({
    get: Schema.OptionFromNullOr(typedRefSchema),
    add: Schema.OptionFromNullOr(typedRefSchema),
    update: Schema.OptionFromNullOr(typedRefSchema),
    json: Schema.optionalWith(idSchema, { as: 'Option' }),
    jsonAdd: Schema.optionalWith(idSchema, { as: 'Option', nullable: true }),
    jsonUpdate: Schema.optionalWith(idSchema, { as: 'Option', nullable: true }),
  });
};
