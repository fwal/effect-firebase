import { ParseResult, Schema } from 'effect';

const isPathValid = (path: string) => {
  const parts = path.split('/').filter(Boolean);
  return parts.length > 0 && parts.length % 2 === 0;
};

/**
 * Class representing a DocumentReference in Firestore.
 */
export class Reference extends Schema.Class<Reference>('Reference')(
  Schema.Struct({
    id: Schema.String,
    path: Schema.String,
    parent: Schema.optional(
      Schema.suspend((): Schema.Schema<Reference> => Reference)
    ),
  }).pipe(
    Schema.filter(
      ({ path }) =>
        isPathValid(path) ||
        'Path must not be empty and must contain an even number of parts'
    ),
    Schema.filter(
      ({ id, path }) =>
        id === (path.split('/').pop() ?? '') ||
        'Id must match the last part of the path'
    )
  )
) {
  static makeFromPath(path: string): Reference {
    const parts = path.split('/').filter(Boolean);

    if (!isPathValid(path)) {
      throw new ParseResult.Type(
        Schema.String.ast,
        path,
        'Path must not be empty and must contain an even number of parts'
      );
    }

    const parentParts = parts.slice(0, -2);
    const parent =
      parentParts.length > 0
        ? Reference.makeFromPath(parentParts.join('/'))
        : undefined;

    const id = parts.pop() ?? '';
    return Reference.make({ id, path, parent });
  }
}

/**
 * Schema where Reference class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const ReferenceInstance = Schema.instanceOf(Reference);

/**
 * Schema that transforms Reference to just its ID string.
 * Uses instanceOf to preserve class instance during encoding.
 */
export const AnyReferenceId = Schema.transformOrFail(
  ReferenceInstance,
  Schema.String,
  {
    strict: true,
    decode: (ref) => ParseResult.succeed(ref.id),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(
          ast,
          input,
          'Id string cannot be encoded to Reference'
        )
      ),
  }
);

/**
 * Schema that transforms Reference to just its path string.
 * Uses instanceOf to preserve class instance during encoding.
 */
export const AnyReferencePath = Schema.transform(
  ReferenceInstance,
  Schema.String,
  {
    strict: true,
    decode: (ref) => ref.path,
    encode: (path) => Reference.makeFromPath(path),
  }
);

/**
 * Constraint for string-based schemas (including branded strings).
 */
type StringBasedSchema = Schema.Schema.AnyNoContext & { readonly Type: string };

/**
 * Create a typed reference schema that transforms to a branded ID.
 * Use this when you want the representation to be just the typed ID.
 *
 * Uses Schema.instanceOf to ensure Reference class instances are
 * preserved through Schema.encode (not converted to plain objects).
 *
 * @example
 * ```ts
 * const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
 * const AuthorRef = ReferenceId(AuthorId, 'authors');
 * // DB: Reference (class instance), App: AuthorId (branded string)
 * ```
 */
export const ReferenceId = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) =>
  Schema.compose(
    // Step 1: Reference instance <-> string (extract/reconstruct id)
    // Using instanceOf ensures the Encoded is a class instance, not a plain object
    Schema.transform(ReferenceInstance, Schema.String, {
      strict: true,
      decode: (ref) => ref.id,
      encode: (id) => Reference.makeFromPath(`${collectionPath}/${id}`),
    }),
    // Step 2: string <-> BrandedId (apply branding)
    idSchema
  ).annotations({
    identifier: `TypedReferenceId<${collectionPath}>`,
  });

/**
 * Create a typed reference schema that transforms to a path string.
 * Use this when you want the representation to include the full path.
 *
 * Uses Schema.instanceOf to ensure Reference class instances are
 * preserved through Schema.encode.
 */
export const ReferencePath = (collectionPath: string) => {
  const pathSchema = Schema.String.pipe(
    Schema.filter((path) => path.startsWith(`${collectionPath}/`), {
      message: () => `Path must start with "${collectionPath}/"`,
    })
  );

  return Schema.transform(ReferenceInstance, pathSchema, {
    strict: true,
    decode: (ref) => ref.path,
    encode: (path) => Reference.makeFromPath(path),
  }).annotations({
    identifier: `TypedReferencePath<${collectionPath}>`,
  });
};
