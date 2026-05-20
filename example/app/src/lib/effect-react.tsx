import { Cause, Effect, Fiber, Layer, ManagedRuntime, Stream } from 'effect';
import * as React from 'react';

export type Result<A, E> =
  | { readonly _tag: 'Initial' }
  | { readonly _tag: 'Success'; readonly value: A }
  | { readonly _tag: 'Failure'; readonly error: E };

const RuntimeContext = React.createContext<ManagedRuntime.ManagedRuntime<
  unknown,
  unknown
> | null>(null);

export interface RuntimeProviderProps<R, E> {
  readonly layer: Layer.Layer<R, E, never>;
  readonly children: React.ReactNode;
}

export function RuntimeProvider<R, E>({
  layer,
  children,
}: RuntimeProviderProps<R, E>) {
  const runtime = React.useMemo(() => ManagedRuntime.make(layer), [layer]);
  React.useEffect(() => () => void runtime.dispose(), [runtime]);
  return (
    <RuntimeContext.Provider
      value={runtime as ManagedRuntime.ManagedRuntime<unknown, unknown>}
    >
      {children}
    </RuntimeContext.Provider>
  );
}

export function useRuntime<R = never>(): ManagedRuntime.ManagedRuntime<
  R,
  never
> {
  const r = React.useContext(RuntimeContext);
  if (!r) throw new Error('useRuntime: must be used inside <RuntimeProvider>');
  return r as ManagedRuntime.ManagedRuntime<R, never>;
}

export function useEffectQuery<A, E, R>(
  make: () => Effect.Effect<A, E, R>,
  deps: React.DependencyList,
): Result<A, E> & { readonly refetch: () => void } {
  const runtime = useRuntime<R>();
  const [tick, setTick] = React.useState(0);
  const [state, setState] = React.useState<Result<A, E>>({ _tag: 'Initial' });

  React.useEffect(() => {
    setState({ _tag: 'Initial' });
    const fiber = runtime.runFork(make());
    fiber.addObserver((exit) => {
      if (exit._tag === 'Success') {
        setState({ _tag: 'Success', value: exit.value });
        return;
      }
      if (Cause.hasInterruptsOnly(exit.cause)) return;
      const failure = Cause.findErrorOption(exit.cause);
      if (failure._tag === 'Some') {
        setState({ _tag: 'Failure', error: failure.value });
      } else {
        // Defect — log; typed E is not available for a defect-only cause
        console.error('useEffectQuery defect:', Cause.squash(exit.cause));
      }
    });
    return () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, tick, ...deps]);

  const refetch = React.useCallback(() => setTick((t) => t + 1), []);
  return { ...state, refetch };
}

export function useEffectStream<A, E, R>(
  make: () => Stream.Stream<A, E, R>,
  deps: React.DependencyList,
): Result<A, E> {
  const runtime = useRuntime<R>();
  const [state, setState] = React.useState<Result<A, E>>({ _tag: 'Initial' });

  React.useEffect(() => {
    setState({ _tag: 'Initial' });
    const program = Stream.runForEach(make(), (a) =>
      Effect.sync(() => setState({ _tag: 'Success', value: a })),
    );
    const fiber = runtime.runFork(program);
    fiber.addObserver((exit) => {
      if (exit._tag === 'Success') return;
      if (Cause.hasInterruptsOnly(exit.cause)) return;
      const failure = Cause.findErrorOption(exit.cause);
      if (failure._tag === 'Some') {
        setState({ _tag: 'Failure', error: failure.value });
      } else {
        console.error('useEffectStream defect:', Cause.squash(exit.cause));
      }
    });
    return () => {
      runtime.runFork(Fiber.interrupt(fiber));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtime, ...deps]);

  return state;
}

export interface UseEffectMutation<A, E, Args extends readonly unknown[]> {
  readonly mutate: (...args: Args) => Promise<A>;
  readonly state: Result<A, E>;
  readonly reset: () => void;
}

export function useEffectMutation<A, E, R, Args extends readonly unknown[]>(
  make: (...args: Args) => Effect.Effect<A, E, R>,
): UseEffectMutation<A, E, Args> {
  const runtime = useRuntime<R>();
  const makeRef = React.useRef(make);
  React.useEffect(() => {
    makeRef.current = make;
  });
  const mountedRef = React.useRef(true);
  React.useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const [state, setState] = React.useState<Result<A, E>>({ _tag: 'Initial' });

  const mutate = React.useCallback(
    (...args: Args) =>
      runtime
        .runPromise(makeRef.current(...args))
        .then((value) => {
          if (mountedRef.current) setState({ _tag: 'Success', value });
          return value;
        })
        .catch((error: E) => {
          if (mountedRef.current) setState({ _tag: 'Failure', error });
          throw error;
        }),
    [runtime],
  );

  const reset = React.useCallback(() => setState({ _tag: 'Initial' }), []);

  return { mutate, state, reset };
}
