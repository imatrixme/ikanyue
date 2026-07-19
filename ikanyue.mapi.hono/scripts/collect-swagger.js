#!/usr/bin/env node

/**
 * Swagger 文档收集脚本
 * 自动收集所有 .swagger.json 文件并合并为统一的 OpenAPI 文档
 */

const fs = require('fs');
const path = require('path');

/**
 * 递归查找指定目录下的所有 .swagger.json 文件
 * @param {string} dir - 搜索目录
 * @param {array} fileList - 文件列表
 * @returns {array} swagger 文件路径列表
 */
function findSwaggerFiles(dir, fileList = []) {
    const files = fs.readdirSync(dir);

    files.forEach((file) => {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            findSwaggerFiles(filePath, fileList);
        } else if (file.endsWith('.swagger.json')) {
            fileList.push(filePath);
        }
    });

    return fileList;
}

/**
 * 读取并解析 swagger 文件
 * @param {string} filePath - 文件路径
 * @returns {object|null} 解析后的 swagger 对象
 */
function readSwaggerFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const swagger = JSON.parse(content);
        console.log(`✓ 已加载: ${filePath}`);
        return swagger;
    } catch (error) {
        console.error(`✗ 加载失败: ${filePath}`, error.message);
        return null;
    }
}

/**
 * 合并多个 swagger 文档
 * @param {array} swaggerDocs - swagger 文档数组
 * @returns {object} 合并后的文档
 */
function mergeSwaggerDocs(swaggerDocs) {
    if (swaggerDocs.length === 0) {
        console.warn('⚠️ 没有找到有效的 swagger 文档');
        return null;
    }

    const mergedDoc = {
        openapi: '3.0.0',
        info: {
            title: 'ikanyue-hono API Documentation',
            version: '1.0.0',
            description: '看岳教育 Hono API 接口文档 - 自动生成',
            contact: {
                name: 'ikanyue-hono',
                url: 'https://github.com/ikanyue/ikanyue.mapi.hono',
            },
        },
        servers: [
            {
                url: 'http://localhost:1337',
                description: '开发环境',
            },
            {
                url: 'https://api.ikanyue.com',
                description: '生产环境',
            },
        ],
        paths: {},
        components: {
            schemas: {},
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'JWT 认证令牌',
                },
            },
        },
        tags: [
            {
                name: 'Activity',
                description: '活动管理接口',
            },
            {
                name: 'User',
                description: '用户管理接口',
            },
            {
                name: 'AudioMaterial',
                description: '音频材料接口',
            },
            {
                name: 'VideoMaterial',
                description: '视频材料接口',
            },
            {
                name: 'Student',
                description: '学生管理接口',
            },
            {
                name: 'Teacher',
                description: '教师管理接口',
            },
        ],
    };

    // 合并所有文档的 paths
    swaggerDocs.forEach((doc) => {
        if (doc && doc.paths) {
            Object.entries(doc.paths).forEach(([pathname, operations]) => {
                mergedDoc.paths[pathname] = {
                    ...(mergedDoc.paths[pathname] || {}),
                    ...operations,
                };
            });
        }

        // 合并全部可复用 components，避免 parameters/responses 等引用丢失。
        if (doc && doc.components) {
            Object.entries(doc.components).forEach(([type, values]) => {
                if (!values || typeof values !== 'object') return;
                mergedDoc.components[type] = mergedDoc.components[type] || {};
                Object.assign(mergedDoc.components[type], values);
            });
        }
    });

    return mergedDoc;
}

/**
 * 主函数
 */
function main() {
    console.log('🚀 开始收集 Swagger 文档...\n');

    const srcDir = path.join(__dirname, '..', 'src', 'routes');
    const outputDir = path.join(__dirname, '..', 'docs');
    const outputFile = path.join(outputDir, 'swagger.json');

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`📁 创建输出目录: ${outputDir}`);
    }

    // 查找所有 swagger 文件
    console.log(`🔍 搜索目录: ${srcDir}`);
    const swaggerFiles = findSwaggerFiles(srcDir);

    if (swaggerFiles.length === 0) {
        console.log('⚠️ 没有找到任何 .swagger.json 文件');
        return;
    }

    console.log(`\n📋 找到 ${swaggerFiles.length} 个 swagger 文件:`);
    swaggerFiles.forEach((file) => console.log(`   - ${file}`));

    // 读取并解析所有文件
    console.log('\n📖 读取 swagger 文件:');
    const swaggerDocs = swaggerFiles.map(readSwaggerFile).filter((doc) => doc !== null);

    // 合并文档
    console.log('\n🔗 合并 swagger 文档...');
    const mergedDoc = mergeSwaggerDocs(swaggerDocs);

    if (!mergedDoc) {
        console.error('❌ 合并失败，没有有效的文档');
        process.exit(1);
    }

    // 写入输出文件
    try {
        fs.writeFileSync(outputFile, JSON.stringify(mergedDoc, null, 2), 'utf8');
        console.log(`✅ 合并完成! 输出文件: ${outputFile}`);
        console.log(`📊 统计信息:`);
        console.log(`   - 接口数量: ${Object.keys(mergedDoc.paths).length}`);
        console.log(`   - Schema 数量: ${Object.keys(mergedDoc.components.schemas).length}`);
        console.log(`   - 标签数量: ${mergedDoc.tags.length}`);
    } catch (error) {
        console.error('❌ 写入文件失败:', error.message);
        process.exit(1);
    }
}

// 如果是直接执行脚本
if (require.main === module) {
    main();
}

module.exports = { findSwaggerFiles, mergeSwaggerDocs };
