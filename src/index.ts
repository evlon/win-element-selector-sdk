// sdk/nodejs/src/index.ts
// Element Selector SDK - 命令式 UI 自动化

import { HttpClient } from './client';
import { Flow } from './flow';
import { SDKConfig, DEFAULTS, AutoWaitConfig, LoggingConfig, IdleOptions, CacheTime, FindOptions } from './types';
import { OperationLogger } from './logger';
import { loadConfig, deepMerge } from './config';
import { setSpeedFactor } from './sleep';

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
        // 1. 加载配置文件（当前目录 → 用户主目录），不存在时自动生成
        const fileConfig = loadConfig();

        // 2. 合并优先级：config 参数 > .flow.json5 > DEFAULTS
        const autoWait = deepMerge(DEFAULTS.autoWait, fileConfig.autoWait, config?.autoWait);
        const logging = deepMerge(DEFAULTS.logging, fileConfig.logging, config?.logging);
        const idleMotion = deepMerge(DEFAULTS.idleMotion, fileConfig.idleMotion, config?.idleMotion);

        const merged: SDKConfig = {
            baseUrl: config?.baseUrl ?? fileConfig.baseUrl ?? DEFAULTS.baseUrl,
            timeout: config?.timeout ?? fileConfig.timeout ?? DEFAULTS.timeout,
            autoWait: { ...DEFAULTS.autoWait, ...autoWait } as AutoWaitConfig,
            logging: { ...DEFAULTS.logging, ...logging } as LoggingConfig,
            idleMotion: { ...DEFAULTS.idleMotion, ...idleMotion } as IdleOptions,
            scroll: deepMerge(DEFAULTS.scroll, fileConfig.scroll, config?.scroll),
            speedFactor: config?.speedFactor ?? fileConfig.speedFactor ?? DEFAULTS.speedFactor,
            cacheTime: config?.cacheTime ?? (fileConfig as any).cacheTime ?? null,
        };

        // 3. 设置全局速度因子
        setSpeedFactor(merged.speedFactor!);

        // 4. 创建 HttpClient
        this.client = new HttpClient({
            baseUrl: merged.baseUrl,
            timeout: merged.timeout,
        });

        // 5. 初始化配置
        this.autoWaitConfig = merged.autoWait as AutoWaitConfig;
        this.loggingConfig = merged.logging as LoggingConfig;
        this.idleMotionConfig = merged.idleMotion as IdleOptions;
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
        if (config.speedFactor !== undefined) {
            setSpeedFactor(config.speedFactor);
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
export type { ElementInfo, ElementList, ProfileStats, CacheTime, FindOptions } from './types';
export type {
    WaitOptions,
    ClickOptions,
    TypeOptions,
    MoveOptions,
    IdleOptions,
    ScrollOptions,
    ScrollResult,
    ScrollToVisibleOptions,
    ScrollDetectResult,
    ScrollDetectElementChange,
    ScrollDetectDirection,
    ElementVisibilityResult,
    InspectNodeInfo,
    InspectRequest,
    InspectResponse,
    FlatInspectNodeInfo,
    InspectFilter,
    InspectOptions,
    InspectRegion,
    InspectRegionFilter,
    RefreshByRuntimeIdRequest,
    RefreshByRuntimeIdResponse,
    CacheConfigRequest,
    CacheStatsResponse,
    FindFromElementRequest,
    FindFromElementResponse,
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
    ScrollToVisibleResult,
} from './types';

// 工具导出
export { buildWindowSelector, xpathStr } from './utils';

// 配置与速度控制导出
export { loadConfig } from './config';
export { setSpeedFactor, getSpeedFactor, delay } from './sleep';

// 默认导出
export default SDK;
