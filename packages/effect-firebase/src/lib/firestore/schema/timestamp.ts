import {
  DateTime,
  Effect,
  Option,
  Schema,
  SchemaGetter,
  SchemaIssue,
} from 'effect';

/**
 * Class representing a Timestamp in Firestore.
 */
export class Timestamp extends Schema.Class<Timestamp>('Timestamp')({
  seconds: Schema.Number,
  nanoseconds: Schema.Number,
}) {
  static fromDate(date: Date): Timestamp {
    return new Timestamp({
      seconds: Math.floor(date.getTime() / 1000),
      nanoseconds: (date.getTime() % 1000) * 1000000,
    });
  }

  static fromMillis(millis: number): Timestamp {
    return new Timestamp({
      seconds: Math.floor(millis / 1000),
      nanoseconds: (millis % 1000) * 1000000,
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
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transform((ts: Timestamp) =>
      DateTime.makeUnsafe(ts.toMillis())
    ),
    encode: SchemaGetter.transform((date: DateTime.Utc) =>
      Timestamp.fromMillis(DateTime.toEpochMillis(date))
    ),
  })
);

/**
 * Class representing a server timestamp in Firestore.
 */
export class ServerTimestamp extends Schema.Class<ServerTimestamp>(
  'ServerTimestamp'
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
  Schema.decodeTo(Schema.DateTimeUtc, {
    decode: SchemaGetter.transformOrFail(
      (input: Timestamp | ServerTimestamp) => {
        if (input instanceof Timestamp) {
          return Effect.succeed(DateTime.makeUnsafe(input.toMillis()));
        }
        return Effect.fail(
          new SchemaIssue.Forbidden(Option.some(input), {
            message: 'ServerTimestamp cannot be decoded to DateTime',
          })
        );
      }
    ),
    encode: SchemaGetter.transform((dt: DateTime.Utc) =>
      Timestamp.fromMillis(DateTime.toEpochMillis(dt))
    ),
  })
);
