import { ParseResult, Schema } from 'effect';

/**
 * Class representing a Reference in Firestore.
 */
export class DocumentReference extends Schema.Class<DocumentReference>(
  'DocumentReference'
)({
  id: Schema.String,
  path: Schema.String,
}) {}

/**
 * Schema that transforms DocumentReference to just its ID string.
 */
export const AnyDocumentReferenceId = Schema.transformOrFail(
  DocumentReference,
  Schema.String,
  {
    strict: true,
    decode: (ref) => ParseResult.succeed(ref.id),
    encode: (input, _, ast) =>
      ParseResult.fail(
        new ParseResult.Forbidden(
          ast,
          input,
          'Id string cannot be encoded to DocumentReference'
        )
      ),
  }
);

/**
 * Schema that transforms DocumentReference to just its path string.
 */
export const AnyDocumentReferencePath = Schema.transform(
  DocumentReference,
  Schema.String,
  {
    strict: true,
    decode: (ref) => ref.path,
    encode: (path) =>
      new DocumentReference({
        id: path.split('/').pop() ?? '',
        path,
      }),
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
 * @example
 * ```ts
 * const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'));
 * const AuthorRef = DocumentReferenceId(AuthorId, 'authors');
 * // DB: DocumentReference, App: AuthorId (branded string)
 * ```
 */
export const DocumentReferenceId = <Id extends StringBasedSchema>(
  idSchema: Id,
  collectionPath: string
) =>
  Schema.compose(
    // Step 1: DocumentReference <-> string (extract/reconstruct id)
    Schema.transform(DocumentReference, Schema.String, {
      strict: true,
      decode: (ref) => ref.id,
      encode: (id) =>
        new DocumentReference({ id, path: `${collectionPath}/${id}` }),
    }),
    // Step 2: string <-> BrandedId (apply branding)
    idSchema
  ).annotations({
    identifier: `TypedReferenceId<${collectionPath}>`,
  });

/**
 * Create a typed reference schema that transforms to a path string.
 * Use this when you want the representation to include the full path.
 */
export const DocumentReferencePath = (collectionPath: string) => {
  const pathSchema = Schema.String.pipe(
    Schema.filter((path) => path.startsWith(`${collectionPath}/`), {
      message: () => `Path must start with "${collectionPath}/"`,
    })
  );

  return Schema.transform(DocumentReference, pathSchema, {
    strict: true,
    decode: (ref) => ref.path,
    encode: (path) =>
      new DocumentReference({
        id: path.split('/').pop() ?? '',
        path,
      }),
  }).annotations({
    identifier: `TypedReferencePath<${collectionPath}>`,
  });
};
