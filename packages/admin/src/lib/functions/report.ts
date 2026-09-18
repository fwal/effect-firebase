import { ErrorReporter } from 'effect';
import { HttpsError } from 'firebase-functions/https';

/**
 * @internal Not part of the package's public API.
 *
 * Whether an error that escaped a function is an expected rejection rather
 * than a defect, and so should not be logged as one.
 *
 * Effect's convention is to annotate expected errors with
 * `ErrorReporter.ignore` — the built-in `HttpApiError.BadRequest` and friends
 * do exactly this — so any error carrying that annotation is honoured here,
 * including your own:
 *
 * @example
 * ```ts
 * import { Data, ErrorReporter } from 'effect';
 *
 * class RejectedError extends Data.TaggedError('RejectedError')<{
 *   readonly reason: string;
 * }> {
 *   readonly [ErrorReporter.ignore] = true;
 * }
 * ```
 *
 * `HttpsError` is treated the same way without the annotation: it is how a
 * callable deliberately rejects a request, but it comes from
 * `firebase-functions` and so cannot declare that about itself.
 */
export const isExpectedRejection = (error: unknown): boolean =>
  ErrorReporter.isIgnored(error) || error instanceof HttpsError;
