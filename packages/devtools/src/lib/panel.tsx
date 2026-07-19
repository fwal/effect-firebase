import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { Duration, Effect, Fiber, Stream } from 'effect';
import {
  MockState,
  type MockControllerShape,
  type StoreSnapshot,
} from '@effect-firebase/mock';

export interface MockDevtoolsPanelProps {
  /**
   * The controller of the mock backend, from `make()` in
   * `@effect-firebase/mock`.
   */
  readonly controller: MockControllerShape;
  /**
   * Extra collection paths to always show, even before any document or
   * state exists for them.
   */
  readonly collections?: ReadonlyArray<string>;
  /**
   * Called after a state toggle has been applied. Use this to re-subscribe
   * consumers that terminated on a simulated error — e.g. refresh the atoms
   * or queries reading from the collection.
   */
  readonly onStateChange?: (
    collectionPath: string,
    state: MockState.State
  ) => void;
}

type StateName = 'data' | 'empty' | 'loading' | 'error';

const STATE_NAMES: ReadonlyArray<StateName> = [
  'data',
  'empty',
  'loading',
  'error',
];

const ERROR_CODES = [
  'unavailable',
  'permission-denied',
  'unauthenticated',
  'not-found',
  'resource-exhausted',
  'deadline-exceeded',
] as const;

const stateName = (state: MockState.State): StateName => {
  switch (state._tag) {
    case 'Data':
      return 'data';
    case 'Empty':
      return 'empty';
    case 'Loading':
      return 'loading';
    case 'Error':
      return 'error';
  }
};

/** The collection path a document path belongs to. */
const collectionOf = (docPath: string): string =>
  docPath.split('/').slice(0, -1).join('/');

const palette: Record<StateName, string> = {
  data: '#22c55e',
  empty: '#64748b',
  loading: '#f59e0b',
  error: '#ef4444',
};

const styles = {
  panel: {
    fontFamily:
      "'SF Mono', SFMono-Regular, ui-monospace, 'DejaVu Sans Mono', Menlo, Consolas, monospace",
    fontSize: 12,
    lineHeight: 1.5,
    color: '#e5e7eb',
    background: '#16181d',
    padding: 12,
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'auto',
  } satisfies CSSProperties,
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    paddingBottom: 10,
    borderBottom: '1px solid #2a2d35',
    marginBottom: 10,
  } satisfies CSSProperties,
  label: {
    color: '#9ca3af',
  } satisfies CSSProperties,
  input: {
    background: '#1f2229',
    color: '#e5e7eb',
    border: '1px solid #2a2d35',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 12,
    fontFamily: 'inherit',
    width: 64,
  } satisfies CSSProperties,
  select: {
    background: '#1f2229',
    color: '#e5e7eb',
    border: '1px solid #2a2d35',
    borderRadius: 4,
    padding: '2px 6px',
    fontSize: 12,
    fontFamily: 'inherit',
  } satisfies CSSProperties,
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 0',
  } satisfies CSSProperties,
  collection: {
    flex: 1,
    minWidth: 120,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } satisfies CSSProperties,
  count: {
    color: '#9ca3af',
    minWidth: 56,
    textAlign: 'right',
  } satisfies CSSProperties,
  buttonGroup: {
    display: 'flex',
    gap: 4,
  } satisfies CSSProperties,
  emptyMessage: {
    color: '#9ca3af',
    padding: '8px 0',
  } satisfies CSSProperties,
};

const stateButtonStyle = (
  name: StateName,
  active: boolean,
  inherited: boolean
): CSSProperties => ({
  background: active ? palette[name] : 'transparent',
  color: active ? '#0b0d10' : palette[name],
  opacity: active && inherited ? 0.6 : 1,
  border: `1px solid ${palette[name]}`,
  borderRadius: 4,
  padding: '1px 8px',
  fontSize: 11,
  fontFamily: 'inherit',
  fontWeight: active ? 700 : 400,
  cursor: 'pointer',
});

