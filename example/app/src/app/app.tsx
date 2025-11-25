import { initializeApp } from 'firebase/app';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import { OnExampleCall } from '@example/shared';
import SendRequest from '../components/requests/send-request.js';
import SideMenu from '../components/menu/side-menu.js';
import MenuItem from '../components/menu/menu-item.js';
import { useState } from 'react';

export function App() {
  const app = initializeApp({
    projectId: 'effect-firebase-example',
  });
  const functions = getFunctions(app, 'europe-north1');
  connectFunctionsEmulator(functions, 'localhost', 5001);

  const [activeMenuItem, setActiveMenuItem] = useState<string | null>(null);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <SideMenu>
        <MenuItem
          icon="🏠"
          label="Home"
          isActive={activeMenuItem === 'home'}
          onClick={() => setActiveMenuItem('home')}
        />
        <MenuItem
          icon="📊"
          label="Functions"
          isActive={activeMenuItem === 'functions'}
          onClick={() => setActiveMenuItem('functions')}
        />
        <MenuItem
          icon="🔥"
          label="Firestore"
          isActive={activeMenuItem === 'firestore'}
          onClick={() => setActiveMenuItem('firestore')}
        />
        <MenuItem
          icon="🔐"
          label="Auth"
          isActive={activeMenuItem === 'auth'}
          onClick={() => setActiveMenuItem('auth')}
        />
        <MenuItem
          icon="⚙️"
          label="Settings"
          isActive={activeMenuItem === 'settings'}
          onClick={() => setActiveMenuItem('settings')}
        />
      </SideMenu>

      {/* Main content area */}
      <main className="flex-1 md:ml-64 p-8">
        <div className="max-w-4xl mx-auto">
          <header className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">
              Firebase Functions
            </h2>
            <p className="text-gray-600">
              Test your Firebase functions with the Effect library
            </p>
          </header>

          <div className="space-y-6">
            {activeMenuItem === 'functions' && (
              <SendRequest
                title="onExampleCall"
                description="Call the onExampleCall function"
                showInput
                inputPlaceholder='{"id": 123}'
                inputSchema={OnExampleCall.Input}
                onSendRequest={httpsCallable(functions, 'onExampleCall')}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
