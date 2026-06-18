/**
 * 快速开始示例 - 最基础的命令式 API 用法
 * 
 * 这个示例展示了如何使用新的命令式 API 进行简单的 UI 自动化
 */

import { SDK, ElementNotFoundError, delay } from '../src';

async function quickStart() {
    console.log('=== Element Selector SDK - 快速开始 ===\n');
    
    // 1. 创建 SDK 实例
    const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
    
    // 2. 健康检查
    console.log('1. 检查服务状态...');
    const health = await sdk.health();
    console.log(`   ✓ 服务状态: ${health.status}\n`);
    
    // 3. 创建自动化流程
    const flow = sdk.flow();
    
    try {
        // 4. 激活窗口
        console.log('2. 激活窗口...');
        await flow.window({ 
            title: '元宝', 
            className: 'Tauri Window',
            processName: 'yuanbao' 
        });
        console.log('   ✓ 窗口已激活\n');
        
        // 5. 查找元素
        console.log('3. 查找按钮...');
        
        // 注意：这里的 XPath 需要根据你的实际应用调整
        // 建议使用 element-selector GUI 工具获取准确的 XPath
        const button = await flow.find('//Button[@Name="新建对话"]');
        
        // 检查按钮是否找到并可用
        const text = await button.getText();
        console.log(`   ✓ 找到按钮: "${text || '(空文本)'}"\n`);
        
        // 6. 点击按钮
        console.log('4. 点击按钮...');
        try {
            await button.click();
            console.log('   ✓ 已点击\n');
        } catch (clickError) {
            console.log('   ⚠ 点击失败，尝试使用替代方法...\n');
            // 如果直接点击失败，可以尝试其他方式
            throw clickError;
        }
        
        // 7. 等待页面加载
        console.log('5. 等待页面加载...');
        await delay(2000);
        
        // 8. 查找输入框并输入文本
        console.log('6. 输入文本...');
        
        // 同样，XPath 需要根据实际应用调整
        const input = await flow.find('//Edit[@AutomationId="input-editor"]');
        
        await input.type('你好，世界！', {
            humanize: true,  // 拟人化输入
            charDelay: { min: 50, max: 150 }  // 字符间隔
        });
        console.log('   ✓ 已输入文本\n');
        
        console.log('✅ 所有操作成功完成！\n');
        console.log('恭喜！你已经完成了第一个自动化脚本。');
        console.log('\n接下来可以尝试：');
        console.log('  • 查看 examples/test-imperative-api.ts - 高级用法示例');
        console.log('  • 阅读 docs/MIGRATION_GUIDE.md - 详细的 API 文档');
        console.log('  • 阅读 docs/ELEMENT_XPATH.md - Element.xpath 用法');
        
    } catch (error) {
        console.error('\n❌ 发生错误\n');
        
        if (error instanceof ElementNotFoundError) {
            console.error('元素未找到错误:');
            console.error(`   XPath: ${error.context?.xpath || '未知'}`);
            console.error(`   窗口: ${error.context?.windowSelector || '未知'}`);
            console.error('\n可能的原因:');
            console.error('   1. 目标应用程序未运行');
            console.error('   2. XPath 表达式不正确');
            console.error('   3. 元素尚未加载完成');
            console.error('\n建议:');
            console.error('   • 使用 element-selector GUI 工具获取准确的 XPath');
            console.error('   • 检查目标应用是否正在运行');
            console.error('   • 尝试增加等待时间或使用 waitFor() 方法');
        } else if (error instanceof Error) {
            console.error('错误类型:', error.constructor.name);
            console.error('错误消息:', error.message);
            console.error('\n堆栈跟踪:');
            console.error(error.stack);
        }
        
        console.error('\n💡 提示: 查看 docs/MIGRATION_GUIDE.md 了解更多错误处理最佳实践');
        process.exit(1);
    }
}

// 运行示例
quickStart();
