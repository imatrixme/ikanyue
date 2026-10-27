const { loadCommerce } = require('../src/routes/commerce');

let running = false;
async function tick() {
    if (running || process.env.COURSE_COMMERCE_ENABLED !== 'true') return;
    running = true;
    try {
        const { checkout, refunds } = await loadCommerce();
        const results = [await checkout.recover(), await refunds.recover()];
        if (results.some((result) => result.unresolved)) console.error('Commerce recovery has unresolved work.');
    } catch { console.error('Commerce worker temporarily unavailable; pending records retained.'); }
    finally { running = false; }
}
const timer = setInterval(tick, 3000);
tick();
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { clearInterval(timer); process.exit(0); });
