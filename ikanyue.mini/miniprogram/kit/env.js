import { host } from './host.js';

const LOCAL = 'http://127.0.0.1:1437';
const RELEASE = { baseUrl: 'https://mapi.ikanyue.com', stage: 'RELEASE' };

// Storage key a developer can set (DevTools console or real-device debugging) to reach a LAN server.
export const DEV_API_URL_KEY = 'kit.devApiUrl';

// Development builds talk to the native-stack server through the TEST stage; trial and release builds use production.
export function resolveEnv(envVersion, devApiUrl) {
    if (envVersion !== 'develop') return RELEASE;
    return { baseUrl: devApiUrl || LOCAL, stage: 'TEST' };
}

function readEnv() {
    try {
        const version = host.getAccountInfoSync().miniProgram.envVersion;
        return resolveEnv(version, version === 'develop' ? host.getStorageSync(DEV_API_URL_KEY) : '');
    } catch {
        return RELEASE;
    }
}

export const env = readEnv();
