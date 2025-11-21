import { Admin, makeRuntime } from '@effect-firebase/admin';

export const runtime = () => makeRuntime(Admin.layer);
