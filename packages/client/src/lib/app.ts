import type { FirebaseApp } from 'firebase/app';
import { Layer, Context } from 'effect';

export interface AppService {
  readonly getApp: () => FirebaseApp;
}

export class App extends Context.Service<App, AppService>()(
  '@effect-firebase/client/App'
) {}

export const layer = (app: FirebaseApp): Layer.Layer<App> =>
  Layer.succeed(App, {
    getApp: () => app,
  });
