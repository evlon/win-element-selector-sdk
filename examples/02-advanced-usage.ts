/**
 * 高级用法示例 - 条件分支、循环重试、异常处理
 * 
 * 展示如何使用完整的 TypeScript 控制流编写复杂的自动化脚本
 */

import { SDK, ElementNotFoundError } from '../src';

async function advancedUsage() {
    console.log('=== Element Selector SDK - 高级用法 ===\n');
    
    const sdk = new SDK({ baseUrl: 'http://localhost:8080' });
    const flow = sdk.flow();
    
    // 健康检查
    console.log('1. 健康检查...');
    const health = await sdk.health();
    console.log(`   ✓ 服务状态: ${health.status}\n`);
    
    try {
        // 激活窗口
        console.log('2. 激活窗口...');
        await flow.window({ 
            title: '元宝', 
            className: 'Tauri Window',
            processName: 'yuanbao' 
        });
        console.log('   ✓ 窗口已激活\n');
        
        // ========== 示例 1：条件分支 ==========
        console.log('3. 条件分支示例...');
        const button = await flow.find('//Button[@Name="新建对话"]');
        
        if (await button.isEnabled()) {
            console.log('   ✓ 按钮可用，准备点击');
            await button.click();
            console.log('   ✓ 已点击按钮\n');
        } else {
            console.log('   ⚠ 按钮不可用，跳过点击\n');
        }
        
        // ========== 示例 2：循环重试 ==========
        console.log('4. 循环重试示例...');
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                console.log(`   尝试 ${retryCount + 1}/${maxRetries}...`);
                const input = await flow.find('//Edit[@AutomationId="input-editor"]');
                await input.click();
                console.log('   ✓ 点击成功\n');
                break;  // 成功则退出循环
            } catch (e) {
                retryCount++;
                console.log(`   ⚠ 点击失败，等待后重试...\n`);
                
                if (retryCount >= maxRetries) {
                    throw new Error(`重试 ${maxRetries} 次后仍然失败`);
                }
                
                await flow.wait(1000);  // 等待 1 秒后重试
            }
        }
        
        // ========== 示例 3：等待元素出现 ==========
        console.log('5. 等待元素示例...');
        try {
            // 等待输入框出现（最多等待 5 秒）
            const input = await flow.waitFor('//Edit[@AutomationId="input-editor"]', {
                timeout: 5000
            });
            console.log('   ✓ 输入框已出现\n');
            
            // 输入文本
            await input.type('这是高级用法示例', {
                humanize: true,
                charDelay: { min: 50, max: 150 }
            });
            console.log('   ✓ 已输入文本\n');
            
        } catch (e) {
            console.log('   ⚠ 等待超时，元素未出现\n');
        }
        
        // ========== 示例 4：多个元素操作 ==========
        console.log('6. 多元素操作示例...');
        const elements = await flow.findAll('//Button');
        console.log(`   找到 ${elements.length} 个按钮`);
        
        // 遍历前 3 个按钮
        for (let i = 0; i < Math.min(3, elements.length); i++) {
            const btn = elements[i];
            const text = await btn.getText();
            console.log(`   按钮 ${i + 1}: "${text}"`);
        }
        console.log();
        
        // ========== 示例 5：截图 ==========
        console.log('7. 截图示例...');
        const screenshotPath = await flow.screenshotAuto();
        console.log(`   ✓ 截图保存: ${screenshotPath}\n`);
        
        console.log('✅ 所有高级功能演示完成！\n');
        console.log('这个示例展示了：');
        console.log('  ✓ 条件分支（if/else）');
        console.log('  ✓ 循环重试（while + try/catch）');
        console.log('  ✓ 等待元素（waitFor）');
        console.log('  ✓ 多元素操作（findAll + for 循环）');
        console.log('  ✓ 截图功能（screenshotAuto）');
        
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

// 运行示例
advancedUsage();
