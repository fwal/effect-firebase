import { Schema, SchemaGetter } from 'effect';

/**
 * Represents an increment operation. This will atomically increment (or
 * decrement, for a negative operand) a numeric field by the given operand.
 * Only valid in the `update` variant — use `WithIncrementField` to add
 * support to a field.
 */
/** Type-level brand so `Increment` is matched nominally, not by field shape. */
export const IncrementTypeId: unique symbol = Symbol.for(
  'effect-firebase/Increment',
);
export class Increment {
  declare readonly [IncrementTypeId]: typeof IncrementTypeId;
  constructor(public readonly operand: number) {}
}

export const IncrementInstance = Schema.instanceOf(Increment, {
  representation: { id: 'effect-firebase/Increment', payload: null },
  toCodecJson: () =>
    Schema.link<Increment>()(
      Schema.Struct({
        _tag: Schema.Literal('Increment'),
        operand: Schema.Number,
      }),
      {
        decode: SchemaGetter.transform(({ operand }) => new Increment(operand)),
        encode: SchemaGetter.transform((i: Increment) => ({
          _tag: 'Increment' as const,
          operand: i.operand,
        })),
      },
    ),
});

/** Atomically increment a numeric field by the given operand. */
export const increment = (operand: number) => new Increment(operand);
