// sdk/nodejs/src/index.ts
// Element Selector SDK - 命令式 UI 自动化

import { HttpClient } from './client';
import { Flow } from './flow';
import { SDKConfig, DEFAULTS, AutoWaitConfig, LoggingConfig, IdleOptions } from './types';
import { OperationLogger } from './logger';

// ═══════════════════════════════════════════════════════════════════════════════
// SDK 入口
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Element Selector SDK
 * 
 * 企业级 UI 自动化 SDK，支持完整的 TypeScript 控制流。
 * 
 * @example
 * ```typescript
 * import { SDK } from 'element-selector-sdk';
 * 
 * const sdk = new SDK();
 * const flow = sdk.flow();
 * 
 * // 激活窗口
 * await flow.window({ title: '微信' });
 * 
 * // 查找并点击按钮
 * const button = await flow.find("//Button[@Name='发送']");
 * await button.click();
 * 
 * // 条件分支
 * if (await button.isEnabled()) {
 *     await button.click();
 * }
 * 
 * // 循环重试
 * let retry = 0;
 * while (retry < 3) {
 *     try {
 *         const element = await flow.find('//DynamicElement');
 *         await element.click();
 *         break;
 *     } catch (e) {
 *         retry++;
 *         await flow.wait(1000);
 *     }
 * }
 * ```
 */
export class SDK {
    private client: HttpClient;
    private autoWaitConfig: AutoWaitConfig;
    private loggingConfig: LoggingConfig;
    private idleMotionConfig: IdleOptions;  // idle 默认配置
    private operationLogger: OperationLogger;
    
    constructor(config?: Partial<SDKConfig>) {
        this.client = new HttpClient({
            baseUrl: config?.baseUrl ?? DEFAULTS.baseUrl,
            timeout: config?.timeout ?? DEFAULTS.timeout,
        });
        
        // 初始化配置
        this.autoWaitConfig = config?.autoWait ?? DEFAULTS.autoWait;
        this.loggingConfig = config?.logging ?? DEFAULTS.logging;
        this.idleMotionConfig = config?.idleMotion ?? DEFAULTS.idleMotion;
        this.operationLogger = new OperationLogger(this.loggingConfig);
    }
    
    /**
     * 创建自动化流程
     * 
     * @returns Flow 对象，用于执行自动化操作
     */
    flow(): Flow {
        return new Flow(
            this.client, 
            this.autoWaitConfig, 
            this.operationLogger,
            this.idleMotionConfig  // 传递 idle 默认配置
        );
    }
    
    /**
     * 动态更新配置
     * 
     * @param config 部分配置对象
     */
    configure(config: Partial<SDKConfig>): void {
        if (config.autoWait) {
            this.autoWaitConfig = { ...this.autoWaitConfig, ...config.autoWait };
        }
        if (config.logging) {
            this.loggingConfig = { ...this.loggingConfig, ...config.logging };
            this.operationLogger = new OperationLogger(this.loggingConfig);
        }
        if (config.idleMotion) {
            this.idleMotionConfig = { ...this.idleMotionConfig, ...config.idleMotion };
        }
    }
    
    /**
     * 健康检查
     */
    async health() {
        return this.client.health();
    }
    
    /**
     * 获取窗口列表
     */
    async listWindows() {
        return this.client.listWindows();
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 导出
// ═══════════════════════════════════════════════════════════════════════════════

// 类导出（值）
export { Flow } from './flow';
export { Element } from './element';

// 类型导出
export type { ElementInfo, ProfileStats } from './types';
export type { 
    WaitOptions, 
    ClickOptions, 
    TypeOptions, 
    MoveOptions,
    IdleOptions
} from './types';

// 日志相关导出
export { OperationLogger } from './logger';

// 异常相关导出
export {
    SDKError,
    ElementNotFoundError,
    WindowNotFoundError,
    NetworkError,
    TimeoutError,
    ActionFailedError,
    InvalidArgumentError,
    StateError,
    isSDKError,
    isElementNotFoundError,
    isWindowNotFoundError
} from './errors';

export { DEFAULTS } from './types';
export type {
    SDKConfig,
    WindowSelector,
    WindowInfo,
    Point,
    Rect,
} from './types';

// 工具导出
export { buildWindowSelector } from './utils';

// 默认导出
export default SDK;