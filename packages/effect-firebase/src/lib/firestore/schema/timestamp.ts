import { DateTime, Effect, Schema, SchemaGetter, SchemaIssue } from 'effect';

// Firestore Timestamps are only valid between 0001-01-01T00:00:00Z and
// 9999-12-31T23:59:59.999Z; derived arbitraries must stay in that range.
const FIRESTORE_MIN_MILLIS = -62135596800000;
const FIRESTORE_MAX_MILLIS = 253402300799999;

/**
 * `Schema.DateTimeUtc` restricted, for arbitrary generation, to the range a
 * Firestore Timestamp can represent. Used as the decoded side of the
 * timestamp codecs so `Schema.toArbitrary` on models produces storable dates.
 */
export const DateTimeUtcArbitrary = Schema.DateTimeUtc.annotate({
  toArbitrary: () => (fc) =>
    fc
      .integer({ min: FIRESTORE_MIN_MILLIS, max: FIRESTORE_MAX_MILLIS })
      .map((millis) => DateTime.makeUnsafe(millis)),
});

/**
 * Class representing a Timestamp in Firestore.
 */
export class Timestamp extends Schema.Class<Timestamp>('Timestamp')({
  seconds: Schema.Number,
  nanoseconds: Schema.Number,
}) {
  static fromDate(date: Date): Timestamp {
    return Timestamp.fromMillis(date.getTime());
  }

  static fromMillis(millis: number): Timestamp {
    const seconds = Math.floor(millis / 1000);
    return new Timestamp({
      seconds,
      // Nanoseconds are always non-negative (matching Firestore), so the
      // seconds/nanos split roundtrips for pre-1970 instants too.
      nanoseconds: (millis - seconds * 1000) * 1000000,
    });
  }

  static fromDateTime(date: DateTime.Utc): Timestamp {
    return this.fromMillis(DateTime.toEpochMillis(date));
  }

  toDate(): Date {
    return new Date(this.seconds * 1000 + this.nanoseconds / 1000000);
  }

  toMillis(): number {
    return this.seconds * 1000 + this.nanoseconds / 1000000;
  }
}

/**
 * Schema where Timestamp class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const TimestampInstance = Schema.instanceOf(Timestamp, {
  jsonSchema: {
    type: 'object',
    required: ['seconds', 'nanoseconds'],
    properties: {
      seconds: { type: 'number' },
      nanoseconds: { type: 'number' },
    },
    additionalProperties: false,
  },
});

/**
 * Schema representing a timestamp as a DateTime.Utc.
 */
export const TimestampDateTimeUtc = TimestampInstance.pipe(
  Schema.decodeTo(DateTimeUtcArbitrary, {
    decode: SchemaGetter.transform((ts: Timestamp) =>
      DateTime.makeUnsafe(ts.toMillis()),
    ),
    encode: SchemaGetter.transform((date: DateTime.Utc) =>
      Timestamp.fromMillis(DateTime.toEpochMillis(date)),
    ),
  }),
);

/**
 * Class representing a server timestamp in Firestore.
 */
export class ServerTimestamp extends Schema.Class<ServerTimestamp>(
  'ServerTimestamp',
)({}) {}

/**
 * Schema where ServerTimestamp class instance is both Type and Encoded.
 * Using instanceOf ensures the class instance is preserved through Schema.encode.
 */
export const ServerTimestampInstance = Schema.instanceOf(ServerTimestamp, {
  jsonSchema: { type: 'object', additionalProperties: false },
});

export const AnyTimestampDateTimeUtc = Schema.Union([
  TimestampInstance,
  ServerTimestampInstance,
]).pipe(
  Schema.decodeTo(DateTimeUtcArbitrary, {
    decode: SchemaGetter.transformOrFail(
      (input: Timestamp | ServerTimestamp) => {
        if (input instanceof Timestamp) {
          return Effect.succeed(DateTime.makeUnsafe(input.toMillis()));
        }
        return Effect.fail(
          new SchemaIssue.Forbidden({
            message: 'ServerTimestamp cannot be decoded to DateTime',
          }),
        );
      },
    ),
    encode: SchemaGetter.transform((dt: DateTime.Utc) =>
      Timestamp.fromMillis(DateTime.toEpochMillis(dt)),
    ),
  }),
);
