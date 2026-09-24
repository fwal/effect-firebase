import { Effect, Schema } from 'effect';
import {
  onDocumentDeleted,
  onDocumentDeletedWithAuthContext,
  DocumentOptions,
  FirestoreEvent,
  FirestoreAuthEvent,
  QueryDocumentSnapshot,
} from 'firebase-functions/v2/firestore';
import { CloudFunction } from 'firebase-functions/v2';
import { ParamsOf } from 'firebase-functions';
import { run, Runtime } from './run.js';
import { logger } from 'firebase-functions';
import { decodeDocumentData } from './decode-document-data.js';
import { FunctionSetupError } from './setup-error.js';
import { recoverSetupError } from './recover-setup-error.js';
import { isExpectedRejection } from './report.js';

interface DocumentDeletedEffectOptions<
  R,
  Document extends string,
  S extends Schema.Top = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never,
> extends DocumentOptions<Document> {
  runtime: Runtime<R | S['DecodingServices']>;
  schema?: S;
  idField?: IdField;
  /**
   * Recover from errors raised during function setup (document data not
   * matching the schema). Use this to e.g. ignore or quarantine malformed
   * documents instead of treating them as defects.
   *
   * When omitted, the setup error is treated as a defect and logged.
   */
  onSetupError?: (
    error: FunctionSetupError,
    event: FirestoreEvent<
      QueryDocumentSnapshot | undefined,
      ParamsOf<Document>
    >,
  ) => Effect.Effect<void, never, R>;
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is deleted.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentDeletedEffect<
  R,
  Document extends string,
  S extends Schema.Top = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never,
>(
  options: DocumentDeletedEffectOptions<R, Document, S, IdField>,
  handler: (
    data: Schema.Schema.Type<S>,
    event: FirestoreEvent<
      QueryDocumentSnapshot | undefined,
      ParamsOf<Document>
    >,
  ) => Effect.Effect<void, never, R>,
): CloudFunction<
  FirestoreEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentDeleted(options, async (event) => {
    const effect = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        document: event.data?.ref.path ?? 'unknown',
      });
      // Recovery covers decoding only; a handler failure stays its own error.
      return yield* decodeDocumentData(
        event.data?.data(),
        event.data?.id,
        schema,
        options.idField,
      ).pipe(
        Effect.matchEffect({
          onFailure: (error) => recoverSetupError(options, error, event),
          onSuccess: (data) => handler(data as Schema.Schema.Type<S>, event),
        }),
      );
    }).pipe(Effect.withSpan('onDocumentDeletedEffect'));

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | S['DecodingServices']>,
    ).catch((error) => {
      // Expected rejections (an HttpsError, or any error annotated with
      // ErrorReporter.ignore) are not logged as defects.
      if (!isExpectedRejection(error)) {
        logger.error('Defect in onDocumentDeleted', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });
  });
}

/**
 * Create a Firebase Functions Firestore trigger that runs an effect when a document is deleted,
 * with authentication context.
 * @param options - The options for the Firestore trigger, including the document path, runtime, and optional schema.
 * @param handler - The handler function that runs the effect with typed document data.
 * @returns The Firebase Functions Firestore trigger.
 */
export function onDocumentDeletedWithAuthContextEffect<
  R,
  Document extends string,
  S extends Schema.Top = Schema.Schema<unknown>,
  IdField extends keyof Schema.Schema.Type<S> & string = never,
>(
  options: DocumentDeletedEffectOptions<R, Document, S, IdField>,
  handler: (
    event: FirestoreAuthEvent<
      QueryDocumentSnapshot | undefined,
      ParamsOf<Document>
    >,
    data: Schema.Schema.Type<S>,
  ) => Effect.Effect<void, never, R>,
): CloudFunction<
  FirestoreAuthEvent<QueryDocumentSnapshot | undefined, ParamsOf<Document>>
> {
  const schema = options.schema ?? Schema.Unknown;

  return onDocumentDeletedWithAuthContext(options, async (event) => {
    const effect = Effect.gen(function* () {
      yield* Effect.annotateCurrentSpan({
        document: event.data?.ref.path ?? 'unknown',
      });
      // Recovery covers decoding only; a handler failure stays its own error.
      return yield* decodeDocumentData(
        event.data?.data(),
        event.data?.id,
        schema,
        options.idField,
      ).pipe(
        Effect.matchEffect({
          onFailure: (error) => recoverSetupError(options, error, event),
          onSuccess: (data) => handler(event, data as Schema.Schema.Type<S>),
        }),
      );
    }).pipe(Effect.withSpan('onDocumentDeletedWithAuthContextEffect'));

    await run(
      options.runtime,
      effect as Effect.Effect<void, never, R | S['DecodingServices']>,
    ).catch((error) => {
      // Expected rejections (an HttpsError, or any error annotated with
      // ErrorReporter.ignore) are not logged as defects.
      if (!isExpectedRejection(error)) {
        logger.error('Defect in onDocumentDeletedWithAuthContext', {
          inner: error,
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    });
  });
}
