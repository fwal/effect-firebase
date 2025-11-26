import { initializeApp } from 'firebase/app';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { OnExampleCall } from '@example/shared';
import SendRequest from '../components/requests/send-request.js';
import SideMenu from '../components/menu/side-menu.js';
import MenuItem from '../components/menu/menu-item.js';
import { useState } from 'react';

interface AppProps {
  children: React.ReactNode;
}

export function App({ children }: AppProps) {
  const app = initializeApp({
    projectId: 'effect-firebase-example',
  });
  const functions = getFunctions(app, 'europe-north1');
  connectFunctionsEmulator(functions, 'localhost', 5001);

  const db = getFirestore(app);
  connectFirestoreEmulator(db, 'localhost', 8080);

  return (
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
  );
}

export default App;
