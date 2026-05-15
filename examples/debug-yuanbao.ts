/**
 * 元宝应用调试脚本（优化版）
 * 
 * 使用新的自动等待和日志功能
 */

import { SDK } from '../src';

async function debugYuanbao() {
    console.log('=== 元宝应用调试工具（优化版）===\n');
    
    // 配置自动等待和日志
    const sdk = new SDK({ 
        baseUrl: 'http://localhost:8080',
        autoWait: {
            enabled: true,
            delays: {
                afterFind: 500,
                afterClick: 800,
                afterType: 600,
            }
        },
        logging: {
            enabled: true,
            level: 'info',
            showElementInfo: true,
        }
    });
    
    const flow = sdk.flow();
    
    try {
        // 激活窗口
        await flow.window({ 
            title: '元宝', 
            className: 'Tauri Window',
            processName: 'yuanbao' 
        });
        
        // 查找并点击“新建对话”按钮
        const newChatBtn = await flow.find(
            '//Document[@ControlType="Document" and @AutomationId="RootWebArea" and @FrameworkId="Chrome" and @LocalizedControlType="文档"]/Group[@ControlType="Group" and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat_mainPage__wilLn") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "temp-dialogue-btn_temp-dialogue") and @FrameworkId="Chrome" and @LocalizedControlType="组"]'
        );
        
        await newChatBtn.click();
        
        // 查找并点击输入区域
        const inputArea = await flow.find(
            '//Document[@ControlType="Document" and @AutomationId="RootWebArea" and @FrameworkId="Chrome" and @LocalizedControlType="文档"]/Group[@ControlType="Group" and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat_mainPage__wilLn") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat_chat") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "index_v2_search") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat-command-editor-specail") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and @ClassName="ql-editor ql-blank" and @FrameworkId="Chrome" and @LocalizedControlType="组"]'
        );
        
        await inputArea.click();
        await inputArea.typeText('测试');
        
        // 查找并点击发送按钮
        const sendBtn = await flow.find(
            '//Document[@ControlType="Document" and @AutomationId="RootWebArea" and @FrameworkId="Chrome" and @LocalizedControlType="文档"]/Group[@ControlType="Group" and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat_mainPage__wilLn") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "chat_chat") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and starts-with(@ClassName, "index_v2_search") and @FrameworkId="Chrome" and @LocalizedControlType="组"]/Group[@ControlType="Group" and @AutomationId="yuanbao-send-btn" and starts-with(@ClassName, "SendButton_send") and @FrameworkId="Chrome" and @LocalizedControlType="组"]'
        );
        
        await sendBtn.click();
        
        console.log('\n✓ 所有操作完成!');
        
    } catch (error) {
        console.error('\n❌ 发生错误');
        if (error instanceof Error) {
            console.error(`   错误类型: ${error.constructor.name}`);
            console.error(`   错误消息: ${error.message}`);
        }
        process.exit(1);
    }
}

debugYuanbao();
