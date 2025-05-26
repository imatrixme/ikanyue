#!/bin/bash

echo "🔍 检查项目文档完整性..."
echo "=============================="

# 检查缺失的文档文件
echo -e "\n📋 检查缺失的文档文件:"
echo "------------------------------"

find src -name "*.js" | while read -r jsfile; do
    mdfile="${jsfile}.md"
    
    if [ ! -f "$mdfile" ]; then
        echo "❌ 缺失文档: $mdfile"
    else
        echo "✅ 文档存在: $mdfile"
    fi
done

# 检查过期的文档文件
echo -e "\n⏰ 检查过期的文档文件:"
echo "------------------------------"

find src -name "*.js" | while read -r jsfile; do
    mdfile="${jsfile}.md"
    
    if [ -f "$mdfile" ]; then
        if [ "$jsfile" -nt "$mdfile" ]; then
            echo "⚠️  文档需要更新: $mdfile"
        else
            echo "✅ 文档是最新的: $mdfile"
        fi
    fi
done

# 检查 mermaid 流程图
echo -e "\n🔄 检查 mermaid 流程图:"
echo "------------------------------"

find src -name "*.js.md" | while read -r mdfile; do
    if grep -q "\`\`\`mermaid" "$mdfile"; then
        echo "✅ 包含流程图: $mdfile"
    else
        echo "❌ 缺失流程图: $mdfile"
    fi
done

# 统计信息
echo -e "\n📊 统计信息:"
echo "------------------------------"

total_js=$(find src -name "*.js" | wc -l)
total_docs=$(find src -name "*.js.md" | wc -l)

missing_count=0
while IFS= read -r jsfile; do
    mdfile="${jsfile}.md"
    if [ ! -f "$mdfile" ]; then
        missing_count=$((missing_count + 1))
    fi
done < <(find src -name "*.js")

outdated_count=0
while IFS= read -r jsfile; do
    mdfile="${jsfile}.md"
    if [ -f "$mdfile" ] && [ "$jsfile" -nt "$mdfile" ]; then
        outdated_count=$((outdated_count + 1))
    fi
done < <(find src -name "*.js")

mermaid_missing_count=0
while IFS= read -r mdfile; do
    if ! grep -q "\`\`\`mermaid" "$mdfile"; then
        mermaid_missing_count=$((mermaid_missing_count + 1))
    fi
done < <(find src -name "*.js.md")

echo "总 JS 文件数量: $total_js"
echo "总文档文件数量: $total_docs"
echo "缺失文档数量: $missing_count"
echo "过期文档数量: $outdated_count"
echo "缺失流程图数量: $mermaid_missing_count"

# 建议
echo -e "\n💡 建议:"
echo "------------------------------"

if [ "$missing_count" -gt 0 ]; then
    echo "• 为缺失的 JS 文件创建对应的文档文件"
    echo "• 参考现有文档模板: src/middleware/response.js.md"
fi

if [ "$outdated_count" -gt 0 ]; then
    echo "• 更新过期的文档文件，确保与代码同步"
    echo "• 在更新历史中记录本次修改"
fi

if [ "$mermaid_missing_count" -gt 0 ]; then
    echo "• 为缺失流程图的文档添加 mermaid 图表"
    echo "• 参考示例: src/routes/user/login.js.md 中的登录流程图"
fi

if [ "$missing_count" -eq 0 ] && [ "$outdated_count" -eq 0 ] && [ "$mermaid_missing_count" -eq 0 ]; then
    echo "🎉 所有文档都是完整且最新的，包含必要的流程图！"
fi

echo -e "\n📋 项目文档规范:"
echo "------------------------------"
echo "• 每个 .js 文件都应有对应的 .js.md 文档"
echo "• 所有文档必须包含 mermaid 流程图"
echo "• 修改代码前先阅读文档，修改后更新文档"
echo "• 参考 .cursor/rules/ 中的开发规范"
echo "• 使用标准化的文档模板"

echo -e "\n✨ 检查完成！" 