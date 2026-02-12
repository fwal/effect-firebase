import type { App as FirebaseAdminApp } from 'firebase-admin/app';
import { Context, Layer } from 'effect';

export interface AppService {
  readonly getApp: () => FirebaseAdminApp;
}

export class App extends Context.Tag('@effect-firebase/admin/App')<
  App,
  AppService
>() {}

export const layer = (app: FirebaseAdminApp): Layer.Layer<App> =>
  Layer.succeed(App, {
    getApp: () => app,
  });
