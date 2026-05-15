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


        const newChatBtn = await flow.find(`//Document[@ControlType='Document' and @AutomationId='RootWebArea' and @FrameworkId='Chrome' and @LocalizedControlType='文档']/Group[@ControlType='Group' and @FrameworkId='Chrome' and @LocalizedControlType='组']/Group[@ControlType='Group' and starts-with(@ClassName, 'chat_mainPage__wilLn') and @FrameworkId='Chrome' and @LocalizedControlType='组']/Group[@ControlType='Group' and starts-with(@ClassName, 'temp-dialogue-btn_temp-dialogue') and @FrameworkId='Chrome' and @LocalizedControlType='组']`);
        if(newChatBtn){
            console.log('   ✓ 找到"新建对话"按钮!\n');
            await flow.wait(1000);

            await newChatBtn.click();
        }
        else{
            console.log('   ✗ 未找到"新建对话"按钮\n');
        }
        

               
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
