/**
 * 响应格式化中间件
 * 与原项目的 data.js 和 error.js 保持一致
 */
function responseMiddleware() {
    return async (c, next) => {
        // 添加成功响应方法 - 对应原项目的 res.data()
        c.data = (optionalData = null, message = null) => {
            const result = {
                code: 10000,
                message: message,
                data: optionalData,
            };
            return c.json(result, 200);
        };

        // 添加错误响应方法 - 对应原项目的 res.error()
        c.error = (code = 400, msg = '') => {
            const xcode = parseInt(code || 400);
            const result = {
                code: xcode,
                message: msg || '',
                data: null,
            };

            // 与原项目保持一致，Web 请求始终返回 200 状态码
            return c.json(result, 200);
        };

        // 为了向后兼容，保留 success 方法
        c.success = (data = null, message = null) => {
            return c.data(data, message);
        };

        await next();
    };
}

module.exports = { responseMiddleware };
