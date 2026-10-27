module.exports = {
    apps: [
        {
            name: 'mapi.kanyue',
            script: 'pnpm start:bun',
            node_args: '--max-http-header-size=16000',
            env_production: {
                NODE_ENV: 'production',
            },
        },
    ],
};
