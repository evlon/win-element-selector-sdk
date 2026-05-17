// sdk/nodejs/src/flow.ts
// Flow 类 - 自动化流程管理器

import { HttpClient } from './client';
import { Element } from './element';
import { 
    WindowSelector, 
    WaitOptions, 
    TypeOptions, 
    MoveOptions, 
    IdleOptions,
    ProfileStats,
    AutoWaitConfig
} from './types';
import { buildWindowSelector } from './utils';
import { WindowNotFoundError, StateError, TimeoutError } from './errors';
import { ScreenshotManager } from './screenshot';
import { OperationLogger } from './logger';

/**
 * Flow 类 - 管理自动化流程的上下文和操作
 * 
 * 提供窗口管理、元素查找、全局操作等功能。
 * 
 * @example
 * const flow = sdk.flow();
 * await flow.window({ title: 'App' });
 * const button = await flow.find('//Button');
 * await button.click();
 */
export class Flow {
    private client: HttpClient;
    private windowSelector: string | null = null;
    private screenshotManager: ScreenshotManager;
    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;
    private defaultIdleOptions: IdleOptions;  // idle 默认配置
    
    // 性能分析
    private profileEnabled: boolean = false;
    private profileStartTime: number = 0;
    private profileOperations: Array<{
        type: string;
        duration: number;
        timestamp: number;
        details?: any;
    }> = [];

    constructor(
        client: HttpClient,
        autoWaitConfig: AutoWaitConfig,
        logger: OperationLogger,
        defaultIdleOptions: IdleOptions = {}  // idle 默认配置，可选
    ) {
        this.client = client;
        this.screenshotManager = new ScreenshotManager();
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;
        this.defaultIdleOptions = defaultIdleOptions;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 窗口操作
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 激活指定窗口
     */
    async window(selector: string | WindowSelector): Promise<void> {
        const selectorStr = typeof selector === 'string' 
            ? selector 
            : buildWindowSelector(selector);
        
        this.logger.logOperation('正在切换窗口', undefined, { selector: selectorStr });
        
        try {
            const result = await this.client.activateWindow(selectorStr);
            
            if (!result.success) {
                this.logger.logWindowActivation(selectorStr, false);
                throw new WindowNotFoundError(selectorStr);
            }
            
            this.windowSelector = selectorStr;
            this.logger.logWindowActivation(selectorStr, true);
            
            // 自动等待
            await this.maybeAutoWait('beforeAction');
        } catch (error) {
            this.logger.logError('切换窗口', error as Error);
            throw error;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 元素查找
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 查找单个元素
     */
    async find(xpath: string): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }
        
        this.logger.logOperation('正在查找元素', undefined, { xpath });
        
        try {
            const response = await this.client.getElement({
                windowSelector: this.windowSelector,
                xpath,
            });
            
            if (!response.found || !response.element) {
                this.logger.logElementNotFound(xpath);
                throw new Error(`未找到元素: ${xpath}`);
            }
            
            this.logger.logElementFound(response.element);
            
            // 自动等待
            await this.maybeAutoWait('afterFind');
            
            return new Element(
                this.client, 
                xpath, 
                this.windowSelector, 
                response.element,
                this.autoWaitConfig,
                this.logger
            );
        } catch (error) {
            this.logger.logError('查找元素', error as Error);
            throw error;
        }
    }

    /**
     * 查找所有匹配的元素
     */
    async findAll(xpath: string): Promise<Element[]> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before findAll()', 'no_window');
        }
        
        const response = await this.client.getAllElements({
            windowSelector: this.windowSelector,
            xpath,
        });
        
        if (!response.found || !response.elements || response.elements.length === 0) {
            return [];
        }
        
