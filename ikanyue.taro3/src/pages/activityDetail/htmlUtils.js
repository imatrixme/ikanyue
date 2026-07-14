/**
 * HTML处理工具函数集合
 */

import { themeColors } from '../../styles/theme.mjs';

/**
 * 将HTML内容转换为小程序rich-text组件可用的格式
 * @param {string} html - HTML内容
 * @returns {string} 处理后的HTML字符串
 */
export function getSafeHtml(html) {
    if (!html) return '';

    try {
        // 处理HTML，使其适合小程序rich-text组件使用
        let content = html
            .replace(/<img([^>]*)>/gi, '<img$1 />')
            .replace(/<br>/gi, '<br />')
            .replace(/<hr>/gi, '<hr />');

        // 移除脚本和样式标签
        content = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

        // 处理不安全属性
        content = content
            .replace(/onclick=/gi, 'data-click=')
            .replace(/onerror=/gi, 'data-error=')
            .replace(/<iframe[^>]*>.*?<\/iframe>/gi, '')
            .replace(/<audio[^>]*>.*?<\/audio>/gi, '')
            .replace(/<video[^>]*>.*?<\/video>/gi, '');

        // 添加样式
        content = content
            .replace(/<p([^>]*)>/gi, '<p$1 style="margin-bottom:12px;">')
            .replace(/<img([^>]*?)(?:\s*\/)?>/gi, '<img$1 style="max-width:100%;height:auto;margin:10px 0;" />')
            .replace(/<a([^>]*)>/gi, `<a$1 style="color:${themeColors.primaryStrong};text-decoration:underline;">`)
            .replace(/<h1([^>]*)>/gi, '<h1$1 style="font-size:20px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<h2([^>]*)>/gi, '<h2$1 style="font-size:18px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<h3([^>]*)>/gi, '<h3$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<h4([^>]*)>/gi, '<h4$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<h5([^>]*)>/gi, '<h5$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<h6([^>]*)>/gi, '<h6$1 style="font-size:16px;font-weight:bold;margin:16px 0 8px 0;">')
            .replace(/<ul([^>]*)>/gi, '<ul$1 style="padding-left:20px;margin-bottom:16px;">')
            .replace(/<ol([^>]*)>/gi, '<ol$1 style="padding-left:20px;margin-bottom:16px;">')
            .replace(/<li([^>]*)>/gi, '<li$1 style="margin-bottom:6px;">');

        // 修复未闭合标签
        const openTagsCount = {
            p: (content.match(/<p[^>]*>/gi) || []).length,
            pClose: (content.match(/<\/p>/gi) || []).length,
            div: (content.match(/<div[^>]*>/gi) || []).length,
            divClose: (content.match(/<\/div>/gi) || []).length,
            span: (content.match(/<span[^>]*>/gi) || []).length,
            spanClose: (content.match(/<\/span>/gi) || []).length,
        };

        // 自动补全未闭合的标签
        if (openTagsCount.p > openTagsCount.pClose) {
            content += '</p>'.repeat(openTagsCount.p - openTagsCount.pClose);
        }
        if (openTagsCount.div > openTagsCount.divClose) {
            content += '</div>'.repeat(openTagsCount.div - openTagsCount.divClose);
        }
        if (openTagsCount.span > openTagsCount.spanClose) {
            content += '</span>'.repeat(openTagsCount.span - openTagsCount.spanClose);
        }

        return content;
    } catch (e) {
        console.error('处理HTML内容出错:', e);
        return htmlToText(html);
    }
}

/**
 * 将HTML内容转换为纯文本
 * @param {string} html - HTML内容
 * @returns {string} 转换后的纯文本
 */
export function htmlToText(html) {
    if (!html) return '';
    if (typeof html !== 'string') return '';

    try {
        // 替换换行标签为特殊标记
        let text = html.replace(/<br\s*\/?>/gi, '\n');

        // 替换段落和div标签为特殊标记
        text = text.replace(/<\/p>/gi, '\n');
        text = text.replace(/<\/div>/gi, '\n');

        // 替换列表项为特殊标记
        text = text.replace(/<li>/gi, '• ');
        text = text.replace(/<\/li>/gi, '\n');

        // 去除其他所有HTML标签
        text = text.replace(/<[^>]*>/g, '');

        // 解码HTML实体
        text = text.replace(/&nbsp;/g, ' ');
        text = text.replace(/&lt;/g, '<');
        text = text.replace(/&gt;/g, '>');
        text = text.replace(/&amp;/g, '&');
        text = text.replace(/&quot;/g, '"');
        text = text.replace(/&#39;/g, "'");

        // 清理多余的换行符
        text = text.replace(/\n\s*\n/g, '\n\n');
        text = text.trim();

        return text;
    } catch (e) {
        console.error('HTML转纯文本出错:', e);
        // 降级处理：直接删除所有HTML标签
        return html.replace(/<[^>]*>/g, '');
    }
}
