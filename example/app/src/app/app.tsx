import { initializeApp } from 'firebase/app';
import {
  getFunctions,
  connectFunctionsEmulator,
  httpsCallable,
} from 'firebase/functions';
import SendRequest from './send-request';

export function App() {
  const app = initializeApp({
    projectId: 'effect-firebase-example',
  });
  const functions = getFunctions(app, 'europe-north1');
  connectFunctionsEmulator(functions, 'localhost', 5001);

  return (
    <div>
      <SendRequest
        title="onExampleCall"
        description="Call the onExampleCall function"
        showInput
        inputPlaceholder='{"id": 123}'
        onSendRequest={(input) =>
          httpsCallable(functions, 'onExampleCall')(input)
        }
      />
    </div>
  );
}

export default App;
