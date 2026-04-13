import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import { Layer, Context } from 'effect';

export interface AppService {
  readonly getApp: () => FirebaseAdminApp;
}

export class App extends Context.Service<App, AppService>()(
  '@effect-firebase/admin/App'
) {}

export const layer = (app: FirebaseAdminApp): Layer.Layer<App> =>
  Layer.succeed(App, {
    getApp: () => app,
  });
