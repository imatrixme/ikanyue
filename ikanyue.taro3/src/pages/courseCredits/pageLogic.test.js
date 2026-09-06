import { describe, expect, it } from 'vitest';
import {
    activationModeLabel,
    batchRestrictionText,
    batchStatusLabel,
    buildAuthorizationPayload,
    conversionRuleText,
    courseCreditErrorMessage,
    createIdempotencyKey,
    eventLabel,
    eventSourceText,
    expiryPolicyLabel,
    expiryState,
    findConversionRule,
    formatDate,
    formatDateTime,
    hasNextPage,
    learnerCreditName,
    mergePage,
    normalizeCreditType,
    normalizePage,
    normalizeSummary,
    pageState,
    previewFacts,
    quantity,
    sessionPresentation,
    signedEventQuantity,
    sourceQuantityForSteps,
} from './pageLogic';

describe('course-credit mini-program presentation logic', () => {
    it('groups universal and exact credits and calculates summary totals', () => {
        const summary = normalizeSummary({
            warningDays: 15,
            items: [
                item({ exchangeOnly: true, creditType: { id: 'universal', kind: 'universal', code: 'U' } }),
                item({
                    availableQuantity: 3, expiringQuantity: 2, frozenQuantity: 1,
                    creditType: { id: 'vocal', name: '声乐一对一', kind: 'course' },
                }),
            ],
        });

        expect(summary.universal).toHaveLength(1);
        expect(summary.exact).toHaveLength(1);
        expect(summary.totals).toEqual({ available: 5, expiring: 2, frozen: 3, unactivated: 0 });
        expect(summary.warningDays).toBe(15);
        expect(normalizeSummary().warningDays).toBe(30);
    });

    it('normalizes pages and deduplicates paginated results', () => {
        const page = normalizePage({ page: '2', perPage: '10', totalItems: '3', totalPages: '2', items: [{ id: 'b' }] });
        expect(page).toMatchObject({ page: 2, perPage: 10, totalItems: 3, totalPages: 2 });
        expect(hasNextPage({ page: 1, totalPages: 2 })).toBe(true);
        expect(hasNextPage(page)).toBe(false);
        expect(mergePage([{ id: 'a' }, { id: 'b', value: 1 }], [{ id: 'b', value: 2 }, { id: 'c' }]))
            .toEqual([{ id: 'a' }, { id: 'b', value: 2 }, { id: 'c' }]);
        expect(mergePage([], [{ sessionStudentId: 'session' }], 'missing')).toHaveLength(1);
        expect(mergePage(null, [{ value: 'ignored' }])).toEqual([]);
        expect(mergePage(undefined, undefined)).toEqual([]);
        expect(normalizePage()).toEqual({ items: [], page: 1, perPage: 20, totalItems: 0, totalPages: 0 });
        expect(hasNextPage()).toBe(false);
    });

    it('formats dates and determines half-open expiry display states', () => {
        const now = Date.parse('2026-07-01T00:00:00Z');
        expect(formatDate('2026-07-17T10:30:00Z')).toMatch(/^2026\.07\.17$/);
        expect(formatDate('bad')).toBe('长期有效');
        expect(formatDateTime('2026-07-17T10:30:00Z')).toMatch(/^07\.17 /);
        expect(formatDateTime('')).toBe('时间待定');
        expect(expiryState('', now)).toBe('none');
        expect(expiryState('2026-07-01T00:00:00Z', now)).toBe('expired');
        expect(expiryState('2026-07-10T00:00:00Z', now, 30)).toBe('warning');
        expect(expiryState('2026-09-01T00:00:00Z', now, 30)).toBe('valid');
    });

    it('maps batch, activation, event, and expiry policy copy', () => {
        expect(batchStatusLabel('active')).toBe('可使用');
        expect(batchStatusLabel('unknown')).toBe('状态未知');
        expect(activationModeLabel('FIRST_CHECK_IN')).toBe('首次签到时生效');
        expect(activationModeLabel('unknown')).toBe('按课程规则生效');
        expect(eventLabel('CONSUME')).toBe('上课使用');
        expect(eventLabel('unknown')).toBe('课时变动');
        expect(eventSourceText(null)).toBe('课时账户');
        expect(eventSourceText({ type: 'order', operationNo: 'GRANT-1' })).toBe('报课后到账');
        expect(eventSourceText({ type: 'session', id: 'session' })).toBe('上课结算');
        expect(eventSourceText({ type: 'unknown' })).toBe('系统记录');
        expect(expiryPolicyLabel('NO_EXPIRY')).toBe('长期有效');
        expect(expiryPolicyLabel('unknown')).toBe('按当前规则计算');
    });

    it('explains batch restrictions without implying universal credits are consumable', () => {
        expect(batchRestrictionText({ creditType: { kind: 'universal' } })).toContain('需先兑换');
        expect(batchRestrictionText({ status: 'unactivated', activationMode: 'FIRST_RESERVATION' })).toContain('首次预约');
        expect(batchRestrictionText({ status: 'expired' })).toContain('已过期');
        expect(batchRestrictionText({ frozenQuantity: 2 })).toContain('2 课时');
        expect(batchRestrictionText({})).toContain('对应课程');
    });

    it('formats conversion rules, quantities, and authoritative preview facts', () => {
        const rule = conversionRule();
        expect(conversionRuleText(rule)).toBe('100 通用兑换额度 → 1 声乐课时');
        expect(sourceQuantityForSteps(rule, 2)).toBe(200);
        expect(sourceQuantityForSteps({ ...rule, maxSourceQuantity: 150 }, 2)).toBe(150);
        expect(sourceQuantityForSteps({}, 0)).toBe(1);
        expect(sourceQuantityForSteps({ sourceQuantity: 50 })).toBe(50);
        const facts = previewFacts({
            sourceQuantity: 100, targetQuantity: 1, reversible: false,
            rule: { id: 'rule', version: 2, activationMode: 'GRANT_TIME', expiryPolicy: 'INHERIT_SOURCE' },
            targets: [{ effectiveExpiresAt: '2026-08-01T00:00:00Z', activationMode: 'GRANT_TIME', expiryPolicy: 'FIXED_DURATION' }],
        });
        expect(facts.map((fact) => fact.value)).toContain('兑换后不可撤回');
        expect(previewFacts({
            reversible: true,
            rule: { activationMode: 'FIRST_CHECK_IN', expiryPolicy: 'TARGET_TERM_END', version: 0 },
            targets: [],
        }).map((fact) => fact.value)).toEqual(expect.arrayContaining(['可以撤回', '首次签到时生效', '目标学期结束']));
        expect(previewFacts({ targets: 'invalid' })).toHaveLength(5);
    });

    it('maps every lesson credit state to a stable action', () => {
        expect(sessionPresentation({ creditStatus: 'pending' })).toMatchObject({ action: 'reserve' });
        expect(sessionPresentation({ creditStatus: 'credit_insufficient' })).toMatchObject({ tone: 'danger' });
        expect(sessionPresentation({ creditStatus: 'conversion_required' })).toMatchObject({ action: 'consent' });
        expect(sessionPresentation({ creditStatus: 'reserved' })).toMatchObject({ action: 'none' });
        expect(sessionPresentation({ creditStatus: 'consumed' }).label).toContain('上课');
        expect(sessionPresentation({ creditStatus: 'released' })).toMatchObject({ action: 'reserve' });
        expect(sessionPresentation({ creditStatus: 'reversed' })).toMatchObject({ tone: 'warning' });
        expect(sessionPresentation({ creditStatus: 'other' })).toMatchObject({ action: 'none' });
        expect(sessionPresentation()).toMatchObject({ action: 'reserve', label: '可以预约' });
    });

    it('finds conversion paths and builds current-consent payloads', () => {
        const rules = [conversionRule()];
        const session = { requiredCreditType: { id: 'target' }, session: { startAt: '2026-08-01T00:00:00Z' } };
        expect(findConversionRule(rules, { ruleId: 'rule' }, session)?.id).toBe('rule');
        expect(findConversionRule(rules, {}, session)?.id).toBe('rule');
        expect(findConversionRule([], {}, session)).toBeNull();
        expect(buildAuthorizationPayload({
            previewAt: 'now', previewHash: 'hash', sourceQuantity: 100, rule: { id: 'rule' },
        }, session)).toEqual({
            previewAt: 'now', previewHash: 'hash', ruleId: 'rule', sourceQuantity: 100,
            targetTermEnd: null, validTo: '2026-08-01T00:00:00Z',
        });
        expect(buildAuthorizationPayload({}, {})).toMatchObject({ validTo: null });
    });

    it('creates deterministic idempotency keys and stable error messages', () => {
        expect(createIdempotencyKey('reserve', () => 1000, () => 0.5)).toMatch(/^reserve:rs:/);
        expect(courseCreditErrorMessage({ errorCode: 'CREDIT_INSUFFICIENT' })).toContain('不足');
        expect(courseCreditErrorMessage({ message: 'network' })).toBe('network');
        expect(courseCreditErrorMessage(null, 'fallback')).toBe('fallback');
    });

    it('derives async page state, signed quantities, and safe credit type fallbacks', () => {
        expect(pageState({ loading: true })).toBe('loading');
        expect(pageState({ error: 'failed' })).toBe('error');
        expect(pageState({ items: [{}] })).toBe('ready');
        expect(pageState()).toBe('empty');
        expect(signedEventQuantity({ eventType: 'GRANT', quantityDelta: 2 })).toBe('+2');
        expect(signedEventQuantity({ eventType: 'CONSUME', quantityDelta: 2 })).toBe('-2');
        expect(signedEventQuantity({ eventType: 'ADJUST', quantityDelta: -1 })).toBe('-1');
        expect(signedEventQuantity({})).toBe('0');
        expect(normalizeCreditType({ courseSpec: { name: '课程名' } }).name).toBe('课程名');
        expect(normalizeCreditType({ code: 'CODE' }).name).toBe('CODE');
        expect(normalizeCreditType().name).toBe('课时余额');
        expect(learnerCreditName('通用课程点')).toBe('通用兑换额度');
        expect(learnerCreditName('声乐课点')).toBe('声乐课时');
        expect(quantity('3')).toBe(3);
        expect(quantity(-1)).toBe(0);
    });
});

function item(changes = {}) {
    return {
        availableQuantity: 2, frozenQuantity: 2, unactivatedQuantity: 0,
        expiringQuantity: 0, nearestExpiryAt: null, creditType: {}, exchangeOnly: false,
        ...changes,
    };
}

function conversionRule() {
    return {
        id: 'rule', sourceQuantity: 100, targetQuantity: 1, minSourceQuantity: 100,
        maxSourceQuantity: 0,
        sourceCreditType: { id: 'source', name: '通用课程点' },
        targetCreditType: { id: 'target', name: '声乐课点' },
    };
}
