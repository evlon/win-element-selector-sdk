/**
 * 命令式 API 完整示例
 * 
 * 展示如何使用新的 Element 和 Flow API 进行 UI 自动化
 * 包括：条件分支、循环重试、异常处理等高级用法
 */

import { SDK, ElementNotFoundError } from '../src';

async function imperativeApiExample() {
    console.log('=== 命令式 API 示例 ===\n');
    
    const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
    const flow = sdk.flow();
    
    // 健康检查
    console.log('1. 健康检查...');
    const health = await sdk.health();
    console.log(`   服务状态: ${health.status}\n`);
    
    try {
        // 激活窗口
        console.log('2. 激活窗口...');
        await flow.window({ 
            title: '元宝', 
            className: 'Tauri Window',
            processName: 'yuanbao' 
        });
        console.log('   ✓ 窗口已激活\n');
        
        // 查找元素
        console.log('3. 查找新建对话按钮...');
        const newChatBtn = await flow.find('//Button[@Name="新建对话"]');
        console.log(`   ✓ 找到按钮: ${await newChatBtn.getText()}\n`);
        
        // 条件分支 - 检查按钮是否可用
        console.log('4. 检查按钮状态...');
        if (await newChatBtn.isEnabled()) {
            console.log('   ✓ 按钮可用\n');
        } else {
            console.log('   ⚠ 按钮不可用\n');
        }
        
        // 点击按钮
        console.log('5. 点击按钮...');
        await newChatBtn.click();
        console.log('   ✓ 已点击\n');
        
        // 等待页面加载
        console.log('6. 等待页面加载...');
        await flow.wait(2000);
        
        // 查找输入框
        console.log('7. 查找输入框...');
        const inputBox = await flow.find('//Edit[@AutomationId="input-editor"]');
        console.log('   ✓ 找到输入框\n');
        
        // 循环重试示例
        console.log('8. 尝试点击输入框（带重试）...');
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                await inputBox.click();
                console.log(`   ✓ 点击成功（尝试 ${retryCount + 1} 次）\n`);
                break;
            } catch (e) {
                retryCount++;
                console.log(`   ⚠ 点击失败，重试 ${retryCount}/${maxRetries}`);
                if (retryCount >= maxRetries) {
                    throw e;
                }
                await flow.wait(1000);
            }
        }
        
        // 输入文本
        console.log('9. 输入文本...');
        await inputBox.type('你好，这是命令式 API 测试', {
            humanize: true,
            charDelay: { min: 50, max: 150 }
        });
        console.log('   ✓ 已输入文本\n');
        
        // 截图
        console.log('10. 截图...');
        const screenshotPath = await flow.screenshotAuto();
        console.log(`   ✓ 截图保存: ${screenshotPath}\n`);
        
        console.log('✅ 所有操作成功完成\n');
        console.log('这个示例展示了：');
        console.log('  ✓ 使用 async/await');
        console.log('  ✓ 条件分支（if/else）');
        console.log('  ✓ 循环重试（while）');
        console.log('  ✓ 异常处理（try/catch）');
        console.log('  ✓ Element 对象方法调用');
        
    } catch (error) {
        if (error instanceof ElementNotFoundError) {
            console.error('\n❌ 元素未找到');
            console.error(`   XPath: ${error.context?.xpath}`);
            console.error(`   窗口: ${error.context?.windowSelector}`);
        } else if (error instanceof Error) {
            console.error('\n❌ 发生错误:', error.message);
            console.error(error.stack);
        }
        process.exit(1);
    }
}

imperativeApiExample();
