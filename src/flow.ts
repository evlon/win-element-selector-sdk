// sdk/nodejs/src/flow.ts
// Flow 类 - 自动化流程管理器

import { HttpClient } from './client';
import { Element } from './element';
import {
    WindowSelector,
    WaitOptions,
    ClickOptions,
    TypeOptions,
    MoveOptions,
    IdleOptions,
    ScrollOptions,
    ScrollToVisibleOptions,
    Rect,
    ProfileStats,
    AutoWaitConfig,
    ElementList,
} from './types';
import { buildWindowSelector } from './utils';
import { WindowNotFoundError, StateError, TimeoutError, ElementNotFoundError } from './errors';
import { ScreenshotManager } from './screenshot';
import { OperationLogger } from './logger';
import { DEFAULTS } from './types';
import { delay } from './sleep';

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

    // idle 栈管理
    private idleStack: string[] = [];         // xpath 栈
    private currentIdleXpath: string | null = null; // 当前运行的 xpath
    
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
                window: this.windowSelector,
                element: xpath,
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
                response.elementSelector || xpath,
                response.element!,
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
     *
     * 返回的数组支持 `.position(n)` 方法，用于按位置重新查询。
     */
    async findAll(xpath: string): Promise<ElementList> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before findAll()', 'no_window');
        }

        const response = await this.client.getAllElements({
            window: this.windowSelector,
            element: xpath,
        });

        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(xpath);
        }

        const elements: Element[] = response.elements.map((item, i) => {
            // 后端返回的 elementSelector 对所有元素都相同，用原始 xpath 保持一致
            return new Element(
                this.client,
                xpath,
                this.windowSelector!,
                xpath,
                item,
                this.autoWaitConfig,
                this.logger
            );
        });

        // 附加 position() 方法
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${xpath}[position()=${n}]`;
            const resp = await this.client.getElement({
                window: this.windowSelector!,
                element: pXpath,
            });
            if (!resp.found || !resp.element) {
                throw new ElementNotFoundError(pXpath, this.windowSelector!);
            }
            const elSelector = resp.elementSelector || pXpath;
            return new Element(
                this.client,
                pXpath,
                this.windowSelector!,
                elSelector,
                resp.element!,
                this.autoWaitConfig,
                this.logger
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /** 返回空的 ElementList（带 position 方法） */
    private emptyElementList(queryXpath: string): ElementList {
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${queryXpath}[position()=${n}]`;
            throw new ElementNotFoundError(pXpath, this.windowSelector!);
        };
        return Object.assign([], { position: positionFn }) as ElementList;
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
                await delay(interval);
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
                window: this.windowSelector,
                element: xpath,
            });

            if (!response.found) {
                return; // 元素已消失
            }
            
            await delay(interval);
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${xpath}`);
    }

    /**
     * 检测元素是否存在
     * @param xpath - 元素 XPath
     * @param timeout - 最大等待时间 (ms)，默认 5000
     * @returns boolean — 存在返回 true，不存在返回 false
     */
    async exists(xpath: string, timeout?: number): Promise<boolean> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before exists()', 'no_window');
        }

        const effectiveTimeout = timeout ?? 5000;
        const interval = 500;
        const startTime = Date.now();

        while (Date.now() - startTime < effectiveTimeout) {
            try {
                const response = await this.client.getElement({
                    window: this.windowSelector,
                    element: xpath,
                });
                if (response.found) return true;
            } catch { /* ignore errors, keep polling */ }
            await delay(interval);
        }
        return false;
    }

    /**
     * 滚动使目标元素尽可能最大面积可见
     * @param xpath - 目标元素 XPath
     * @param containerXpath - 滚动容器 XPath（省略时在整个窗口范围内滚动）
     * @param options - 滚动选项
     */
    async scrollToVisible(
        xpath: string,
        containerXpath?: string,
        options?: ScrollToVisibleOptions
    ): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollToVisible()', 'no_window');
        }

        const timeout = options?.timeout ?? DEFAULTS.scrollToVisible.timeout;
        const scrollDelta = options?.scrollDelta ?? DEFAULTS.scrollToVisible.scrollDelta;
        const scrollTimes = options?.scrollTimes ?? DEFAULTS.scrollToVisible.scrollTimes;
        const checkInterval = options?.checkInterval ?? DEFAULTS.scrollToVisible.checkInterval;
        const autoDelta = options?.autoDelta ?? DEFAULTS.scrollToVisible.autoDelta;
        const deltaFactor = options?.deltaFactor ?? DEFAULTS.scrollToVisible.deltaFactor;

        // 先检查目标元素是否存在
        if (!(await this.exists(xpath, timeout))) {
            throw new ElementNotFoundError(xpath, this.windowSelector);
        }

        const startTime = Date.now();
        const scrollContainer = containerXpath || xpath;
        let adaptiveDelta: number | null = null;

        for (let i = 0; i < scrollTimes; i++) {
            // 超时检测
            if (Date.now() - startTime >= timeout) {
                throw new TimeoutError(`scrollToVisible(${xpath})`, timeout);
            }

            // 获取目标元素当前状态
            let elementInfo;
            try {
                const response = await this.client.getElement({
                    window: this.windowSelector,
                    element: xpath,
                });
                if (!response.found || !response.element) {
                    // 元素可能已被滚动改变，重试检查
                    await delay(checkInterval);
                    continue;
                }
                elementInfo = response.element;
            } catch {
                await delay(checkInterval);
                continue;
            }

            // 判断是否已可见
            const isVisible = this._isElementVisible(elementInfo);
            if (isVisible) {
                return; // 已可见，返回
            }

            // 判断滚动方向
            const direction = this._getScrollDirection(elementInfo);

            // 执行一次滚动
            let currentDelta = adaptiveDelta !== null
                ? adaptiveDelta * direction
                : scrollDelta * direction;

            if (autoDelta && i === 0) {
                // 首次使用固定 delta 滚动
                await this.client.scrollMouse({
                    element: scrollContainer,
                    delta: currentDelta,
                    times: 1,
                    autoDelta: false,
                });

                // 查询容器 rect 获取高度
                try {
                    const rect = await this._getContainerRect(scrollContainer);
                    if (rect && rect.height > 0) {
                        adaptiveDelta = Math.round(rect.height * deltaFactor);
                    }
                } catch {
                    // 获取失败，继续使用固定 delta
                }
            } else {
                await this.client.scrollMouse({
                    element: scrollContainer,
                    delta: currentDelta,
                    times: 1,
                    autoDelta: false,
                });
            }

            await delay(checkInterval);
        }

        // 最终检查
        try {
            const response = await this.client.getElement({
                window: this.windowSelector,
                element: xpath,
            });
            if (response.found && response.element && this._isElementVisible(response.element)) {
                return;
            }
        } catch { /* ignore */ }

        throw new TimeoutError(`scrollToVisible(${xpath})`, timeout);
    }

    /**
     * 判断元素是否可见
     */
    private _isElementVisible(elementInfo: any): boolean {
        return !elementInfo.isOffscreen &&
               elementInfo.rect.width > 0 &&
               elementInfo.rect.height > 0;
    }

    /**
     * 判断滚动方向
     * @returns 1=向上滚动（元素在视口上方），-1=向下滚动（元素在视口下方）
     */
    private _getScrollDirection(elementInfo: any): number {
        // 元素在视口上方（y < 0 的中心或 rect.y < 0）→ 需要向上滚动（正 delta）
        if (elementInfo.rect.y < 0) {
            return 1; // up
        }
        // 默认向下滚动（元素在视口下方）
        return -1; // down
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 等待
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 固定等待
     */
    async wait(ms: number): Promise<void> {
        await delay(ms);
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
            await delay(interval);
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
        
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.type.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }
        
        const charDelay = options?.charDelay ?? DEFAULTS.type.charDelay;
        const result = await this.client.typeText(text, { charDelay });
        
        if (!result.success) {
            this.logger.logError('输入文本', new Error('输入失败'));
            throw new Error('Type text failed');
        }
        
        this.logger.logSuccess('输入文本');
        
        // 操作后等待（优先级：options > DEFAULTS > autoWait）
        const waitAfter = options?.waitAfter ?? DEFAULTS.type.waitAfter;
        if (waitAfter && waitAfter > 0) {
            await delay(waitAfter);
        } else if (this.autoWaitConfig.enabled) {
            // 仅在没有配置 waitAfter 且 autoWait 启用时才使用
            await this.maybeAutoWait('afterType');
        }
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
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.move.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }
        
        const result = await this.client.moveMouse(
            { x, y },
            {
                humanize: options?.humanize ?? DEFAULTS.move.humanize,
                trajectory: options?.trajectory ?? DEFAULTS.move.trajectory,
                duration: options?.duration ?? DEFAULTS.move.duration,
            }
        );
        
        if (!result.success) {
            throw new Error('Mouse move failed');
        }
        
        // 操作后等待（优先级：options > DEFAULTS）
        const waitAfter = options?.waitAfter ?? DEFAULTS.move.waitAfter;
        if (waitAfter && waitAfter > 0) {
            await delay(waitAfter);
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
    // 元素便捷操作（find + action 一步到位）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 查找元素并点击
     */
    async click(xpath: string, options?: ClickOptions): Promise<void> {
        const element = await this.find(xpath);
        await element.click(options);
    }

    /**
     * 查找元素并双击
     */
    async doubleClick(xpath: string): Promise<void> {
        const element = await this.find(xpath);
        await element.doubleClick();
    }

    /**
     * 查找元素并右键点击
     */
    async rightClick(xpath: string): Promise<void> {
        const element = await this.find(xpath);
        await element.rightClick();
    }

    /**
     * 输入文本
     *
     * @param text - 要输入的文本
     * @param xpath - 目标元素 XPath；省略时全局输入（当前聚焦位置）
     * @param options - 输入选项（如 charDelay）
     */
    async type(text: string, xpath?: string, options?: TypeOptions): Promise<void> {
        if (xpath) {
            const element = await this.find(xpath);
            await element.type(text, options);
        } else {
            await this.typeText(text, options);
        }
    }

    /**
     * 查找元素并聚焦
     */
    async focus(xpath: string): Promise<void> {
        const element = await this.find(xpath);
        await element.focus();
    }

    /**
     * 查找元素、清空内容后输入新文本
     */
    async setValue(xpath: string, text: string, options?: TypeOptions): Promise<void> {
        const element = await this.find(xpath);
        await element.clear();
        await element.type(text, options);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 滚动操作
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 向上滚动
     * @param xpath - 鼠标悬停的元素 XPath（滚动发生在此元素上）
     * @param times - 滚动次数（默认由 DEFAULTS.scroll.times 配置）
     * @param options - 滚动选项：delta（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
     */
    async scrollUp(xpath: string, times?: number, options?: ScrollOptions): Promise<void> {
        await this._scroll(xpath, times, options, /* direction */ 1);
    }

    /**
     * 向下滚动
     * @param xpath - 鼠标悬停的元素 XPath（滚动发生在此元素上）
     * @param times - 滚动次数（默认由 DEFAULTS.scroll.times 配置）
     * @param options - 滚动选项：delta（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
     */
    async scrollDown(xpath: string, times?: number, options?: ScrollOptions): Promise<void> {
        await this._scroll(xpath, times, options, /* direction */ -1);
    }

    /**
     * 滚动实现
     * @param direction - 1=向上（delta 正），-1=向下（delta 负）
     */
    private async _scroll(xpath: string, times: number | undefined, options: ScrollOptions | undefined, direction: number): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollUp/scrollDown()', 'no_window');
        }

        const useIdle = options?.useIdle ?? DEFAULTS.scroll.useIdle;
        const effectiveTimes = times ?? DEFAULTS.scroll.times;
        const autoDelta = options?.autoDelta ?? DEFAULTS.scroll.autoDelta;
        const deltaFactor = options?.deltaFactor ?? DEFAULTS.scroll.deltaFactor;
        const baseDelta = options?.delta ?? DEFAULTS.scroll.delta;
        const waitXpath = options?.wait;
        const timeout = options?.timeout ?? DEFAULTS.scroll.timeout;
        const startTime = Date.now();

        // 如果启用 useIdle，先将当前区域入栈，然后悬停到滚动元素上
        if (useIdle) {
            await this.pushIdle(xpath);
        }

        try {
            let adaptiveDelta: number | null = null;

            for (let i = 0; i < effectiveTimes; i++) {
                // 检测 wait xpath
                if (waitXpath) {
                    // 超时检测
                    if (Date.now() - startTime >= timeout) {
                        throw new Error(`滚动超时: 在 ${timeout}ms 内未找到 ${waitXpath}`);
                    }

                    // 检测 wait xpath 是否存在
                    try {
                        await this.client.getElement({
                            window: this.windowSelector,
                            element: waitXpath,
                        });
                        // 找到了，返回
                        return;
                    } catch {
                        // 未找到，继续滚动
                    }
                }

                // 执行一次滚动
                let currentDelta = adaptiveDelta !== null
                    ? adaptiveDelta * direction
                    : baseDelta * direction;

                if (autoDelta && i === 0) {
                    // 首次使用固定 delta 滚动
                    await this.client.scrollMouse({
                        element: xpath,
                        delta: currentDelta,
                        times: 1,
                        autoDelta: false, // 首次不使用 autoDelta
                    });

                    // 查询容器 rect 获取高度
                    try {
                        const rect = await this._getContainerRect(xpath);
                        if (rect && rect.height > 0) {
                            adaptiveDelta = Math.round(rect.height * deltaFactor);
                        }
                    } catch {
                        // 获取失败，继续使用固定 delta
                    }
                } else {
                    await this.client.scrollMouse({
                        element: xpath,
                        delta: currentDelta,
                        times: 1,
                        autoDelta: false,
                    });
                }

                // 滚动间隔，给页面响应时间
                if (i < effectiveTimes - 1) {
                    await delay(150);
                }
            }

            // 如果有 wait xpath 但循环结束仍未找到
            if (waitXpath) {
                try {
                    await this.client.getElement({
                        window: this.windowSelector,
                        element: waitXpath,
                    });
                } catch {
                    throw new Error(`滚动完成但未找到目标: ${waitXpath}`);
                }
            }
        } finally {
            // 如果启用了 useIdle，恢复上一个 idle 区域
            if (useIdle) {
                await this.popIdle();
            }
        }
    }

    /**
     * 获取容器的 rect
     */
    private async _getContainerRect(xpath: string): Promise<Rect | null> {
        try {
            const response = await this.client.getElement({
                window: this.windowSelector!,
                element: xpath,
            });
            if (response.found && response.element) {
                return response.element.rect;
            }
        } catch { /* ignore */ }
        return null;
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
     * 如果已有 idle 在运行，直接替换（不入栈）。
     */
    async idle(xpath: string, options?: IdleOptions): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before idle()', 'no_window');
        }

        const windowSelector = this.parseWindowSelector(this.windowSelector);

        // 如果当前有 idle 在运行，直接停止
        if (this.currentIdleXpath !== null) {
            await this.client.stopIdleMotion();
        }

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

        this.currentIdleXpath = xpath;
    }

    /**
     * 启动空闲移动并入栈
     * 如果已有 idle 在运行，当前 xpath 自动入栈保存，然后替换为新的。
     * 只有通过 pushIdle 入栈的 idle，才能使用 popIdle 回退。
     */
    async pushIdle(xpath: string, options?: IdleOptions): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before pushIdle()', 'no_window');
        }

        const windowSelector = this.parseWindowSelector(this.windowSelector);

        // 如果当前有 idle 在运行，先入栈再停止
        if (this.currentIdleXpath !== null) {
            this.idleStack.push(this.currentIdleXpath);
        }

        // 停止当前 idle
        if (this.currentIdleXpath !== null) {
            await this.client.stopIdleMotion();
        }

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

        this.currentIdleXpath = xpath;
    }

    /**
     * 停止空闲移动，并清空所有栈
     */
    async stopIdle(): Promise<void> {
        const result = await this.client.stopIdleMotion();

        // 如果 idle 未启动，记录警告但不抛出错误
        if (!result.success && this.logger) {
            const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 23);
            console.warn(`${timestamp} [WARN] 停止空闲移动: ${result.error || '空闲移动未启动'}`);
        }

        this.idleStack = [];
        this.currentIdleXpath = null;
    }

    /**
     * 回退到上一个 idle 区域
     * 停止当前 idle，弹出栈顶 xpath 并重新启动。
     * 如果栈为空，则停止当前 idle。
     */
    async popIdle(): Promise<void> {
        if (this.currentIdleXpath === null) {
            return;
        }

        // 停止当前 idle
        await this.client.stopIdleMotion();

        if (this.idleStack.length === 0) {
            this.currentIdleXpath = null;
            return;
        }

        // 弹出上一个 xpath 并重启
        const prevXpath = this.idleStack.pop()!;
        const windowSelector = this.parseWindowSelector(this.windowSelector!);

        await this.client.startIdleMotion({
            window: windowSelector,
            xpath: prevXpath,
            speed: this.defaultIdleOptions.speed ?? 'normal',
            moveInterval: this.defaultIdleOptions.moveInterval ?? 800,
            humanIntervention: {
                enabled: true,
                pauseOnMouse: true,
                pauseOnKeyboard: true,
                resumeDelay: 3000,
            },
        });

        this.currentIdleXpath = prevXpath;
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

        const waitMs = this.autoWaitConfig.delays[phase];
        if (waitMs && waitMs > 0) {
            await delay(waitMs);
        }
    }
}
