/**
 * 通用路由构建器
 * 提供链式 API 来定义路由、中间件和处理器
 */

class RouteBuilder {
    constructor(app, method, path, inheritedMiddlewares = []) {
        this.app = app;
        this.method = method;
        this.path = path;
        this.middlewares = [...inheritedMiddlewares]; // 继承的中间件
        this.handlerFunc = null; // 改名避免与方法冲突
    }

    /**
     * 设置路由处理器
     * @param {Function} handlerFunc 路由处理函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    handler(handlerFunc) {
        this.handlerFunc = handlerFunc;
        return this;
    }

    /**
     * 添加中间件
     * @param {...Function} middlewareFuncs 中间件函数或中间件工厂函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    use(...middlewareFuncs) {
        // 智能处理中间件函数和工厂函数
        const processedMiddlewares = middlewareFuncs.map((mw) => {
            // 如果是函数且返回函数，则认为是工厂函数，需要调用
            if (typeof mw === 'function') {
                try {
                    const result = mw();
                    // 如果调用结果是函数，说明是工厂函数
                    if (typeof result === 'function') {
                        return result;
                    } else {
                        // 否则原函数就是中间件
                        return mw;
                    }
                } catch (e) {
                    // 如果调用出错，说明原函数就是中间件
                    return mw;
                }
            }
            return mw;
        });

        this.middlewares.push(...processedMiddlewares);
        return this;
    }

    /**
     * 添加中间件（别名方法）
     * @param {...Function} middlewareFuncs 中间件函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    middleware(...middlewareFuncs) {
        return this.use(...middlewareFuncs);
    }

    /**
     * 添加中间件（别名方法）
     * @param {...Function} middlewareFuncs 中间件函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    middlewares(...middlewareFuncs) {
        return this.use(...middlewareFuncs);
    }

    /**
     * 构建并注册路由
     * 如果没有显式调用 build()，会在下次路由定义时自动构建
     */
    build() {
        if (!this.handlerFunc) {
            throw new Error(`路由 ${this.method.toUpperCase()} ${this.path} 缺少处理器`);
        }

        // 组合所有中间件和处理器
        const allHandlers = [...this.middlewares, this.handlerFunc];

        // 注册到 Hono 应用
        this.app[this.method](this.path, ...allHandlers);

        // 重置状态以便重用
        this.middlewares = [];
        this.handlerFunc = null;

        return this;
    }

    /**
     * 条件中间件 - 只有当条件为真时才添加中间件
     * @param {boolean} condition 条件
     * @param {...Function} middlewareFuncs 中间件函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    when(condition, ...middlewareFuncs) {
        if (condition) {
            this.middlewares.push(...middlewareFuncs);
        }
        return this;
    }

    /**
     * 分组中间件 - 为一组路由添加相同的中间件
     * @param {...Function} middlewareFuncs 中间件函数
     * @returns {RouteBuilder} 返回自身以支持链式调用
     */
    group(...middlewareFuncs) {
        this.middlewares.push(...middlewareFuncs);
        return this;
    }
}

/**
 * 路由构建器工厂类
 */
class RouteFactory {
    constructor(app, inheritedMiddlewares = []) {
        this.app = app;
        this.inheritedMiddlewares = [...inheritedMiddlewares]; // 继承的中间件
        this.groupMiddlewares = []; // 当前group的中间件
        this.currentBuilder = null;
    }

    /**
     * 为当前group添加中间件
     * @param {...Function} middlewareFuncs 中间件函数
     * @returns {RouteFactory} 返回新的factory实例以支持链式调用
     */
    use(...middlewareFuncs) {
        // 完成当前未构建的路由
        if (this.currentBuilder) {
            this.currentBuilder.build();
            this.currentBuilder = null;
        }

        // 智能处理中间件函数和工厂函数
        const processedMiddlewares = middlewareFuncs.map((mw) => {
            if (typeof mw === 'function') {
                try {
                    const result = mw();
                    if (typeof result === 'function') {
                        return result;
                    } else {
                        return mw;
                    }
                } catch (e) {
                    return mw;
                }
            }
            return mw;
        });

        // 创建新的factory实例，继承当前所有中间件加上新的中间件
        const newFactory = new RouteFactory(this.app, [...this.getAllInheritedMiddlewares(), ...processedMiddlewares]);

        return newFactory;
    }

    /**
     * 获取所有继承的中间件（包括全局和group级别）
     * @returns {Array} 中间件数组
     */
    getAllInheritedMiddlewares() {
        return [...this.inheritedMiddlewares, ...this.groupMiddlewares];
    }

    /**
     * 创建路由构建器的通用方法
     * @param {string} method HTTP 方法
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    createRoute(method, path) {
        // 如果有未完成的路由构建器，先构建它
        if (this.currentBuilder) {
            this.currentBuilder.build();
        }

        // 创建新的路由构建器，传入所有继承的中间件
        this.currentBuilder = new RouteBuilder(this.app, method, path, this.getAllInheritedMiddlewares());

        return this.currentBuilder;
    }

    /**
     * GET 路由
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    get(path) {
        return this.createRoute('get', path);
    }

    /**
     * POST 路由
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    post(path) {
        return this.createRoute('post', path);
    }

    /**
     * PUT 路由
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    put(path) {
        return this.createRoute('put', path);
    }

    /**
     * DELETE 路由
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    delete(path) {
        return this.createRoute('delete', path);
    }

    /**
     * PATCH 路由
     * @param {string} path 路由路径
     * @returns {RouteBuilder} 路由构建器实例
     */
    patch(path) {
        return this.createRoute('patch', path);
    }

    /**
     * 完成所有未构建的路由
     */
    finalize() {
        if (this.currentBuilder) {
            this.currentBuilder.build();
            this.currentBuilder = null;
        }
    }

    /**
     * 创建路由组
     * @param {string} prefix 路由前缀
     * @param {Function} callback 回调函数
     * @returns {RouteFactory} 返回自身以支持链式调用
     */
    group(prefix, callback) {
        // 完成当前未构建的路由
        if (this.currentBuilder) {
            this.currentBuilder.build();
            this.currentBuilder = null;
        }

        // 创建新的group factory，继承当前的所有中间件
        const groupFactory = new RouteFactory(this.app, this.getAllInheritedMiddlewares());

        // 创建代理对象，自动添加前缀
        const proxy = new Proxy(groupFactory, {
            get(target, prop) {
                if (['get', 'post', 'put', 'delete', 'patch'].includes(prop)) {
                    return (path) => target.createRoute(prop, prefix + path);
                }
                return target[prop];
            },
        });

        // 为proxy添加when方法支持
        proxy.when = (condition, ...middlewareFuncs) => {
            if (condition) {
                groupFactory.use(...middlewareFuncs);
            }
            return proxy;
        };

        callback(proxy);
        groupFactory.finalize();

        return this;
    }
}

/**
 * 为 Hono 应用添加路由构建器扩展
 * @param {*} app Hono 应用实例
 * @param {...Function} globalMiddlewares 全局中间件
 * @returns {RouteFactory} 路由工厂实例
 */
function createRouteBuilder(app, ...globalMiddlewares) {
    const factory = new RouteFactory(app);
    if (globalMiddlewares.length > 0) {
        factory.use(...globalMiddlewares);
    }
    return factory;
}

module.exports = {
    RouteBuilder,
    RouteFactory,
    createRouteBuilder,
};
