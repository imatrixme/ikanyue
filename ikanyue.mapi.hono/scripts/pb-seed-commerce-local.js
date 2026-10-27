const { id } = require('../src/services/commerce/planning');

async function main() {
    if (process.env.KANYUE_LOCAL_SEED !== 'true' || process.env.NODE_ENV === 'production'
        || !['127.0.0.1', 'localhost'].includes(new URL(process.env.PB_URL).hostname)) throw new Error('Local-only seed');
    const PocketBase = (await import('pocketbase')).default;
    const pb = new PocketBase(process.env.PB_URL);
    await pb.collection('_superusers').authWithPassword(process.env.PB_EMAIL, process.env.PB_PASSWORD);
    const credits = await pb.collection('credit_types').getFullList({ filter: 'kind="course" && status="active" && consumable=true', sort: 'id' });
    if (!credits.length) throw new Error('Booking seed must provide a course first');
    for (const quantity of [1, 4]) {
        const packageId = id('local-package', quantity);
        await createMissing(pb, 'packages', { id: packageId, code: `LOCAL-ONLINE-${quantity}`,
            name: `${credits[0].name} · ${quantity === 1 ? '单节体验' : '4节课包'}`, description: '本地模拟购买课程',
            saleChannel: 'all', activationMode: 'GRANT_TIME', validityDurationDays: 180,
            expiryPolicy: 'FIXED_DURATION', status: 'active' });
        await createMissing(pb, 'package_grant_lines', { id: id('local-line', quantity), packageId,
            creditTypeId: credits[0].id, quantity });
        await createMissing(pb, 'price_versions', { id: id('local-price', quantity), packageId,
            currency: 'CNY', listAmount: quantity * 240, saleAmount: quantity === 1 ? 240 : 800,
            validFrom: '2020-01-01T00:00:00.000Z', version: 1, status: 'active' });
    }
    const packages = await pb.collection('packages').getFullList({ filter: 'status="active"' });
    for (const item of packages) {
        const prices = await pb.collection('price_versions').getFullList({
            filter: pb.filter('packageId={:id} && status="active"', { id: item.id }), sort: '-validFrom',
        });
        if (!prices.length || prices[0].saleAmount <= 0) continue;
        await pb.collection('packages').update(item.id, { saleChannel: 'all' });
        const offerId = id('local-offer', item.id);
        try { await pb.collection('commerce_offers').getOne(offerId); }
        catch (error) {
            if (error.status !== 404) throw error;
            await pb.collection('commerce_offers').create({ id: offerId, packageId: item.id,
                priceVersionId: prices[0].id, name: item.name, status: 'active',
                policy: { version: 1, packageRefund: 'unused_paid_value',
                    cancellationTiers: [{ beforeMinutes: 0, feeBps: 0 }], testOnly: true } });
        }
    }
    const administrators = await pb.collection('teachers').getFullList({ filter: 'username="admin"' });
    if (administrators.length === 1) {
        await pb.collection('teachers').update(administrators[0].id, {
            password: 'admin870329', passwordConfirm: 'admin870329', opsPasswordChangeRequired: false,
        });
    }
    console.log('Local-only commerce offers ready; illustrative penalty tiers were not published.');
}
async function createMissing(pb, collection, record) {
    try { return await pb.collection(collection).getOne(record.id); }
    catch (error) { if (error.status !== 404) throw error; }
    return pb.collection(collection).create(record);
}
main().catch(() => { console.error('Local commerce seed failed.'); process.exitCode = 1; });
