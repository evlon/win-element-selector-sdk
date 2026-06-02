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
    ScrollToVisibleResult,
    ScrollDetectResult,
    Rect,
    ProfileStats,
    AutoWaitConfig,
    ElementList,
    InspectResponse,
} from './types';
import { buildWindowSelector, assignCompassPaths } from './utils';
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

    async existsWindow(selector: string | WindowSelector): Promise<boolean> {
        const selectorStr = typeof selector === 'string'
            ? selector
            : buildWindowSelector(selector);
        return this.client.existsWindow(selectorStr);
    }

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
     * 查找唯一匹配的元素（匹配多个时报错）
     *
     * 如果 XPath 匹配到多个元素，抛出错误。适用于需要精确操作的场景。
     */
    async findOne(xpath: string): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }
        
        this.logger.logOperation('正在查找唯一元素', undefined, { xpath });
        
        try {
            const response = await this.client.find({
                window: this.windowSelector,
                element: xpath,
            });

            if (!response.found || !response.element) {
                this.logger.logElementNotFound(xpath);
                throw new Error(`未找到元素: ${xpath}`);
            }

            if (response.total > 1) {
                throw new Error(`findOne 匹配到 ${response.total} 个元素，期望恰好 1 个: ${xpath}`);
            }
            
            this.logger.logElementFound(response.element);
            
            // 自动等待
            await this.maybeAutoWait('afterFind');
            
            return new Element(
                this.client,
                xpath,
                this.windowSelector,
                response.findSelector || xpath,
                response.element!,
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        } catch (error) {
            this.logger.logError('查找唯一元素', error as Error);
            throw error;
        }
    }

    /**
     * 查找第一个匹配的元素（多个匹配也不报错）
     *
     * 适用于同类元素有多个、只需操作第一个的场景。
     */
    async findFirst(xpath: string): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }
        
        this.logger.logOperation('正在查找首个元素', undefined, { xpath });
        
        try {
            const response = await this.client.find({
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
                response.findSelector || xpath,
                response.element!,
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        } catch (error) {
            this.logger.logError('查找首个元素', error as Error);
            throw error;
        }
    }

    /**
     * 查找元素（findOne 的别名，匹配多个时报错）
     *
     * @deprecated 建议使用 findOne() 或 findFirst() 以明确语义
     */
    async find(xpath: string): Promise<Element> {
        return this.findOne(xpath);
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

        const response = await this.client.findAll({
            window: this.windowSelector,
            element: xpath,
        });

        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(xpath);
        }

        const elements: Element[] = response.elements.map((item) => {
            return new Element(
                this.client,
                xpath,
                this.windowSelector!,
                item.findSelector || xpath,
                item.info,
                this.autoWaitConfig,
                this.logger,
                response.total ?? response.elements.length,
            );
        });

        // 附加 position() 方法
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${xpath}[position()=${n}]`;
            const resp = await this.client.find({
                window: this.windowSelector!,
                element: pXpath,
            });
            if (!resp.found || !resp.element) {
                throw new ElementNotFoundError(pXpath, this.windowSelector!);
            }
            const elSelector = resp.findSelector || pXpath;
            return new Element(
                this.client,
                pXpath,
                this.windowSelector!,
                elSelector,
                resp.element!,
                this.autoWaitConfig,
                this.logger,
                resp.total ?? 1,
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /**
     * 查找第 N 个匹配的元素（1-based，与 XPath position() 一致）。
     *
     * 等价于 XPath 的 `(//Text)[2]`，但由 SDK 正确处理括号拼接，
     * 避免手写 `(//Text)[2]` 导致括号被破坏的问题。
     *
     * @param xpath - XPath 表达式
     * @param n - 位置索引（1-based，1=第 1 个，2=第 2 个）
     * @returns 第 N 个匹配的元素
     *
     * @example
     * await flow.nth('//Text', 1);      // 窗口中第 1 个 Text
     * await flow.nth('//Button', 3);    // 窗口中第 3 个 Button
     */
    async nth(xpath: string, n: number): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }

        const nthXpath = `(${xpath})[position()=${n}]`;

        const response = await this.client.find({
            window: this.windowSelector,
            element: nthXpath,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(nthXpath, this.windowSelector!);
        }

        const elSelector = response.findSelector || nthXpath;
        return new Element(
            this.client,
            nthXpath,
            this.windowSelector!,
            elSelector,
            response.element!,
            this.autoWaitConfig,
            this.logger,
            response.total ?? 1,
        );
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
                return await this.findFirst(xpath);
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
            const response = await this.client.find({
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
                const response = await this.client.find({
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
     * 遍历指定元素下的所有子元素，提取层级/控件类型/name/Text/rect/相对xpath。
     *
     * 适合调试和元素结构分析：快速了解元素树的完整结构。
     *
     * @param xpath - 目标元素 XPath
     * @param options - inspect 选项
     * @param options.format - 返回格式：'json'（默认）返回结构化树，'txt' 返回缩进文本
     *
     * @returns InspectResponse，包含 nodes（结构化树）或 text（格式化文本）
     *
     * @example
     * // JSON 格式（默认）
     * const result = await flow.inspect('/Window/Pane[@Name="content"]');
     * console.log(result.nodes);         // InspectNodeInfo 树
     * console.log(result.totalChildren);  // 子元素总数
     *
     * // 文本格式
     * const result = await flow.inspect('/Window/Pane', { format: 'txt' });
     * console.log(result.text);           // 缩进展示的元素树
     */
    async inspect(xpath: string, options?: { format?: 'json' | 'txt'; visibleOnly?: boolean; regionFilter?: import('./types').InspectRegionFilter }): Promise<InspectResponse> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before inspect()', 'no_window');
        }

        const result = await this.client.inspectElement(this.windowSelector, xpath, options?.format);
        assignCompassPaths(result);

        if (result.flatNodes) {
            // 1. 过滤 offscreen 元素（visibleOnly 或 regionFilter 启用时生效）
            if (options?.visibleOnly || options?.regionFilter) {
                result.flatNodes = result.flatNodes.filter(node => !node.isOffscreen);
            }

            // 2. 区域过滤（基于 isOffscreen === false 的结果）
            if (options?.regionFilter) {
                // 需要获取父元素的 rect 来计算区域
                try {
                    const parentResp = await this.client.find({
                        window: this.windowSelector,
                        element: xpath,
                    });
                    const parentRect = parentResp.element?.rect;
                    if (parentRect) {
                        const ratio = options.regionFilter.ratio ?? 0.5;
                        const { x, y, width, height } = parentRect;
                        let regionRect: import('./types').Rect | null = null;
                        switch (options.regionFilter.region) {
                            case 'top':
                                regionRect = { x, y, width, height: height * ratio };
                                break;
                            case 'bottom':
                                regionRect = { x, y: y + height * (1 - ratio), width, height: height * ratio };
                                break;
                            case 'left':
                                regionRect = { x, y, width: width * ratio, height };
                                break;
                            case 'right':
                                regionRect = { x: x + width * (1 - ratio), y, width: width * ratio, height };
                                break;
                            case 'center':
                                regionRect = { x: x + width * 0.25, y: y + height * 0.25, width: width * 0.5, height: height * 0.5 };
                                break;
                        }
                        if (regionRect) {
                            result.flatNodes = result.flatNodes.filter(node => {
                                if (!node.rect) return false;
                                const a = regionRect!;
                                const b = node.rect;
                                const intersectX2 = Math.min(a.x + a.width, b.x + b.width);
                                const intersectX = Math.max(a.x, b.x);
                                const intersectY2 = Math.min(a.y + a.height, b.y + b.height);
                                const intersectY = Math.max(a.y, b.y);
                                return intersectX2 > intersectX && intersectY2 > intersectY;
                            });
                        }
                    }
                } catch {
                    // 获取父元素失败，跳过区域过滤
                }
            }
        }

        return result;
    }

    /**
     * 滚动使目标元素可见——一步到位的统一滚动 API。
     *
     * 自动处理三种场景：
     * 1. 目标已可见 → 直接返回
     * 2. 目标已存在但 offscreen → 自动检测方向，委托 element.scrollToVisible 精调
     * 3. 目标不存在 → 先在容器上按 direction 滚动直到出现，再 scrollToVisible 精调
     *
     * @param xpath - 目标元素 XPath
     * @param containerXpath - 滚动容器 XPath（省略时默认与 xpath 相同）
     * @param options - 滚动选项
     * @param options.direction - 目标不存在时的滚动方向：'up' 或 'down'，默认 'down'
     * @param options.timeout - 总超时（ms），默认 60000
     * @param options.scrollTimes - 最大滚动次数，默认 100
     * @param options.autoDelta - 是否自动调整 delta，默认 true
     * @param options.deltaFactor - 容器高度倍率（0-1），默认 0.8
     * @param options.delayMs - 每次滚动后的等待时间（ms），默认 1000
     * @param options.scrollToCenter - 是否滚动到视口中心，默认 true
     * @param options.scrollToCenterAdjustTimes - scrollToCenter 最大调整次数，默认 5
     *
     * @returns ScrollToVisibleResult - 包含 visible、scrolledToEnd、scrolled、targetRect 字段
     *
     * @example
     * // 最简用法：一步滚动到可见
     * const result = await flow.scrollToVisible(`/Document/Text[@Name='写留言']`, `/Document`);
     * if (!result.visible && result.scrolledToEnd) {
     *     // 滚动到底了，可以尝试反方向
     * }
     *
     * // 向上滚动找目标
     * const result = await flow.scrollToVisible(target, container, { direction: 'up' });
     *
     * // 更多控制
     * const result = await flow.scrollToVisible(target, container, { direction: 'down', scrollTimes: 200, autoDelta: true });
     */
    async scrollToVisible(
        xpath: string,
        containerXpath?: string,
        options?: ScrollToVisibleOptions
    ): Promise<ScrollToVisibleResult> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollToVisible()', 'no_window');
        }

        const direction = options?.direction ?? 'down';
        const timeout = options?.timeout ?? DEFAULTS.scrollToVisible.timeout;
        const scrollTimes = options?.scrollTimes ?? DEFAULTS.scrollToVisible.scrollTimes;
        const autoDelta = options?.autoDelta ?? DEFAULTS.scrollToVisible.autoDelta;
        const deltaFactor = options?.deltaFactor ?? DEFAULTS.scrollToVisible.deltaFactor;
        const delayMs = options?.delayMs ?? DEFAULTS.scrollToVisible.delayMs;
        const scrollToCenter = options?.scrollToCenter ?? DEFAULTS.scrollToVisible.scrollToCenter;
        const scrollToCenterAdjustTimes = options?.scrollToCenterAdjustTimes ?? DEFAULTS.scrollToVisible.scrollToCenterAdjustTimes;
        const scrollIntervalMs = options?.scrollIntervalMs ?? DEFAULTS.scrollToVisible.scrollIntervalMs;
        const autoDeltaInitialDelayMs = options?.autoDeltaInitialDelayMs ?? DEFAULTS.scrollToVisible.autoDeltaInitialDelayMs;
        const minDeltaRatio = options?.minDeltaRatio ?? DEFAULTS.scrollToVisible.minDeltaRatio;
        const scrollToCenterThreshold = options?.scrollToCenterThreshold ?? DEFAULTS.scrollToVisible.scrollToCenterThreshold;
        const viewportInset = options?.viewportInset;
        const scrollContainer = containerXpath || xpath;

        const startTime = Date.now();

        // ── 阶段 1：尝试 find 目标元素 ──
        let element: Element | null = null;
        try {
            element = await this.findFirst(xpath);
        } catch {
            // 元素不存在，进入阶段 2
        }

        // ── 阶段 1a：已可见 → 直接返回 ──
        if (element && !(await element.isOffscreen())) {
            // 已在视口内，无需滚动
            return { visible: true, scrolledToEnd: false, scrolled: 0 };
        }

        // ── 阶段 2：目标不存在 → 在容器上按 direction 滚动直到出现 ──
        if (!element) {
            // 超时检测
            if (Date.now() - startTime >= timeout) {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }

            const remainingTimeout = timeout - (Date.now() - startTime);

            // 使用后端 scrollMouse 的 wait 模式：一次 HTTP 调用完成"滚动+等待"
            const delta = direction === 'up' ? 120 : -120;
            let scrollResult;
            try {
                scrollResult = await this.client.scrollMouse({
                    window: this.windowSelector,
                    element: scrollContainer,
                    delta,
                    times: scrollTimes,
                    autoDelta,
                    wait: xpath,
                    waitMode: 'visible',
                    timeout: remainingTimeout,
                    scrollToCenter,
                    scrollToCenterAdjustTimes,
                    scrollIntervalMs,
                    autoDeltaInitialDelayMs,
                    minDeltaRatio,
                    scrollToCenterThreshold,
                    viewportInset,
                });
            } catch (error) {
                // scrollMouse HTTP 超时或网络错误，返回失败结果而非抛出异常
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }

            // 滚动到底了，直接返回
            if (scrollResult.scrolledToEnd) {
                return {
                    visible: false,
                    scrolledToEnd: true,
                    scrolled: scrollResult.scrolled,
                    targetRect: scrollResult.targetRect,
                    visibleRect: scrollResult.visibleRect,
                };
            }

            // 滚动后刷新元素
            try {
                element = await this.findFirst(xpath);
            } catch {
                // 找不到元素，返回失败
                return {
                    visible: false,
                    scrolledToEnd: scrollResult.scrolledToEnd ?? false,
                    scrolled: scrollResult.scrolled,
                    targetRect: scrollResult.targetRect,
                    visibleRect: scrollResult.visibleRect,
                };
            }
        }

        // ── 阶段 3：元素存在但 offscreen → 委托 element.scrollToVisible 精调 ──
        if (element && (await element.isOffscreen())) {
            // 超时检测
            if (Date.now() - startTime >= timeout) {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }

            try {
                return await element.scrollToVisible(scrollContainer, {
                    direction,
                    times: scrollTimes,
                    autoDelta,
                    delayMs,
                    scrollToCenter,
                    scrollToCenterAdjustTimes,
                    scrollIntervalMs,
                    autoDeltaInitialDelayMs,
                    minDeltaRatio,
                    scrollToCenterThreshold,
                    viewportInset,
                });
            } catch (error) {
                // element.scrollToVisible 超时或网络错误，返回失败结果而非抛出异常
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }
        }

        // 元素可见
        return { visible: true, scrolledToEnd: false, scrolled: 0 };
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
        
        const result = await this.client.typeText(text, options);
        
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
     * 向上滚动（视口上移，看到上方内容，delta 为正）
     * @param xpath - 鼠标悬停的元素 XPath（滚动发生在此元素上）
     * @param times - 滚动次数（默认由 DEFAULTS.scroll.times 配置）
     * @param options - 滚动选项：delta（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
     */
    async scrollUp(xpath: string, times?: number, options?: ScrollOptions): Promise<void> {
        await this._scroll(xpath, times, options, /* direction */ 1);
    }

    /**
     * 向下滚动（视口下移，看到下方内容，delta 为负）
     * @param xpath - 鼠标悬停的元素 XPath（滚动发生在此元素上）
     * @param times - 滚动次数（默认由 DEFAULTS.scroll.times 配置）
     * @param options - 滚动选项：delta（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
     */
    async scrollDown(xpath: string, times?: number, options?: ScrollOptions): Promise<void> {
        await this._scroll(xpath, times, options, /* direction */ -1);
    }

    /**
     * 滚动实现
     * @param direction - 1=向上滚动（delta 正，视口上移，内容向下移，看上方内容），-1=向下滚动（delta 负，视口下移，内容向上移，看下方内容）
     * 与 scrollIntoView 的 direction 语义一致：'up'=视口上移看上方，'down'=视口下移看下方
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
                        await this.client.find({
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
                    try {
                        await this.client.scrollMouse({
                            element: xpath,
                            delta: currentDelta,
                            times: 1,
                            autoDelta: false, // 首次不使用 autoDelta
                        });
                    } catch {
                        // scrollMouse 失败，停止滚动
                        break;
                    }

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
                    try {
                        await this.client.scrollMouse({
                            element: xpath,
                            delta: currentDelta,
                            times: 1,
                            autoDelta: false,
                        });
                    } catch {
                        // scrollMouse 失败，停止滚动
                        break;
                    }
                }

                // 滚动间隔，给页面响应时间
                if (i < effectiveTimes - 1) {
                    await delay(options?.scrollIntervalMs ?? DEFAULTS.scroll.scrollIntervalMs);
                }
            }

            // 如果有 wait xpath 但循环结束仍未找到
            if (waitXpath) {
                try {
                    await this.client.find({
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 滚动边界检测
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 滚动边界检测：滚动一次，检测是否到底/到顶
     *
     * 使用 UIA 原生 PropertyCondition 查询容器内指定 ControlType 的可见元素，
     * 比较滚动前后元素的 bound.top 变化来判断是否到达边界。
     * 排除 exclude 列表后，任一元素的 bound.top 变化 > 2px → 没到底；全部不变 → 到底。
     *
     * @param container - 滚动容器的 XPath（鼠标移到此元素中心执行滚动）
     * @param options - 检测选项
     * @param options.controlTypes - 要监控的 ControlType 名称列表，默认 ['Text']。支持: 'Text', 'Image', 'ListItem', 'DataItem' 等。传空数组则监控所有可见元素
     * @param options.direction - 滚动方向："down"=向下滚（检测到底），"up"=向上滚（检测到顶），默认 "down"
     * @param options.exclude - 排除的元素 XPath 列表（如悬浮工具栏，它们随滚动自动移位，会干扰判断）
     * @param options.rollback - 检测后是否反向滚动恢复位置，默认 false
     * @param options.scrollDelayMs - 滚动后等待 UI 响应时间（ms），默认 500。某些应用有滚动动画，需等待 BoundingRectangle 更新
     *
     * @returns ScrollDetectResult - 包含 atEnd（是否到底/到顶）等信息
     *
     * @example
     * // 检测是否滚到底部（默认监控 Text 元素）
     * const result = await flow.scrollDetect('/Document');
     * if (result.atEnd) {
     *     console.log('已到底部');
     * }
     *
     * // 监控 Text + Image 元素
     * const result = await flow.scrollDetect('/Document', { controlTypes: ['Text', 'Image'] });
     *
     * // 检测是否滚到顶部
     * const result = await flow.scrollDetect('/Document', { direction: 'up' });
     *
     * // 排除悬浮工具栏
     * const result = await flow.scrollDetect('/Document', {
     *     exclude: ['/Document//ToolBar']
     * });
     *
     * // 检测后回滚（不改变位置）
     * const result = await flow.scrollDetect('/Document', { rollback: true });
     */
    async scrollDetect(
        container: string,
        options?: { controlTypes?: string[]; direction?: 'up' | 'down'; exclude?: string[]; rollback?: boolean; scrollDelayMs?: number }
    ): Promise<ScrollDetectResult> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollDetect()', 'no_window');
        }

        return this.client.scrollDetect({
            window: this.windowSelector,
            container,
            controlTypes: options?.controlTypes,
            direction: options?.direction,
            exclude: options?.exclude,
            rollback: options?.rollback,
            scrollDelayMs: options?.scrollDelayMs,
        });
    }

    /**
     * 获取容器的 rect
     */
    private async _getContainerRect(xpath: string): Promise<Rect | null> {
        try {
            const response = await this.client.find({
                window: this.windowSelector!,
                element: xpath,
            });
            if (response.found && response.element && response.element.rect) {
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
