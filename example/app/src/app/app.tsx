import { useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { Layer } from 'effect';
import { Client } from '@effect-firebase/client';
import { RegistryProvider, useAtomRefresh } from '@effect/atom-react';
import { TanStackDevtools } from '@tanstack/react-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';
import {
  firestoreMockPlugin,
  type TanStackDevtoolsReactPlugin,
} from '@effect-firebase/devtools';
import SideMenu from '../components/menu/side-menu.js';
import MenuItem from '../components/menu/menu-item.js';
import { firestoreLayerAtom, latestPostsAtom } from '../lib/atoms.js';
import { mockBackend } from '../lib/mock.js';

interface AppProps {
  children: React.ReactNode;
}

/**
 * Start the app with `VITE_MOCK_BACKEND=1` (e.g. `pnpm example:mock`) to run
 * Firestore against the in-memory mock backend instead of the emulator.
 */
const useMockBackend = import.meta.env['VITE_MOCK_BACKEND'] === '1';

/**
 * One TanStack Devtools shell hosting the router panel and, in mock mode,
 * the Firestore Mock panel. Mounted inside the RegistryProvider so state
 * toggles can refresh the atoms whose streams ended on a simulated error
 * (stream errors are terminal, matching onSnapshot semantics).
 */
function Devtools() {
  const refreshPosts = useAtomRefresh(latestPostsAtom);
  const plugins = useMemo(() => {
    const all: Array<TanStackDevtoolsReactPlugin> = [
      {
        name: 'TanStack Router',
        render: <TanStackRouterDevtoolsPanel />,
      },
    ];
    if (useMockBackend) {
      all.push(
        firestoreMockPlugin(mockBackend.controller, {
          defaultOpen: true,
          onStateChange: (collectionPath) => {
            if (collectionPath === 'posts' || collectionPath === '*') {
              refreshPosts();
            }
          },
        })
      );
    }
    return all;
  }, [refreshPosts]);
  return <TanStackDevtools plugins={plugins} />;
}

export function App({ children }: AppProps) {
  const layer = useMemo(() => {
    const app = initializeApp({ projectId: 'effect-firebase-example' });
    const functions = getFunctions(app, 'europe-north1');
    connectFunctionsEmulator(functions, 'localhost', 5001);

    if (useMockBackend) {
      // Fixture encoding errors are defects, not recoverable failures.
      return Layer.orDie(mockBackend.layer);
    }

    const firestore = initializeFirestore(app, {
      ignoreUndefinedProperties: true,
    });
    connectFirestoreEmulator(firestore, 'localhost', 8080);

    return Client.layer({ firestore });
  }, []);

  // RegistryProvider reads initialValues only when the registry is first
  // created, so the array doesn't need a stable identity.
  return (
    <RegistryProvider initialValues={[[firestoreLayerAtom, layer] as const]}>
      <div className="flex min-h-screen bg-gray-50">
        <SideMenu>
          <MenuItem icon="🏠" label="Home" to="/" />
          <MenuItem icon="📊" label="Functions" to="/functions" />
          <MenuItem icon="🔥" label="Firestore" to="/firestore" />
        </SideMenu>

        {/* Main content area */}
        <main className="flex-1 md:ml-64 p-8">
          <div className="max-w-4xl mx-auto">{children}</div>
        </main>
      </div>
      <Devtools />
    </RegistryProvider>
  );
}

export default App;
