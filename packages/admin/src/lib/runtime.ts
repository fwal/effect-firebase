import { Layer, ManagedRuntime } from 'effect';

export function makeRuntime<R, E>(layer: Layer.Layer<R, E, never>) {
  return ManagedRuntime.make(layer);
}
