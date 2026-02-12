import { FunctionsRuntime } from '@effect-firebase/admin';
import { initializeApp } from 'firebase-admin/app';

export const runtime = FunctionsRuntime.Default(initializeApp());
