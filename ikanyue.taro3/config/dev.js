const serviceUrl = process.env.KANYUE_LOCAL_API_URL || 'http://127.0.0.1:1437';

module.exports = {
    env: {
        NODE_ENV: '"development"',
    },
    defineConstants: {
        SERVICE_URL: JSON.stringify(serviceUrl),
        STAGE: JSON.stringify('TEST'),
    },
    mini: {
        // Watch builds are otherwise unminified (~3.9 MB) and trip the 2 MB package warning in DevTools.
        // Only the bundle is minified; NODE_ENV stays "development" and source maps are kept.
        webpackChain(chain) {
            chain.mode('production');
        },
    },
    h5: {},
};
