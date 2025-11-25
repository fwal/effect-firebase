import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/firestore')({
  component: RouteComponent,
});

function RouteComponent() {
  return <div>Hello "/firestore"!</div>;
}
