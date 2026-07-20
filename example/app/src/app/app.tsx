import { useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from 'firebase/firestore';
import { Client } from '@effect-firebase/client';
import { RegistryProvider } from '@effect/atom-react';
import SideMenu from '../components/menu/side-menu.js';
import MenuItem from '../components/menu/menu-item.js';
import { firestoreLayerAtom } from '../lib/atoms.js';

interface AppProps {
  children: React.ReactNode;
}

export function App({ children }: AppProps) {
  const layer = useMemo(() => {
    const app = initializeApp({ projectId: 'effect-firebase-example' });
    const functions = getFunctions(app, 'europe-north1');
    connectFunctionsEmulator(functions, 'localhost', 5001);

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
    </RegistryProvider>
  );
}

export default App;
