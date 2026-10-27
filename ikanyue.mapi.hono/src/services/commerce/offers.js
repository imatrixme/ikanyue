const { invariant } = require('../courseCredits/domain');
const { create } = require('../courseCredits/reservationRequests');
const { id, validatePolicy, commerceUpdate } = require('./planning');
const { validateReason } = require('./operations');

class CommerceOffers {
    constructor(checkout) { this.checkout = checkout; this.repo = checkout.repo; }
    async list() {
        const offers = await this.repo.list('commerce_offers', { sort: '-created' });
        const packages = await this.repo.list('packages', { filter: 'status="active"', sort: 'name' });
        const prices = await this.repo.list('price_versions', { sort: '-created' });
        return { offers, packages: packages.map((row) => ({ id: row.id, name: row.name })),
            prices: prices.map((row) => ({ id: row.id, packageId: row.packageId, amount: row.saleAmount, currency: row.currency, version: row.version })) };
    }
    async save(input, user) {
        invariant(typeof input.name === 'string' && input.name.trim().length >= 2 && input.name.length <= 100,
            'OFFER_NAME_REQUIRED', '请填写课程商品名称');
        invariant(typeof input.key === 'string' && /^[\w-]{1,100}$/.test(input.key), 'OFFER_KEY_REQUIRED', '请重新提交商品');
        const policy = validatePolicy(input.policy);
        invariant(policy.cancellationTiers.length > 0 && policy.cancellationTiers.at(-1).beforeMinutes === 0,
            'INVALID_CANCELLATION_TIERS', '请配置直至开课时的取消规则');
        const price = await this.repo.get('price_versions', input.priceVersionId);
        invariant(price.packageId === input.packageId, 'PRICE_PACKAGE_MISMATCH', '价格不属于所选课包');
        const offerId = input.id || id('offer', user.id, input.key);
        invariant(/^[a-z0-9]{15}$/.test(offerId), 'INVALID_OFFER_ID', '商品编号无效');
        const previous = await this.repo.findFirst('commerce_offers', `id="${offerId}"`);
        const body = { packageId: input.packageId, priceVersionId: input.priceVersionId,
            name: input.name.trim(), policy, status: 'draft' };
        if (previous && !input.id) {
            invariant(previous.name === body.name && previous.packageId === body.packageId
                && previous.priceVersionId === body.priceVersionId && JSON.stringify(previous.policy) === JSON.stringify(policy),
            'OFFER_REQUEST_CONFLICT', '此提交已创建不同内容的商品');
            return previous;
        }
        if (previous) invariant(previous.status === 'draft' && Number(previous.version || 0) === input.version,
            'OFFER_VERSION_CONFLICT', '商品已发布或已变化，请新建版本');
        const changes = previous ? commerceUpdate('commerce_offers', { ...previous, version: Number(previous.version || 0) }, body)
            : [create('commerce_offers', { id: offerId, ...body, version: 1 })];
        changes.push(create('commerce_audit', { id: id('offer-save', offerId, Number(previous?.version || 0)),
            actorId: user.id, subjectId: offerId, action: 'offer_draft_saved', data: { name: body.name, policy, createdAt: new Date().toISOString() } }));
        await this.repo.send(changes);
        return this.repo.get('commerce_offers', offerId);
    }
    async transition(offerId, input, user) {
        const row = await this.repo.get('commerce_offers', offerId);
        invariant(Number(row.version || 0) === input.version, 'OFFER_VERSION_CONFLICT', '商品已变化，请刷新');
        invariant((input.status === 'active' && row.status === 'draft') || (input.status === 'inactive' && row.status === 'active'),
            'INVALID_OFFER_TRANSITION', '发布后只能下架；修改规则请创建新版本');
        const reason = validateReason(input.reason);
        if (input.status === 'active') await this.checkout.offer(offerId, true);
        const at = new Date().toISOString();
        await this.repo.send([...commerceUpdate('commerce_offers', { ...row, version: Number(row.version || 0) }, { status: input.status }),
            create('commerce_audit', { id: id('offer-state', offerId, row.version || 0), subjectId: offerId, actorId: user.id,
                action: input.status === 'active' ? 'offer_published' : 'offer_withdrawn', data: { reason, policy: row.policy, createdAt: at } })]);
        return this.repo.get('commerce_offers', offerId);
    }
}
module.exports = { CommerceOffers };
