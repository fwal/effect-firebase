import { Schema } from 'effect';

/**
 * Represents an increment operation. This will atomically increment (or
 * decrement, for a negative operand) a numeric field by the given operand.
 * Only valid in the `update` variant — use `WithIncrementField` to add
 * support to a field.
 */
export class Increment {
  constructor(public readonly operand: number) {}
}

export const IncrementInstance = Schema.instanceOf(Increment, {
  jsonSchema: {
    type: 'object',
    required: ['operand'],
    properties: { operand: { type: 'number' } },
    additionalProperties: false,
  },
});

/** Atomically increment a numeric field by the given operand. */
export const increment = (operand: number) => new Increment(operand);
