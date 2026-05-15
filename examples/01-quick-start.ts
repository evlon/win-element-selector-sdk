/**
 * 快速开始示例 - 最基础的命令式 API 用法
 * 
 * 这个示例展示了如何使用新的命令式 API 进行简单的 UI 自动化
 */

import { SDK, ElementNotFoundError } from '../src';

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
        const button = await flow.find('//Button[@Name="新建对话"]');
        console.log(`   ✓ 找到按钮: "${await button.getText()}"\n`);
        
        // 6. 点击按钮
        console.log('4. 点击按钮...');
        await button.click();
        console.log('   ✓ 已点击\n');
        
        // 7. 等待页面加载
        console.log('5. 等待页面加载...');
        await flow.wait(2000);
        
        // 8. 查找输入框并输入文本
        console.log('6. 输入文本...');
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
        console.log('  • 阅读 MIGRATION_GUIDE.md - 详细的 API 文档');
        
    } catch (error) {
        if (error instanceof ElementNotFoundError) {
            console.error('\n❌ 元素未找到');
            console.error(`   XPath: ${error.context?.xpath}`);
            console.error(`   提示: 请确保目标应用程序正在运行`);
        } else if (error instanceof Error) {
            console.error('\n❌ 发生错误:', error.message);
        }
        process.exit(1);
    }
}

// 运行示例
quickStart();
