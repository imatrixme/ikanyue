import { describe, expect, it } from 'vitest';
import { AGREEMENTS, agreementFor } from './pageLogic';
import { AGREEMENT_REQUIRED_MESSAGE, agreementUrl } from '../profile/pageLogic';

describe('login agreements', () => {
    it('resolves both agreements and falls back to the user agreement', () => {
        expect(agreementFor('privacy').title).toBe('隐私政策');
        expect(agreementFor('user').title).toBe('用户协议');
        expect(agreementFor('unknown')).toBe(AGREEMENTS.user);
    });

    it('names the data the privacy policy covers', () => {
        const text = AGREEMENTS.privacy.sections.map((section) => section.body).join('');
        expect(text).toContain('手机号');
        expect(text).toContain('微信支付');
    });

    it('builds agreement links and the consent prompt used by the login sheet', () => {
        expect(agreementUrl('privacy')).toBe('/pages/agreement/index?type=privacy');
        expect(agreementUrl('other')).toBe('/pages/agreement/index?type=user');
        expect(AGREEMENT_REQUIRED_MESSAGE).toContain('同意');
    });
});
