const serviceUrl = process.env.KANYUE_LOCAL_API_URL || 'http://127.0.0.1:1437';

module.exports = {
    env: {
        NODE_ENV: '"development"',
    },
    defineConstants: {
        SERVICE_URL: JSON.stringify(serviceUrl),
        STAGE: JSON.stringify('TEST'),
    },
    mini: {},
    h5: {},
};
