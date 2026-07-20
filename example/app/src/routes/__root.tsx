import { Outlet, createRootRoute } from '@tanstack/react-router';
import App from '../app/app';

export const Route = createRootRoute({
  component: RootComponent,
});

// Devtools (router + Firestore mock) are mounted by <App /> in a single
// TanStack Devtools shell.
function RootComponent() {
  return (
    <App>
      <Outlet />
    </App>
  );
}