        return response.elements.map(info => 
            new Element(
                this.client, 
                xpath, 
                this.windowSelector!, 
                info,
                this.autoWaitConfig,
                this.logger
            )
        );
    }

    /**
     * 等待元素出现
     */
    async waitFor(xpath: string, options?: WaitOptions): Promise<Element> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            try {
                return await this.find(xpath);
            } catch (e) {
                if (Date.now() - startTime >= timeout) {
                    throw new TimeoutError(`waitFor(${xpath})`, timeout);
                }
                await new Promise(r => setTimeout(r, interval));
            }
        }
        
        throw new TimeoutError(`waitFor(${xpath})`, timeout);
    }

    /**
     * 等待元素消失
     */
    async waitUntilGone(xpath: string, options?: WaitOptions): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before waitUntilGone()', 'no_window');
        }
        
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const response = await this.client.getElement({
                windowSelector: this.windowSelector,
                xpath,
            });
            
            if (!response.found) {
                return; // 元素已消失
            }
            
            await new Promise(r => setTimeout(r, interval));
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${xpath}`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 等待
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 固定等待
     */
    async wait(ms: number): Promise<void> {
        await new Promise(r => setTimeout(r, ms));
    }

    /**
     * 条件等待
     */
    async waitUntil(condition: () => Promise<boolean>, options?: WaitOptions): Promise<void> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            if (await condition()) {
                return;
            }
            await new Promise(r => setTimeout(r, interval));
        }
        
        throw new TimeoutError('waitUntil', timeout);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 键盘操作（全局）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 全局输入文本（不针对特定元素）
     * @deprecated 建议使用 element.typeText() 或 element.type()
     */
    async typeText(text: string, options?: TypeOptions): Promise<void> {
        this.logger.logOperation('输入文本', undefined, { text });
        
        const charDelay = options?.charDelay ?? { min: 50, max: 150 };
        const result = await this.client.typeText(text, { charDelay });
        
        if (!result.success) {
            this.logger.logError('输入文本', new Error('输入失败'));
            throw new Error('Type text failed');
        }
        
        this.logger.logSuccess('输入文本');
        
        // 自动等待
        await this.maybeAutoWait('afterType');
    }

    /**
     * 按下按键
     */
    async pressKey(key: string): Promise<void> {
        const result = await this.client.executeKey(key);
        
        if (!result.success) {
            throw new Error(`Key press failed: ${key}`);
        }
    }

    /**
     * 执行快捷键组合（推荐方法名）
     * @param keys 快捷键字符串，如 "Ctrl+C", "Alt+F4"
     */
    async shortcut(keys: string): Promise<void> {
        const result = await this.client.shortcut(keys);
        
        if (!result.success) {
            throw new Error(`Shortcut failed: ${keys}${result.error ? ` - ${result.error}` : ''}`);
        }
    }

    /**
     * 执行快捷键组合（向后兼容别名）
     * @deprecated 请使用 shortcut() 代替
     * @param keys 快捷键字符串，如 "Ctrl+C", "Alt+F4"
     */
    async pressShortcut(keys: string): Promise<void> {
        return this.shortcut(keys);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 鼠标操作（全局坐标）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 移动鼠标到指定坐标
     */
    async moveTo(x: number, y: number, options?: MoveOptions): Promise<void> {
        const result = await this.client.moveMouse(
            { x, y },
            {
                humanize: options?.humanize ?? true,
                trajectory: options?.trajectory ?? 'bezier',
                duration: options?.duration ?? 600,
            }
        );
        
        if (!result.success) {
            throw new Error('Mouse move failed');
        }
    }

    /**
     * 在指定坐标点击
     */
    async clickAt(x: number, y: number): Promise<void> {
        await this.moveTo(x, y);
        // TODO: 需要后端支持全局点击 API
        throw new Error('clickAt not yet implemented');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 截图
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 截图
     */
    async screenshot(path?: string): Promise<string> {
        return this.screenshotManager.capture(path || `screenshots/manual-${Date.now()}.png`);
    }

    /**
     * 自动命名截图
     */
    async screenshotAuto(): Promise<string> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        return this.screenshot(`screenshots/${timestamp}.png`);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 性能分析
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 开始性能分析
     */
    startProfile(): void {
        this.profileEnabled = true;
        this.profileStartTime = Date.now();
        this.profileOperations = [];
    }

    /**
     * 停止性能分析并返回统计
     */
    stopProfile(): ProfileStats {
        const endTime = Date.now();
        
        return {
            startTime: this.profileStartTime,
            endTime,
            totalTime: endTime - this.profileStartTime,
            operations: this.profileOperations,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 空闲移动
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 启动空闲移动
     */
    async idle(xpath: string, options?: IdleOptions): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before idle()', 'no_window');
        }
        
        const windowSelector = this.parseWindowSelector(this.windowSelector);
        
        // 合并默认配置和传入的配置
        const mergedOptions: IdleOptions = {
            speed: options?.speed ?? this.defaultIdleOptions.speed ?? 'normal',
            moveInterval: options?.moveInterval ?? this.defaultIdleOptions.moveInterval ?? 800,
            humanIntervention: options?.humanIntervention ?? this.defaultIdleOptions.humanIntervention,
        };
        
        // 构建人工干预配置
        const humanIntervention = mergedOptions.humanIntervention ? {
            enabled: mergedOptions.humanIntervention.enabled ?? true,
            pauseOnMouse: mergedOptions.humanIntervention.pauseOnMouse ?? true,
            pauseOnKeyboard: mergedOptions.humanIntervention.pauseOnKeyboard ?? true,
            resumeDelay: mergedOptions.humanIntervention.resumeDelay ?? 3000,
        } : undefined;
        
        await this.client.startIdleMotion({
            window: windowSelector,
            xpath,
            speed: mergedOptions.speed,
            moveInterval: mergedOptions.moveInterval,
            humanIntervention,
        });
    }

    /**
     * 停止空闲移动
     */
    async stopIdle(): Promise<void> {
        const result = await this.client.stopIdleMotion();
        
        // 如果 idle 未启动，记录警告但不抛出错误
        if (!result.success && this.logger) {
            const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
            console.warn(`${timestamp} [WARN] 停止空闲移动: ${result.error || '空闲移动未启动'}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 内部工具方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 解析窗口选择器字符串为对象
     * 支持两种格式：
     * 1. XPath 格式: "Window[@Name='xxx' and @ClassName='yyy']"
     * 2. 简单格式: "title:xxx className:yyy processName:zzz"
     */
    private parseWindowSelector(selector: string): WindowSelector {
        // 如果已经是 XPath 格式（包含 [ 和 ]），尝试从中提取属性
        if (selector.includes('[') && selector.includes(']')) {
            const result: WindowSelector = {};
            
            // 提取 @Name='xxx'
            const nameMatch = selector.match(/@Name='([^']+)'/);
            if (nameMatch) {
                result.title = nameMatch[1];
            }
            
            // 提取 @ClassName='xxx'
            const classMatch = selector.match(/@ClassName='([^']+)'/);
            if (classMatch) {
                result.className = classMatch[1];
            }
            
            // 提取 @ProcessName='xxx'
            const processMatch = selector.match(/@ProcessName='([^']+)'/);
            if (processMatch) {
                result.processName = processMatch[1];
            }
            
            // 如果什么都没提取到，返回原始选择器作为 title
            if (!result.title && !result.className && !result.processName) {
                result.title = selector;
            }
            
            return result;
        }
        
        // 原有的解析逻辑（处理 "title:xxx className:xxx" 格式）
        const parts = selector.split(' ').filter(p => p.includes(':'));
        const result: WindowSelector = {};
        
        for (const part of parts) {
            const [key, value] = part.split(':');
            if (key === 'title') result.title = value;
            else if (key === 'className') result.className = value;
            else if (key === 'processName') result.processName = value;
        }
        
        if (!result.title && !result.className && !result.processName) {
            result.title = selector;
        }
        
        return result;
    }
    
    /**
     * 自动等待（根据配置）
     */
    private async maybeAutoWait(phase: keyof AutoWaitConfig['delays']): Promise<void> {
        if (!this.autoWaitConfig.enabled) return;
        
        const delay = this.autoWaitConfig.delays[phase];
        if (delay && delay > 0) {
            await new Promise(r => setTimeout(r, delay));
        }
    }
}
