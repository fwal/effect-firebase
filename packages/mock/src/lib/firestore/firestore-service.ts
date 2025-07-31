import { Effect, Layer } from 'effect';
import { FirestoreService } from '@effect-firebase/core';
import { vi } from 'vitest';

export const layer = () =>
  Layer.succeed(FirestoreService, {
    get: (path: string) => {
      return Effect.succeed(vi.fn());
    },
  });
