import { Outlet, createRootRoute } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import App from '../app/app';

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  return (
    <App>
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </App>
  );
}
