import { OnExampleCall } from '@example/shared';
import { createFileRoute } from '@tanstack/react-router';
import { getFunctions, httpsCallable } from 'firebase/functions';
import SendRequest from '../components/requests/send-request';

export const Route = createFileRoute('/functions')({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <>
      <header className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          Firebase Functions
        </h2>
        <p className="text-gray-600">
          Test your Firebase functions with the Effect library
        </p>
      </header>

      <div className="space-y-6">
        <SendRequest
          title="onExampleCall"
          description="Call the onExampleCall function"
          showInput
          inputPlaceholder='{"id": 123}'
          inputSchema={OnExampleCall.Input}
          onSendRequest={httpsCallable(getFunctions(), 'onExampleCall')}
        />
      </div>
    </>
  );
}
