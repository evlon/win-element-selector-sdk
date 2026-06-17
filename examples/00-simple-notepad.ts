/**
 * 简单示例 - 使用记事本测试基础功能
 * 
 * 这个示例使用 Windows 记事本作为测试目标，更加稳定可靠
 */

import { SDK, ElementNotFoundError, delay } from '../src';

async function simpleExample() {
    console.log('=== Element Selector SDK - 简单示例（记事本）===\n');
    
    const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
    
    // 健康检查
    console.log('1. 检查服务状态...');
    const health = await sdk.health();
    console.log(`   ✓ 服务状态: ${health.status}\n`);
    
    const flow = sdk.flow();
    
    try {
        // 激活记事本窗口
        console.log('2. 激活记事本窗口...');
        console.log('   提示: 请先打开一个记事本窗口！\n');
        
        // 使用字符串形式的窗口选择器（支持更灵活的匹配）
        await flow.window('title:记事本');  // 模糊匹配标题
        console.log('   ✓ 窗口已激活\n');
        
        // 等待一下让窗口完全激活
        await delay(500);
        
        // 查找编辑区域
        console.log('3. 查找编辑区域...');
        const editArea = await flow.find('//Edit');
        console.log('   ✓ 找到编辑区域\n');
        
        // 清空并输入文本
        console.log('4. 输入文本...');
        await editArea.type('Hello, Element Selector SDK!', {
            humanize: true,
            charDelay: { min: 30, max: 80 }
        });
        console.log('   ✓ 文本已输入\n');
        
        // 等待查看效果
        console.log('5. 等待 2 秒查看效果...');
        await delay(2000);
        
        // 获取文本内容
        console.log('6. 读取文本内容...');
        const text = await editArea.getText();
        console.log(`   ✓ 当前文本: "${text}"\n`);
        
        console.log('✅ 示例完成！\n');
        console.log('你已成功使用 Element Selector SDK 控制记事本。');
        console.log('\n接下来可以尝试：');
        console.log('  • 修改 XPath 来操作其他应用');
        console.log('  • 查看 01-quick-start.ts - 完整示例');
        console.log('  • 查看 02-advanced-usage.ts - 高级用法');
        
    } catch (error) {
        console.error('\n❌ 发生错误\n');
        
        if (error instanceof ElementNotFoundError) {
            console.error('元素未找到错误:');
            console.error(`   XPath: ${error.context?.xpath || '未知'}`);
            console.error(`   窗口: ${error.context?.windowSelector || '未知'}`);
            console.error('\n可能的原因:');
            console.error('   1. 记事本未打开');
            console.error('   2. 窗口标题不匹配');
            console.error('   3. XPath 表达式不正确');
            console.error('\n建议:');
            console.error('   • 确保已打开记事本应用');
            console.error('   • 检查窗口标题是否包含"记事本"');
            console.error('   • 使用 element-selector GUI 工具获取准确的 XPath');
        } else if (error instanceof Error) {
            console.error('错误类型:', error.constructor.name);
            console.error('错误消息:', error.message);
        }
        
        console.error('\n💡 提示: 请先打开记事本应用后再运行此示例');
        process.exit(1);
    }
}

// 运行示例
simpleExample();
