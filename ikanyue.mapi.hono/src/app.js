/**
 * Hono.js 应用入口文件
 * 支持 Node.js 和 Bun 运行环境
 */

const { Hono } = require('hono');
const { responseMiddleware } = require('./middleware/response');
const { registerRoutes } = require('./bonelayer/router');
const { verifyCourseCreditStorageAtStartup } = require('./services/courseCredits/storageStartup');

// 创建 Hono 应用实例
const app = new Hono();

// 全局中间件
app.use('*', responseMiddleware());

// 注册所有路由
registerRoutes(app);

// 端口配置
const port = process.env.PORT || 1337;
const hostname = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1');

async function startServer(options = {}) {
    await (options.verifyStorage || verifyCourseCreditStorageAtStartup)();
    const bunRuntime = options.bunRuntime ?? globalThis.Bun ?? null;
    if (bunRuntime) {
        const server = bunRuntime.serve({
            fetch: app.fetch.bind(app),
            hostname,
            port,
        });
        console.log('🚀 API 服务已启动 (Bun 环境)');
        console.log(`📍 服务地址: http://${hostname}:${server.port}`);
        console.log(`🕐 启动时间: ${new Date().toLocaleString('zh-CN')}`);
        return server;
    }

    const serve = options.serve || require('@hono/node-server').serve;
    return serve(
        {
            fetch: app.fetch,
            port: port,
            hostname,
        },
        (info) => {
            console.log('🚀 API 服务已启动 (Node.js 环境)');
            console.log(`📍 服务地址: http://${hostname}:${info.port}`);
            console.log(`🕐 启动时间: ${new Date().toLocaleString('zh-CN')}`);
        }
    );
}

if (require.main === module) {
    startServer().catch((error) => {
        console.error('API 启动失败:', error.message);
        process.exitCode = 1;
    });
}

module.exports = app;
module.exports.startServer = startServer;
