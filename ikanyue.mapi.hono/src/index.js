/**
 * Hono.js 应用入口文件
 */

const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const { responseMiddleware } = require('./middleware/response');
const { registerRoutes } = require('./routes');

// 创建 Hono 应用实例
const app = new Hono();

// 全局中间件
app.use('*', responseMiddleware());

// 注册所有路由
registerRoutes(app);

// 启动服务器
const port = process.env.PORT || 1337;

serve(
    {
        fetch: app.fetch,
        port: port,
    },
    (info) => {
        console.log('🚀 ikanyue-hono API 服务已启动');
        console.log(`📍 服务地址: http://localhost:${info.port}`);
        console.log(`🕐 启动时间: ${new Date().toLocaleString('zh-CN')}`);
    }
);

module.exports = app;
