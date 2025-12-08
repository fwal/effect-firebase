import { Layer, ManagedRuntime } from 'effect';
import { Client } from '@effect-firebase/client';

const MainLayer = Layer.mergeAll(Client.layer);

export const Runtime = ManagedRuntime.make(MainLayer);
