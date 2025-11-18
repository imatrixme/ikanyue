#!/usr/bin/env node

/**
 * Swagger UI 服务脚本
 * 在开发环境中启动 SwaggerUI 服务
 */

const { Hono } = require('hono');
const { serve } = require('@hono/node-server');
const fs = require('fs');
const path = require('path');

/**
 * 生成 SwaggerUI HTML 页面
 * @param {string} swaggerJsonPath - swagger.json 文件路径
 * @returns {string} HTML 内容
 */
function generateSwaggerUIHTML(swaggerJsonPath) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>ikanyue-hono API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://unpkg.com/swagger-ui-dist@5.10.3/favicon-32x32.png" sizes="32x32" />
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      background-color: #1f2937;
    }
    .swagger-ui .topbar .download-url-wrapper {
      display: none;
    }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.10.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${swaggerJsonPath}',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        supportedSubmitMethods: ['get', 'post', 'put', 'delete', 'patch'],
        validatorUrl: null,
        tryItOutEnabled: true,
        requestInterceptor: function(request) {
          // 添加默认的 Content-Type
          if (request.method !== 'GET' && !request.headers['Content-Type']) {
            request.headers['Content-Type'] = 'application/json';
          }
          return request;
        },
        responseInterceptor: function(response) {
          return response;
        }
      });
    };
  </script>
</body>
</html>
  `.trim();
}

/**
 * 创建 Swagger 服务应用
 * @returns {Hono} Hono 应用实例
 */
function createSwaggerApp() {
    const app = new Hono();

    const docsDir = path.join(__dirname, '..', 'docs');
    const swaggerJsonFile = path.join(docsDir, 'swagger.json');

    // 检查 swagger.json 是否存在
    if (!fs.existsSync(swaggerJsonFile)) {
        console.error('❌ swagger.json 文件不存在，请先运行 npm run swagger:collect');
        process.exit(1);
    }

    // 提供 swagger.json 文件
    app.get('/swagger.json', (c) => {
        try {
            const content = fs.readFileSync(swaggerJsonFile, 'utf8');
            return c.json(JSON.parse(content));
        } catch (error) {
            console.error('读取 swagger.json 失败:', error);
            return c.json({ error: '无法读取 swagger.json' }, 500);
        }
    });

    // 提供 SwaggerUI 页面
    app.get('/swagger', (c) => {
        const html = generateSwaggerUIHTML('/swagger.json');
        return c.html(html);
    });

    // 根路径重定向到 swagger
    app.get('/', (c) => {
        return c.redirect('/swagger');
    });

    // 健康检查
    app.get('/health', (c) => {
        return c.json({
            status: 'ok',
            service: 'swagger-ui',
            timestamp: new Date().toISOString(),
        });
    });

    return app;
}

/**
 * 启动服务器
 */
function startServer() {
    const app = createSwaggerApp();
    const port = process.env.SWAGGER_PORT || 3001;

    console.log('🚀 启动 Swagger UI 服务...');
    console.log(`📁 文档目录: ${path.join(__dirname, '..', 'docs')}`);

    serve({
        fetch: app.fetch,
        port: port,
    });

    console.log(`✅ Swagger UI 服务已启动!`);
    console.log(`🌐 访问地址:`);
    console.log(`   - SwaggerUI: http://localhost:${port}/swagger`);
    console.log(`   - JSON API: http://localhost:${port}/swagger.json`);
    console.log(`   - 健康检查: http://localhost:${port}/health`);
    console.log('');
    console.log('💡 提示: 在生产环境中，/swagger 路由将返回 404');
    console.log('🛑 按 Ctrl+C 停止服务');
}

// 如果是直接执行脚本
if (require.main === module) {
    startServer();
}

module.exports = { createSwaggerApp, generateSwaggerUIHTML };
