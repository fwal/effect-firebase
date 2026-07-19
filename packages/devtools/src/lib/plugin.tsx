import type { ReactNode } from 'react';
import type { MockControllerShape } from '@effect-firebase/mock';
import {
  MockDevtoolsPanel,
  type MockDevtoolsPanelProps,
} from './panel.js';

/**
 * The plugin shape accepted by `<TanStackDevtools plugins={[...]} />` from
 * `@tanstack/react-devtools`. Declared structurally so this package does not
 * depend on TanStack Devtools itself.
 */
export interface TanStackDevtoolsReactPlugin {
  readonly id?: string;
  readonly name: ReactNode;
  readonly render: ReactNode;
  readonly defaultOpen?: boolean;
}

export interface FirestoreMockPluginOptions
  extends Omit<MockDevtoolsPanelProps, 'controller'> {
  /**
   * Plugin ID shown to TanStack Devtools. Defaults to `effect-firebase-mock`.
   */
  readonly id?: string;
  /**
   * Tab label in the devtools shell. Defaults to `Firestore Mock`.
   */
  readonly name?: string;
  /**
   * Open this panel by default when the devtools shell opens.
   */
  readonly defaultOpen?: boolean;
}

/**
 * Create a TanStack Devtools plugin that renders the mock backend's control
 * panel.
 *
 * @example
 * ```tsx
 * import { TanStackDevtools } from '@tanstack/react-devtools';
 * import { make } from '@effect-firebase/mock';
 * import { firestoreMockPlugin } from '@effect-firebase/devtools';
 *
 * const mock = make({ fixtures: [posts] });
 *
 * <TanStackDevtools
 *   plugins={[firestoreMockPlugin(mock.controller)]}
 * />
 * ```
 */
export const firestoreMockPlugin = (
  controller: MockControllerShape,
  options: FirestoreMockPluginOptions = {}
): TanStackDevtoolsReactPlugin => ({
  id: options.id ?? 'effect-firebase-mock',
  name: options.name ?? 'Firestore Mock',
  defaultOpen: options.defaultOpen,
  render: (
    <MockDevtoolsPanel
      controller={controller}
      collections={options.collections}
      onStateChange={options.onStateChange}
    />
  ),
});
