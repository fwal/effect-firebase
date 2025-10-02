import { Effect, Console, Layer } from 'effect';
import { Schema } from 'effect';
import {
  DateFromFirestoreTimestamp,
  SimpleDateFromFirestore,
  FirestoreService,
} from 'effect-firebase';

// Example usage of DateFromFirestoreTimestamp with FirestoreService context

// Mock FirestoreService implementation for demonstration
const MockFirestoreService = Layer.succeed(FirestoreService, {
  get: (path: string) =>
    Effect.succeed({
      // Mock firestore instance with Timestamp constructor
      constructor: {
        Timestamp: {
          fromDate: (date: Date) => ({
            seconds: Math.floor(date.getTime() / 1000),
            nanoseconds: (date.getTime() % 1000) * 1000000,
            toDate: () => date,
          }),
        },
      },
    }),
});

// Example 1: Using DateFromFirestoreTimestamp with FirestoreService context
const example1 = Effect.gen(function* () {
  yield* Console.log(
    '=== DateFromFirestoreTimestamp with FirestoreService Example ==='
  );

  // Mock Firestore Timestamp object (like what you'd get from Firestore)
  const mockTimestamp = {
    seconds: 1705314600,
    nanoseconds: 123456789,
    toDate: () => new Date(1705314600 * 1000 + Math.floor(123456789 / 1000000)),
  };

  // Decoding: Firestore Timestamp -> Date (requires FirestoreService context)
  const decoded = yield* Schema.decodeUnknown(DateFromFirestoreTimestamp)(
    mockTimestamp
  );
  yield* Console.log('Decoded Firestore Timestamp to Date:', decoded);

  // Encoding: Date -> Firestore Timestamp (requires FirestoreService context)
  const encoded = yield* Schema.encodeUnknown(DateFromFirestoreTimestamp)(
    new Date('2024-01-15T10:30:00.000Z')
  );
  yield* Console.log('Encoded Date to Firestore Timestamp:', encoded);
});

// Example 2: Using SimpleDateFromFirestore (no context required)
const example2 = Effect.gen(function* () {
  yield* Console.log('\n=== SimpleDateFromFirestore Example ===');

  // Decoding from serialized Firestore Timestamp
  const serializedTimestamp = { seconds: 1705314600, nanoseconds: 123456789 };
  const decodedFromSerialized = yield* Schema.decodeUnknown(
    SimpleDateFromFirestore
  )(serializedTimestamp);
  yield* Console.log(
    'Decoded serialized timestamp to Date:',
    decodedFromSerialized
  );

  // Decoding from ISO string
  const decodedFromString = yield* Schema.decodeUnknown(
    SimpleDateFromFirestore
  )('2024-01-15T10:30:00.000Z');
  yield* Console.log('Decoded ISO string to Date:', decodedFromString);

  // Decoding from Unix timestamp
  const decodedFromNumber = yield* Schema.decodeUnknown(
    SimpleDateFromFirestore
  )(1705314600000);
  yield* Console.log('Decoded Unix timestamp to Date:', decodedFromNumber);

  // Encoding: Date -> serialized Firestore Timestamp
  const encoded = yield* Schema.encodeUnknown(SimpleDateFromFirestore)(
    new Date('2024-01-15T10:30:00.000Z')
  );
  yield* Console.log('Encoded Date to serialized timestamp:', encoded);
});

// Example 3: Using the schema in a struct
const UserSchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  createdAt: DateFromFirestoreTimestamp, // Requires FirestoreService
  updatedAt: SimpleDateFromFirestore, // No context required
});

const example3 = Effect.gen(function* () {
  yield* Console.log('\n=== Using Date Schemas in Struct Example ===');

  const userData = {
    id: 'user123',
    name: 'John Doe',
    createdAt: {
      seconds: 1705314600,
      nanoseconds: 123456789,
      toDate: () =>
        new Date(1705314600 * 1000 + Math.floor(123456789 / 1000000)),
    },
    updatedAt: { seconds: 1705314700, nanoseconds: 0 },
  };

  const decoded = yield* Schema.decodeUnknown(UserSchema)(userData);
  yield* Console.log('Decoded user data:', decoded);
  yield* Console.log('createdAt is Date:', decoded.createdAt instanceof Date);
  yield* Console.log('updatedAt is Date:', decoded.updatedAt instanceof Date);
});

// Example 4: Error handling
const example4 = Effect.gen(function* () {
  yield* Console.log('\n=== Error Handling Example ===');

  // This will fail gracefully
  const result = yield* Schema.decodeUnknown(SimpleDateFromFirestore)(
    'invalid-date'
  ).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Console.log('Parse error caught:', error.message);
        return new Date(); // fallback value
      })
    )
  );

  yield* Console.log('Result after error handling:', result);
});

// Main program that provides the FirestoreService context
const main = Effect.gen(function* () {
  yield* example1; // Requires FirestoreService context
  yield* example2; // No context required
  yield* example3; // Requires FirestoreService context (for createdAt field)
  yield* example4; // No context required
}).pipe(
  // Provide the FirestoreService layer for schemas that need it
  Effect.provide(MockFirestoreService),
  Effect.catchAll((error) => Console.log('Error:', error))
);

// Export the main program
export { main };

// Usage notes:
console.log(`
Usage Notes:

1. DateFromFirestoreTimestamp:
   - Requires FirestoreService in the context
   - Handles both native Timestamp objects and serialized formats
   - Use when working with actual Firestore SDK Timestamp objects
   - Provides the FirestoreService layer when running the effect

2. SimpleDateFromFirestore:
   - No context requirements
   - Works with serialized timestamps, ISO strings, and Unix timestamps
   - Use for simple conversions without SDK dependencies
   - Good for JSON serialization/deserialization

3. In practice, provide the appropriate FirestoreService layer:
   - For client apps: use the client FirestoreService layer
   - For admin/server apps: use the admin FirestoreService layer
`);

// Uncomment to run:
// Effect.runPromise(main)
