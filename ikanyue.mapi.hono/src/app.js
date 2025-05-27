/**
 * Hono.js 应用入口文件
 * 支持 Node.js 和 Bun 运行环境
 */

const { Hono } = require('hono');
const { responseMiddleware } = require('./middleware/response');
const { registerRoutes } = require('./bonelayer/router');

// 创建 Hono 应用实例
const app = new Hono();

// 全局中间件
app.use('*', responseMiddleware());

// 注册所有路由
registerRoutes(app);

// 端口配置
const port = process.env.PORT || 1337;

// 检测运行环境
const isBun = typeof Bun !== 'undefined';

if (isBun) {
    // Bun 环境
    console.log('🚀 API 应用已准备就绪 (Bun 环境)');
    console.log(`📍 端口: ${port}`);
    console.log(`🕐 时间: ${new Date().toLocaleString('zh-CN')}`);

    // 导出 Bun 服务器配置
    module.exports = {
        port: port,
        fetch: app.fetch.bind(app),
    };
} else {
    // Node.js 环境
    const { serve } = require('@hono/node-server');

    serve(
        {
            fetch: app.fetch,
            port: port,
        },
        (info) => {
            console.log('🚀 API 服务已启动 (Node.js 环境)');
            console.log(`📍 服务地址: http://localhost:${info.port}`);
            console.log(`🕐 启动时间: ${new Date().toLocaleString('zh-CN')}`);
        }
    );

    // 导出 app 实例用于测试
    module.exports = app;
}
