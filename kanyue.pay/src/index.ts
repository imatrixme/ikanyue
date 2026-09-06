import PocketBase from 'pocketbase';
import { createApp } from './app';
import { config } from './config';
import { ensure } from './domain';
import { Gateway } from './gateway';
import { PocketBaseStore } from './store';
import { verifySchema } from './schema';
import { WechatGateway } from './wechat/gateway';
import { WechatAdapter } from './wechat/adapter';
import { WechatClient } from './wechat/client';
import { liveCredentials, liveTransport } from './wechat/live';
import { deliverEvents, DurableWork } from './work';

ensure(Bun.version === '1.4.1', 'BUN_1_4_1_REQUIRED');
const settings = config();
const pb = new PocketBase(settings.pbUrl);
await pb.collection('_superusers').authWithPassword(settings.email, settings.password);
await verifySchema(pb, settings.provider === 'wechatpay-mock');
const store = new PocketBaseStore(pb);
const work = new DurableWork(store, settings.owner);
const gateway = settings.live ? new WechatGateway(store, settings.owner,
  new WechatAdapter(new WechatClient(liveCredentials(settings.credentialFile), liveTransport(settings.live), false)), work)
  : settings.provider === 'wechatpay-mock' ? new WechatGateway(store, settings.owner, undefined, work) : new Gateway(store, settings.owner);
await gateway.store.list('payment', settings.owner);
const server = Bun.serve({ hostname: settings.host, port: settings.port, fetch: createApp(gateway, settings).fetch });
let running = false;
const timer = setInterval(async () => {
  if (running) return;
  running = true;
  try {
    if (!pb.authStore.isValid) await pb.collection('_superusers').authWithPassword(settings.email, settings.password);
    const result = await gateway.poll();
    await deliverEvents(gateway, work, settings.events);
    if (result.errors.length) console.error('Payment polling has unresolved observations:', result.errors.length);
  } catch { console.error('Payment worker temporarily unavailable; durable work retained.'); }
  finally { running = false; }
}, settings.interval);
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => {
  clearInterval(timer); server.stop(); process.exit(0);
});
console.log(`kanyue.pay (${settings.provider}) listening on http://${settings.host}:${server.port}`);
