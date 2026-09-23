import {
  DateTime,
  Effect,
  Schema,
  SchemaGetter,
  SchemaIssue,
  SchemaTransformation,
} from 'effect';

/**
 * Class representing a Timestamp in Firestore.
 */
/** Type-level brand so `Timestamp` is matched nominally, not by field shape. */
export const TimestampTypeId: unique symbol = Symbol.for(
  'effect-firebase/Timestamp',
);
export class Timestamp extends Schema.Class<Timestamp>('Timestamp')({
  seconds: Schema.Number,
  nanoseconds: Schema.Number,
}) {
  declare readonly [TimestampTypeId]: typeof TimestampTypeId;
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
  representation: { id: 'effect-firebase/Timestamp', payload: null },
  toCodecJson: () =>
    Schema.link<Timestamp>()(
      Schema.Struct({ seconds: Schema.Number, nanoseconds: Schema.Number }),
      {
        decode: SchemaGetter.transform(
          ({ seconds, nanoseconds }) => new Timestamp({ seconds, nanoseconds }),
        ),
        encode: SchemaGetter.transform((ts: Timestamp) => ({
          seconds: ts.seconds,
          nanoseconds: ts.nanoseconds,
        })),
      },
    ),
});

/**
 * Schema representing a timestamp as a DateTime.Utc.
 */
export const TimestampDateTimeUtc = TimestampInstance.pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
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
  representation: { id: 'effect-firebase/ServerTimestamp', payload: null },
  toCodecJson: () =>
    Schema.link<ServerTimestamp>()(
      Schema.Struct({ _tag: Schema.Literal('ServerTimestamp') }),
      {
        decode: SchemaGetter.transform(() => new ServerTimestamp()),
        encode: SchemaGetter.transform(() => ({
          _tag: 'ServerTimestamp' as const,
        })),
      },
    ),
});

export const AnyTimestampDateTimeUtc = Schema.Union([
  TimestampInstance,
  ServerTimestampInstance,
]).pipe(
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transformEffect(
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

/**
 * JSON-side schema for date-time fields: an ISO 8601 UTC string decoded to
 * `DateTime.Utc`.
 *
 * Unlike `Schema.DateTimeUtcFromString`, the `format`/`description`
 * annotations live on the encoded `String` side, so they survive
 * `Schema.toJsonSchemaDocument` (which lowers to the encoded side and drops
 * annotations placed on the `DateTime.Utc` declaration). To customise the
 * description, annotate the encoded side too:
 * `Schema.String.annotate({ description }).pipe(Schema.decodeTo(Schema.DateTimeUtc, SchemaTransformation.dateTimeUtcFromString))`.
 */
export const DateTimeUtcFromString = Schema.String.annotate({
  format: 'date-time',
  description: 'ISO 8601 UTC date-time',
  expected: 'a string that will be decoded as a DateTime.Utc',
}).pipe(
  Schema.decodeTo(
    Schema.DateTimeUtc,
    SchemaTransformation.dateTimeUtcFromString,
  ),
);
