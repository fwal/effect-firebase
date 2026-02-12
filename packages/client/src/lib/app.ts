import type { FirebaseApp } from 'firebase/app';
import { Context, Layer } from 'effect';

export interface AppService {
  readonly getApp: () => FirebaseApp;
}

export class App extends Context.Tag('@effect-firebase/client/App')<
  App,
  AppService
>() {}

export const layer = (app: FirebaseApp): Layer.Layer<App> =>
  Layer.succeed(App, {
    getApp: () => app,
  });
