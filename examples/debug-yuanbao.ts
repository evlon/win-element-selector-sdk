/**
 * 元宝应用调试脚本
 * 
 * 这个脚本帮助你诊断元宝应用的问题
 */

import { SDK } from '../src';

async function debugYuanbao() {
    console.log('=== 元宝应用调试工具 ===\n');
    
    const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
    
    // 健康检查
    console.log('1. 检查服务状态...');
    const health = await sdk.health();
    console.log(`   ✓ 服务状态: ${health.status}\n`);
    
    const flow = sdk.flow();
    
    try {
        // 激活窗口
        console.log('2. 激活元宝窗口...');
        await flow.window({ 
            title: '元宝', 
            className: 'Tauri Window',
            processName: 'yuanbao' 
        });
        console.log('   ✓ 窗口已激活\n');
        
        // 等待一下
        await flow.wait(1000);
        
        // 尝试不同的 XPath 来查找"新建对话"按钮
        console.log('3. 尝试查找"新建对话"按钮...\n');
        
        const xpaths = [
            '//Button[@Name="新建对话"]',
            '//Button[contains(@Name, "新建")]',
            '//Button[contains(@Name, "对话")]',
            '//*[@Name="新建对话"]',
            '//Group[starts-with(@ClassName, "temp-dialogue-btn")]',
        ];
        
        for (const xpath of xpaths) {
            console.log(`   尝试 XPath: ${xpath}`);
            try {
                const element = await flow.find(xpath);
                const text = await element.getText();
                const enabled = await element.isEnabled();
                const visible = await element.isVisible();
                
                console.log(`   ✓ 找到元素!`);
                console.log(`     - 文本: "${text || '(空)'}"`);
                console.log(`     - 可用: ${enabled}`);
                console.log(`     - 可见: ${visible}`);
                console.log();
                
                // 如果找到可用的元素，尝试点击
                if (enabled && visible) {
                    console.log('   尝试点击...');
                    try {
                        await element.click();
                        console.log('   ✓ 点击成功!\n');
                        
                        // 等待一下看效果
                        console.log('   等待 2 秒观察效果...');
                        await flow.wait(2000);
                        
                        return; // 成功后退出
                    } catch (clickError) {
                        console.log(`   ✗ 点击失败: ${clickError instanceof Error ? clickError.message : '未知错误'}\n`);
                    }
                } else {
                    console.log('   ⚠ 元素不可用或不可见，跳过点击\n');
                }
            } catch (e) {
                console.log(`   ✗ 未找到元素\n`);
            }
        }
        
        console.log('4. 获取窗口中的所有按钮...\n');
        try {
            const buttons = await flow.findAll('//Button');
            console.log(`   找到 ${buttons.length} 个按钮:\n`);
            
            for (let i = 0; i < Math.min(10, buttons.length); i++) {
                const btn = buttons[i];
                const text = await btn.getText();
                const enabled = await btn.isEnabled();
                console.log(`   ${i + 1}. "${text || '(空文本)'}" - 可用: ${enabled}`);
            }
            
            if (buttons.length > 10) {
                console.log(`   ... 还有 ${buttons.length - 10} 个按钮`);
            }
            console.log();
        } catch (e) {
            console.log(`   ✗ 无法获取按钮列表: ${e instanceof Error ? e.message : '未知错误'}\n`);
        }
        
        console.log('5. 建议的下一步:\n');
        console.log('   • 使用 element-selector GUI 工具捕获准确的 XPath');
        console.log('   • 运行: cargo run --bin element-selector (在 win-element-selector-rs 项目中)');
        console.log('   • 或者尝试其他 XPath 表达式');
        console.log();
        
    } catch (error) {
        console.error('\n❌ 发生错误');
        if (error instanceof Error) {
            console.error(`   错误类型: ${error.constructor.name}`);
            console.error(`   错误消息: ${error.message}`);
            console.error(`   堆栈跟踪:`);
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// 运行调试
debugYuanbao();
