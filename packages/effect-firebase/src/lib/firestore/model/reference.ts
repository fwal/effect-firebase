import { Schema, SchemaGetter } from 'effect';
import { Model } from 'effect/unstable/schema';
import * as FirestoreSchema from '../schema/schema.js';

/**
 * Constraint for string-based schemas (including branded strings).
 */
type StringBasedSchema = Schema.Top & { readonly Type: string };

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
export const AnyIdReference = Model.Field({
  select: FirestoreSchema.AnyReferenceId,
  insert: FirestoreSchema.AnyReferenceId,
  update: FirestoreSchema.AnyReferenceId,
  json: Schema.String,
  jsonCreate: Schema.String,
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
export const AnyPathReference = Model.Field({
  select: FirestoreSchema.AnyReferencePath,
  insert: FirestoreSchema.AnyReferencePath,
  update: FirestoreSchema.AnyReferencePath,
  json: Schema.String,
  jsonCreate: Schema.String,
  jsonUpdate: Schema.String,
});

/**
 * Create a typed reference field that stores DocumentReference in DB
 * and exposes the branded ID in the app and JSON.
 *
 * - App (Type): Branded ID string (e.g., AuthorId)
 * - DB (Encoded): DocumentReference class instance
 * - JSON: Branded ID string
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
 *   // App gets AuthorId, DB stores DocumentReference
 *   author: Model.Reference(AuthorId, 'authors'),
 * }) {}
 * ```
 */
export const Reference = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  const typedRefSchema = FirestoreSchema.ReferenceId(idSchema, collectionPath);

  return Model.Field({
    select: typedRefSchema,
    insert: typedRefSchema,
    update: typedRefSchema,
    json: idSchema,
    jsonCreate: idSchema,
    jsonUpdate: idSchema,
  });
};

/**
 * Create a reference field where the app works with DocumentReference instances.
 *
 * - App (Type): DocumentReference class instance
 * - DB (Encoded): DocumentReference class instance
 * - JSON: Branded ID string
 *
 * Use this when you need the full DocumentReference in your app layer
 * (e.g., to access both id and path).
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
 *   // App gets DocumentReference, JSON is AuthorId
 *   author: Model.ReferenceAsInstance(AuthorId, 'authors'),
 * }) {}
 *
 * // In your app:
 * const post = await postRepo.findById(postId);
 * console.log(post.author.id);   // 'author123'
 * console.log(post.author.path); // 'authors/author123'
 * ```
 */
export const ReferenceAsInstance = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  type IdType = Schema.Schema.Type<Id>;

  // DB: DocumentReference ↔ DocumentReference (passthrough)
  const dbSchema = FirestoreSchema.ReferenceInstance;

  // JSON: branded ID ↔ DocumentReference
  // Encoded = branded ID, Type = DocumentReference
  const jsonSchema = idSchema.pipe(
    Schema.decodeTo(FirestoreSchema.ReferenceInstance, {
      decode: SchemaGetter.transform((id) =>
        FirestoreSchema.Reference.makeFromPath(
          `${collectionPath}/${id as string}`
        )
      ),
      encode: SchemaGetter.transform(
        (ref) => (ref as FirestoreSchema.Reference).id as IdType
      ),
    })
  );

  return Model.Field({
    select: dbSchema,
    insert: dbSchema,
    update: dbSchema,
    json: jsonSchema,
    jsonCreate: jsonSchema,
    jsonUpdate: jsonSchema,
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
 * class PostModel extends Model.Class<PostModel>('PostModel')({
 *   id: Model.Generated(PostId),
 *   // Reference - JSON will be the full path string
 *   authorPath: Model.ReferencePath('authors'),
 * }) {}
 * ```
 */
export const ReferencePath = (collectionPath: string) => {
  const dbRefSchema = FirestoreSchema.ReferencePath(collectionPath);
  const pathSchema = Schema.String.pipe(
    Schema.check(
      Schema.makeFilter(
        (path: string) =>
          path.startsWith(`${collectionPath}/`) ||
          `Path must start with "${collectionPath}/"`
      )
    )
  );

  return Model.Field({
    select: dbRefSchema,
    insert: dbRefSchema,
    update: dbRefSchema,
    json: pathSchema,
    jsonCreate: pathSchema,
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
 *   author: Model.ReferenceOptional(AuthorId, 'authors'),
 * }) {}
 * ```
 */
export const ReferenceOptional = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) => {
  const typedRefSchema = FirestoreSchema.ReferenceId(idSchema, collectionPath);

  return Model.Field({
    select: Schema.OptionFromNullOr(typedRefSchema),
    insert: Schema.OptionFromNullOr(typedRefSchema),
    update: Schema.OptionFromNullOr(typedRefSchema),
    json: Schema.OptionFromOptional(idSchema),
    jsonCreate: Schema.OptionFromOptionalNullOr(idSchema),
    jsonUpdate: Schema.OptionFromOptionalNullOr(idSchema),
  });
};
