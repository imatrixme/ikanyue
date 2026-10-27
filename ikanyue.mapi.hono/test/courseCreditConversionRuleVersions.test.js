const test = require('node:test');
const assert = require('node:assert/strict');

const {
    activeConversionRulesAt,
    currentConversionRule,
    latestConversionRules,
} = require('../src/services/courseCredits/conversionRuleVersions');

test('latest conversion version controls publication and deactivation semantics', () => {
    const active = rule({ id: 'v1', version: 1, status: 'active' });
    const inactive = rule({ id: 'v2', version: 2, status: 'inactive' });
    const other = rule({ id: 'other', sourceCreditTypeId: 'B', targetCreditTypeId: 'C', status: 'active' });

    assert.deepEqual(latestConversionRules([active, inactive, other]).map((item) => item.id), ['v2', 'other']);
    assert.deepEqual(activeConversionRulesAt([active, inactive, other], '2026-08-18T00:00:00Z')
        .map((item) => item.id), ['other']);
    assert.equal(currentConversionRule([active, inactive], active).id, 'v2');
});

test('future and expired latest versions remain unavailable', () => {
    assert.deepEqual(activeConversionRulesAt([
        rule({ id: 'future', validFrom: '2027-01-01T00:00:00Z' }),
        rule({ id: 'expired', sourceCreditTypeId: 'B', validTo: '2026-01-01T00:00:00Z' }),
    ], '2026-08-18T00:00:00Z'), []);
});

function rule(overrides = {}) {
    return {
        id: 'rule', sourceCreditTypeId: 'A', targetCreditTypeId: 'B', version: 1,
        status: 'active', validFrom: '2026-01-01T00:00:00Z', validTo: '', ...overrides,
    };
}
