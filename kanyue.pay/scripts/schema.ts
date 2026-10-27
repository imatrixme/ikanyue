import PocketBase from 'pocketbase';
import { config } from '../src/config';
import { bootstrap } from '../src/schema';

const settings = config();
const pb = new PocketBase(settings.pbUrl);
await pb.collection('_superusers').authWithPassword(settings.email, settings.password);
await bootstrap(pb);
console.log('Payment schema ready (separate PocketBase; no business data modified).');
