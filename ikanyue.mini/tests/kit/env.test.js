import { describe, expect, it } from 'vitest';
import { env, resolveEnv } from '../../miniprogram/kit/env.js';

describe('env', () => {
    it('sends release and trial builds to production', () => {
        expect(resolveEnv('release')).toEqual({ baseUrl: 'https://mapi.ikanyue.com', stage: 'RELEASE' });
        expect(resolveEnv('trial', 'http://10.0.0.2:1437')).toEqual({ baseUrl: 'https://mapi.ikanyue.com', stage: 'RELEASE' });
    });

    it('sends development builds to the local server through TEST', () => {
        expect(resolveEnv('develop')).toEqual({ baseUrl: 'http://127.0.0.1:1437', stage: 'TEST' });
        expect(resolveEnv('develop', 'http://10.0.0.2:1437')).toEqual({ baseUrl: 'http://10.0.0.2:1437', stage: 'TEST' });
    });

    it('reads the running version at load', () => {
        expect(env).toEqual({ baseUrl: 'http://127.0.0.1:1437', stage: 'TEST' });
    });
});