const actionButtonStyle: CSSProperties = {
  background: 'transparent',
  color: '#9ca3af',
  border: '1px solid #2a2d35',
  borderRadius: 4,
  padding: '1px 8px',
  fontSize: 11,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const runEffect = (effect: Effect.Effect<void>): void => {
  void Effect.runPromise(effect);
};

/**
 * A devtools panel for the `@effect-firebase/mock` backend: toggle each
 * collection between data / empty / loading / error, pick the simulated
 * error code, control latency, and reset to the initial fixtures.
 *
 * Works standalone or embedded as a TanStack Devtools plugin via
 * `firestoreMockPlugin`.
 */
export function MockDevtoolsPanel({
  controller,
  collections,
  onStateChange,
}: MockDevtoolsPanelProps) {
  const [snapshot, setSnapshot] = useState<StoreSnapshot>();
  const [errorCode, setErrorCode] =
    useState<(typeof ERROR_CODES)[number]>('unavailable');
  const [latencyMs, setLatencyMs] = useState(0);

  useEffect(() => {
    const fiber = Effect.runFork(
      Stream.runForEach(controller.changes, (current) =>
        Effect.sync(() => {
          setSnapshot(current);
        })
      )
    );
    void Effect.runPromise(controller.latency).then((latency) => {
      setLatencyMs(Duration.toMillis(latency));
    });
    return () => {
      Effect.runFork(Fiber.interrupt(fiber));
    };
  }, [controller]);

  const rows = useMemo(() => {
    const known = new Set<string>(collections ?? []);
    for (const docPath of Object.keys(snapshot?.docs ?? {})) {
      known.add(collectionOf(docPath));
    }
    for (const key of Object.keys(snapshot?.states ?? {})) {
      if (key !== MockState.All) {
        known.add(key);
      }
    }
    return [...known].sort();
  }, [snapshot, collections]);

  const docCount = (collectionPath: string): number => {
    const prefix = `${collectionPath}/`;
    return Object.keys(snapshot?.docs ?? {}).filter(
      (path) =>
        path.startsWith(prefix) && !path.slice(prefix.length).includes('/')
    ).length;
  };

  const toInput = (name: StateName): MockState.StateInput =>
    name === 'error' ? MockState.error(errorCode) : name;

  const setState = (collectionPath: string, name: StateName): void => {
    const state = MockState.fromInput(toInput(name));
    runEffect(controller.setState(collectionPath, state));
    onStateChange?.(collectionPath, state);
  };

  const applyLatency = (value: number): void => {
    setLatencyMs(value);
    runEffect(controller.setLatency(`${value} millis`));
  };

  const stateRow = (key: string, explicitOnly: boolean) => {
    const states = snapshot?.states ?? {};
    const explicit = states[key];
    const effective = explicitOnly
      ? explicit
      : MockState.resolve(states, key);
    const inherited = explicit === undefined;
    return (
      <div style={styles.buttonGroup}>
        {STATE_NAMES.map((name) => {
          const active =
            effective !== undefined && stateName(effective) === name;
          return (
            <button
              key={name}
              type="button"
              style={stateButtonStyle(name, active, inherited)}
              title={
                name === 'error'
                  ? `Fail with '${errorCode}'`
                  : `Switch '${key}' to ${name}`
              }
              onClick={() => setState(key, name)}
            >
              {name}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div style={styles.panel}>
      <div style={styles.toolbar}>
        <span style={styles.label}>all collections</span>
        {stateRow(MockState.All, true)}
        <button
          type="button"
          style={actionButtonStyle}
          title="Remove the wildcard state"
          onClick={() => runEffect(controller.clearState(MockState.All))}
        >
          clear
        </button>
        <span style={{ flex: 1 }} />
        <span style={styles.label}>error code</span>
        <select
          style={styles.select}
          value={errorCode}
          onChange={(event) =>
            setErrorCode(event.target.value as (typeof ERROR_CODES)[number])
          }
        >
          {ERROR_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
        <span style={styles.label}>latency</span>
        <input
          style={styles.input}
          type="number"
          min={0}
          step={50}
          value={latencyMs}
          onChange={(event) => applyLatency(Number(event.target.value) || 0)}
        />
        <span style={styles.label}>ms</span>
        <button
          type="button"
          style={actionButtonStyle}
          title="Restore initial fixtures and clear all states"
          onClick={() => runEffect(controller.reset)}
        >
          reset
        </button>
      </div>
      {rows.length === 0 ? (
        <div style={styles.emptyMessage}>
          No collections yet — seed fixtures or write a document.
        </div>
      ) : (
        rows.map((collectionPath) => (
          <div key={collectionPath} style={styles.row}>
            <span style={styles.collection}>{collectionPath}</span>
            <span style={styles.count}>{docCount(collectionPath)} docs</span>
            {stateRow(collectionPath, false)}
          </div>
        ))
      )}
    </div>
  );
}
