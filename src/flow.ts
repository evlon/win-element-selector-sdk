// sdk/nodejs/src/flow.ts
// Flow 类 - 自动化流程管理器

import { HttpClient } from './client';
import { Element } from './element';
import { parseXpathMarker, FindElementMode } from './xpath-marker';
import { resolveTemplatePath, shouldUseImageAcceleration, getAccelConfig } from './image-acceleration';
import * as fs from 'fs';
import * as path from 'path';
import {
    WindowSelector,
    WindowInfo,
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
    ElementInfo,
    ElementList,
    InspectResponse,
    FindOptions,
    FindImageOptions,
    FindImageMatch,
    ImageClickOptions,
    AccelConfig,
    DEFAULTS,
} from './types';
import { buildWindowSelector, assignCompassPaths } from './utils';
import { WindowNotFoundError, StateError, TimeoutError, ElementNotFoundError, InvalidArgumentError } from './errors';
import { ScreenshotManager } from './screenshot';
import { OperationLogger } from './logger';
import { Template, resolveTemplate } from './image-template';
import { computeImageClickPoint } from './image-click';
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
    private _currentWindowInfo: WindowInfo | null = null;

    /** 当前窗口信息（由 window() 设置） */
    get currentWindowInfo(): WindowInfo | null { return this._currentWindowInfo; }
    private screenshotManager: ScreenshotManager;
    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;
    private defaultIdleOptions: IdleOptions;  // idle 默认配置
    private imagePrecision: number;  // 图像匹配默认精度

    // idle 栈管理
    private idleStack: string[] = [];         // xpath 栈
    private currentIdleXpath: string | null = null; // 当前运行的 xpath

    // 图像命中位置缓存（opt-in: usePositionCache=true 时启用）
    // key = 模板路径或 base64 hash，value = 归一化坐标 { nx, ny }（相对于窗口 rect）
    private _imagePositionCache: Map<string, { nx: number; ny: number }> = new Map();
    
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
        defaultIdleOptions: IdleOptions = {},  // idle 默认配置，可选
        imagePrecision: number = 0.8,
    ) {
        this.client = client;
        this.screenshotManager = new ScreenshotManager();
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;
        this.defaultIdleOptions = defaultIdleOptions;
        this.imagePrecision = imagePrecision;
    }


    /**
     * 
     * @param ms 待睡眠的毫秒数
     * @returns 
     */
    async sleep(ms: number){
        await delay(ms);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 窗口操作
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 列出窗口信息。
     * @param selector 可选的窗口选择条件（对象），无参时返回所有窗口
     * @returns 匹配的窗口信息列表
     */
    async listWindows(selector?: WindowSelector): Promise<WindowInfo[]> {
        const allWindows = await this.client.listWindows();
        if (!selector || Object.keys(selector).length === 0) {
            return allWindows;
        }
        return allWindows.filter(w => {
            if (selector.title !== undefined && w.title !== selector.title) return false;
            if (selector.className !== undefined && w.className !== selector.className) return false;
            if (selector.processName !== undefined && w.processName !== selector.processName) return false;
            if (selector.processId !== undefined && w.processId !== selector.processId) return false;   
            return true;
        });
    }

    async existsWindow(selector: string | WindowSelector): Promise<boolean> {
        const selectorStr = typeof selector === 'string'
            ? selector
            : buildWindowSelector(selector);
        return this.client.existsWindow(selectorStr);
    }

    /**
     * 激活指定窗口并设置为当前上下文。
     * 激活后可通过 find() 等方法在此窗口中查找元素。
     * @param selector 窗口选择器：字符串 / WindowSelector / WindowInfo（来自 listWindows）
     * @returns 窗口信息（title, className, processId, processName）
     */
    async window(selector: string | WindowSelector | WindowInfo): Promise<WindowInfo> {
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
            this._currentWindowInfo = result.windowInfo ?? null;
            this.logger.logWindowActivation(selectorStr, true);
            
            // 自动等待
            await this.maybeAutoWait('beforeAction');

            return result.windowInfo!;
        } catch (error) {
            this.logger.logError('切换窗口', error as Error);
            throw error;
        }
    }

    /**
     * 仅激活指定窗口，不改变当前上下文（windowSelector 不变）。
     *
     * 与 window() 的区别：
     * - window() — 激活窗口 + 设为当前上下文（后续 find() 在此窗口查找）
     * - activate() — 仅激活窗口，不改变上下文（后续操作仍在原窗口）
     *
     * @example
     * // 切换到窗口A并查找元素
     * await flow.window({ title: '窗口A' });
     * const btn = await flow.find('//Button');
     *
     * // 仅激活窗口B（不改变上下文），查看信息后回到窗口A继续操作
     * await flow.activate({ title: '窗口B' });
     * await sleep(2000);
     * await btn.click();  // 仍在窗口A操作
     */
    async activate(selector: string | WindowSelector): Promise<void> {
        const selectorStr = typeof selector === 'string'
            ? selector
            : buildWindowSelector(selector);

        this.logger.logOperation('仅激活窗口（不切换上下文）', undefined, { selector: selectorStr });

        try {
            const result = await this.client.activateWindow(selectorStr);

            if (!result.success) {
                this.logger.logWindowActivation(selectorStr, false);
                throw new WindowNotFoundError(selectorStr);
            }

            this.logger.logWindowActivation(selectorStr, true);
        } catch (error) {
            this.logger.logError('激活窗口', error as Error);
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
    // ═══════════════════════════════════════════════════════════════════════════
    // 纯实现层：findElement*（UIA）/ findImage*（图像）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 纯 UIA 查找，findOne 语义（匹配多个时报错）
     */
    private async findElementOne(xpath: string, options?: FindOptions): Promise<Element> {
        this.logger.logOperation('正在查找唯一元素', undefined, { xpath });
        try {
            const response = await this.client.find({
                window: this.windowSelector!,
                element: xpath,
                chromeTreewalkerFallback: options?.chromeTreewalkerFallback,
            });
            if (!response.found || !response.element) {
                if (!options?._silent) {
                    this.logger.logElementNotFound(xpath);
                }
                throw new ElementNotFoundError(xpath, this.windowSelector!);
            }
            if (response.total > 1) {
                throw new Error(`findOne 匹配到 ${response.total} 个元素，期望恰好 1 个: ${xpath}`);
            }
            this.logger.logElementFound(response.element);
            await this.maybeAutoWait('afterFind');
            return new Element(
                this.client, xpath, this.windowSelector!,
                response.findSelector || xpath, response.element!,
                this.autoWaitConfig, this.logger, response.total ?? 1,
            );
        } catch (error) {
            if (!options?._silent) {
                this.logger.logError('查找唯一元素', error as Error);
            }
            throw error;
        }
    }

    /**
     * 纯 UIA 查找，findFirst 语义（多返回第一个）
     */
    private async findElementFirst(xpath: string, options?: FindOptions): Promise<Element> {
        this.logger.logOperation('正在查找首个元素', undefined, { xpath });
        try {
            const response = await this.client.find({
                window: this.windowSelector!,
                element: xpath,
                chromeTreewalkerFallback: options?.chromeTreewalkerFallback,
            });
            if (!response.found || !response.element) {
                if (!options?._silent) {
                    this.logger.logElementNotFound(xpath);
                }
                throw new ElementNotFoundError(xpath, this.windowSelector!);
            }
            this.logger.logElementFound(response.element);
            await this.maybeAutoWait('afterFind');
            return new Element(
                this.client, xpath, this.windowSelector!,
                response.findSelector || xpath, response.element!,
                this.autoWaitConfig, this.logger, response.total ?? 1,
            );
        } catch (error) {
            if (!options?._silent) {
                this.logger.logError('查找首个元素', error as Error);
            }
            throw error;
        }
    }

    /**
     * 纯 UIA 查找，findAll 语义
     */
    private async findElementAll(xpath: string, options?: FindOptions): Promise<ElementList> {
        const response = await this.client.findAll({
            window: this.windowSelector!,
            element: xpath,
            chromeTreewalkerFallback: options?.chromeTreewalkerFallback,
        });
        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(xpath);
        }
        const elements: Element[] = response.elements.map((item) => new Element(
            this.client, xpath, this.windowSelector!,
            item.findSelector || xpath, item.info,
            this.autoWaitConfig, this.logger,
            response.total ?? response.elements.length,
        ));
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${xpath}[position()=${n}]`;
            const resp = await this.client.find({ window: this.windowSelector!, element: pXpath });
            if (!resp.found || !resp.element) throw new ElementNotFoundError(pXpath, this.windowSelector!);
            return new Element(
                this.client, pXpath, this.windowSelector!,
                resp.findSelector || pXpath, resp.element!,
                this.autoWaitConfig, this.logger, resp.total ?? 1,
            );
        };
        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /**
     * 纯图像匹配（findOne 语义）。
     * 不回退 UIA——图像加速路径 miss 直接抛错（比 UIA 更快）。
     * 如果模板有 cropOffset，命中坐标需加上偏移还原到原图坐标。
     */
    private async findImageOne(xpath: string, tplPath: string): Promise<Element> {
        // 加载 meta：cropOffset + 原始尺寸
        const metaPath = `${tplPath}.meta.json`;
        let cropOffset = { x: 0, y: 0 };
        let origW = 0;
        let origH = 0;
        try {
            const metaRaw = fs.readFileSync(metaPath, 'utf-8');
            const meta = JSON.parse(metaRaw);
            if (meta.cropOffset) {
                cropOffset = { x: meta.cropOffset.x ?? 0, y: meta.cropOffset.y ?? 0 };
            }
            origW = meta.templateWidth ?? 0;
            origH = meta.templateHeight ?? 0;
        } catch {
            // 无 meta → 无裁剪
        }

        const matches = await this.findImage(tplPath, { precision: this.imagePrecision });
        if (matches.length === 0) {
            throw new ElementNotFoundError(xpath, `图像加速匹配失败（模板: ${tplPath}）`);
        }
        const m = matches[0];

        // 还原坐标：匹配坐标是裁剪后图的中心，加上 cropOffset 还原到原图空间
        const mx = m.x + cropOffset.x;
        const my = m.y + cropOffset.y;

        // 使用原始元素尺寸（非裁剪后模板尺寸），确保 rect 和 center 正确
        const w = origW || m.width;
        const h = origH || m.height;
        const halfW = w / 2;
        const halfH = h / 2;
        const pseudoInfo: ElementInfo = {
            rect: { x: mx - halfW, y: my - halfH, width: w, height: h },
            center: { x: mx, y: my },
            centerRandom: { x: mx, y: my },
            controlType: '', name: '', automationId: '', className: '',
            frameworkId: '', helpText: '', localizedControlType: '',
            isEnabled: true, isOffscreen: false, isPassword: false,
            acceleratorKey: '', accessKey: '', itemType: '', itemStatus: '',
            processId: 0, isCheckable: false, isChecked: false,
            isClickable: true, isScrollable: false, isSelected: false,
        };
        this.logger.logDebug(`accel [图像命中]: (${mx}, ${my}) conf=${m.confidence} size=${w}x${h}${cropOffset.x || cropOffset.y ? ` crop=(${cropOffset.x},${cropOffset.y})` : ''}`);
        await this.maybeAutoWait('afterFind');
        return new Element(
            this.client, xpath, this.windowSelector!,
            xpath, pseudoInfo, this.autoWaitConfig, this.logger, 1,
        );
    }

    /**
     * UIA 首次查找 + 自动截图缓存模板（为下次 findImageOne 加速）。
     * 有 mask 时，裁剪后保存裁剪图 + cropOffset 到 meta.json。
     */
    private async findElementAndCache(xpath: string, tplPath: string, options?: FindOptions): Promise<Element> {
        const el = await this.findElementFirst(xpath, options);
        try {
            const rect = el.info.rect;
            if (rect && rect.width >= 5 && rect.height >= 5) {
                let base64 = await this.captureScreenshot(rect);
                const origW = rect.width;
                const origH = rect.height;
                let cropOffset = { x: 0, y: 0 };

                // 应用掩码：有 mask 时调后端裁剪
                const mask = getAccelConfig(options?.accel)?.mask;
                if (mask && (mask.top || mask.right || mask.bottom || mask.left)) {
                    const cropResult = await this.client.cropImage({
                        imageBase64: base64,
                        top: mask.top,
                        right: mask.right,
                        bottom: mask.bottom,
                        left: mask.left,
                    });
                    if (cropResult.success && cropResult.base64) {
                        base64 = cropResult.base64;
                        if (cropResult.cropOffset) {
                            cropOffset = cropResult.cropOffset;
                        }
                        this.logger.logDebug(`accel [模板已裁剪]: offset=(${cropOffset.x},${cropOffset.y})`);
                    }
                }

                const dir = path.dirname(tplPath);
                if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(tplPath, Buffer.from(base64, 'base64'));

                // 写 meta.json（含 cropOffset）
                const meta = {
                    version: 1,
                    dpi: 96,
                    screenWidth: 0,
                    screenHeight: 0,
                    windowRect: rect ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height } : undefined,
                    templateWidth: origW,
                    templateHeight: origH,
                    cropOffset: (cropOffset.x > 0 || cropOffset.y > 0) ? cropOffset : undefined,
                };
                fs.writeFileSync(`${tplPath}.meta.json`, JSON.stringify(meta, null, 2));
                this.logger.logDebug(`accel [模板已缓存]: ${tplPath}`);
            }
        } catch {
            // 截图失败不阻塞主流程
        }
        return el;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 路由层：findOne / findFirst / findAll / find / findElement
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 路由层：按 accel 选项分派到 findElement* 或 findImage*。
     * 无 accel → 逻辑等同 findElementOne。
     * 有 accel → 检查模板：存在走 findImageOne，不存在走 findElementAndCache。
     */
    async findOne(xpath: string, options?: FindOptions): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }
        if (options?.accel) {
            const tplPath = resolveTemplatePath(
                xpath,
                getAccelConfig(options.accel)?.templateDir,
                getAccelConfig(options.accel)?.templateName,
            );
            if (fs.existsSync(tplPath)) {
                return this.findImageOne(xpath, tplPath);
            }
            return this.findElementAndCache(xpath, tplPath, options);
        }
        return this.findElementOne(xpath, options);
    }

    /**
     * 路由层：findFirst。逻辑同 findOne，无 accel 时等同 findElementFirst。
     */
    async findFirst(xpath: string, options?: FindOptions): Promise<Element> {
        if (!this.windowSelector) {
            throw new StateError('请先调用 window() 方法设置目标窗口', 'no_window');
        }
        if (options?.accel) {
            const tplPath = resolveTemplatePath(
                xpath,
                getAccelConfig(options.accel)?.templateDir,
                getAccelConfig(options.accel)?.templateName,
            );
            if (fs.existsSync(tplPath)) {
                return this.findImageOne(xpath, tplPath);
            }
            return this.findElementAndCache(xpath, tplPath, options);
        }
        return this.findElementFirst(xpath, options);
    }

    /**
     * find 的别名（findFirst 语义）。
     */
    async find(xpath: string, options?: FindOptions): Promise<Element> {
        return this.findFirst(xpath, options);
    }

    /**
     * findAll。图像不支持多元素匹配，始终走 UIA。
     */
    async findAll(xpath: string, options?: FindOptions): Promise<ElementList> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before findAll()', 'no_window');
        }
        return this.findElementAll(xpath, options);
    }

    /**
     * 统一入口：根据 xpath 末尾标记分派到 findElementAll / findElementOne / findElementFirst。
     *
     * - `//Button` → findElementFirst（默认）
     * - `//Button:all` → findElementAll
     * - `//Button:onlyone` → findElementOne
     */
    async findElement(xpath: string, options?: FindOptions): Promise<Element | ElementList> {
        const { xpath: cleanXpath, mode } = parseXpathMarker(xpath);
        switch (mode) {
            case 'all':
                return this.findElementAll(cleanXpath, options);
            case 'one':
                return this.findOne(cleanXpath, options);
            case 'first':
            default:
                return this.findFirst(cleanXpath, options);
        }
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
     * 等待元素出现。复用 findOne 路由（支持 accel 图像加速）。
     */
    async waitFor(xpath: string, options?: FindOptions & { timeout?: number; interval?: number }): Promise<Element> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                return await this.findOne(xpath, { ...options, _silent: true });
            } catch {
                if (Date.now() - startTime >= timeout) break;
                await delay(interval);
            }
        }
        throw new TimeoutError(`waitFor(${xpath})`, timeout);
    }

    /**
     * 等待元素消失。复用 findOne 路由（支持 accel 图像加速）。
     */
    async waitUntilGone(xpath: string, options?: FindOptions & { timeout?: number; interval?: number }): Promise<void> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before waitUntilGone()', 'no_window');
        }

        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                await this.findOne(xpath, { ...options, _silent: true });
            } catch {
                return; // 元素不存在 = 已消失
            }
            await delay(interval);
        }

        throw new Error(`Element did not disappear within ${timeout}ms: ${xpath}`);
    }

    /**
     * 检测元素是否存在（快照，不轮询）。复用 findOne 路由（支持 accel 图像加速）。
     * @returns boolean — 存在返回 true，不存在返回 false
     */
    async exists(xpath: string, options?: FindOptions): Promise<boolean> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before exists()', 'no_window');
        }
        try {
            await this.findOne(xpath, { ...options, _silent: true });
            return true;
        } catch {
            return false;
        }
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
                        window: this.windowSelector ?? undefined,
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
     * @param options.autoScrollAmount - 是否自动调整滚动量，默认 true
     * @param options.scrollAmountRatio - 容器高度倍率（0-1），默认 0.8
     * @param options.scrollInterval - 每次滚动后的等待时间（ms），默认 1000
     * @param options.scrollToCenter - 是否滚动到视口中心，默认 true
     * @param options.centerAdjustTimes - scrollToCenter 最大调整次数，默认 5
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
     * // 图像加速：首次 UIA + 自动缓存，后续纯图像匹配
     * const result = await flow.scrollToVisible(target, container, { accel: true });
     */
    async scrollToVisible(
        xpath: string,
        containerXpath?: string,
        options?: ScrollToVisibleOptions
    ): Promise<ScrollToVisibleResult> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollToVisible()', 'no_window');
        }

        // accel 分派
        if (options?.accel) {
            const tplPath = resolveTemplatePath(
                xpath,
                getAccelConfig(options.accel)?.templateDir,
                getAccelConfig(options.accel)?.templateName,
            );
            if (fs.existsSync(tplPath)) {
                // 模板已缓存 → 纯图像路径
                return this.scrollImageVisible(xpath, containerXpath, tplPath, options);
            }
            // 模板不存在 → UIA 首次 + 自动缓存
            const result = await this.scrollElementVisible(xpath, containerXpath, options);
            try {
                const el = await this.findElementFirst(xpath);
                const rect = el.info.rect;
                if (rect && rect.width >= 5 && rect.height >= 5) {
                    const base64 = await this.captureScreenshot(rect);
                    const dir = path.dirname(tplPath);
                    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                    fs.writeFileSync(tplPath, Buffer.from(base64, 'base64'));
                    this.logger.logDebug(`accel [模板已缓存]: ${tplPath}`);
                }
            } catch { /* 截图失败不阻塞 */ }
            return result;
        }

        return this.scrollElementVisible(xpath, containerXpath, options);
    }

    /**
     * 纯 UIA 滚动到可见（scrollToVisible 核心逻辑）。
     */
    private async scrollElementVisible(
        xpath: string,
        containerXpath?: string,
        options?: ScrollToVisibleOptions,
    ): Promise<ScrollToVisibleResult> {
        const direction = options?.direction ?? 'down';
        const timeout = options?.timeout ?? DEFAULTS.scrollToVisible.timeout;
        const scrollTimes = options?.scrollTimes ?? DEFAULTS.scrollToVisible.scrollTimes;
        const autoScrollAmount = options?.autoScrollAmount ?? DEFAULTS.scrollToVisible.autoScrollAmount;
        const scrollAmountRatio = options?.scrollAmountRatio ?? DEFAULTS.scrollToVisible.scrollAmountRatio;
        if (autoScrollAmount && options?.smoothStepDelta && options.smoothStepDelta > 0) {
            console.warn(`[scrollToVisible] autoScrollAmount=true 与 smoothStepDelta=${options.smoothStepDelta} 互斥，autoScrollAmount 优先`);
        }
        const scrollInterval = options?.scrollInterval ?? DEFAULTS.scrollToVisible.scrollInterval;
        const scrollToCenter = options?.scrollToCenter ?? DEFAULTS.scrollToVisible.scrollToCenter;
        const centerAdjustTimes = options?.centerAdjustTimes ?? DEFAULTS.scrollToVisible.centerAdjustTimes;
        const autoScrollDelay = options?.autoScrollDelay ?? DEFAULTS.scrollToVisible.autoScrollDelay;
        const minScrollRatio = options?.minScrollRatio ?? DEFAULTS.scrollToVisible.minScrollRatio;
        const centerSnapThreshold = options?.centerSnapThreshold ?? DEFAULTS.scrollToVisible.centerSnapThreshold;
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
            return { visible: true, scrolledToEnd: false, scrolled: 0 };
        }

        // ── 阶段 2：目标不存在 → 在容器上按 direction 滚动直到出现 ──
        if (!element) {
            if (Date.now() - startTime >= timeout) {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }
            const remainingTimeout = timeout - (Date.now() - startTime);
            const delta = direction === 'up' ? 120 : -120;
            let scrollResult;
            try {
                scrollResult = await this.client.scrollMouse({
                    window: this.windowSelector ?? undefined,
                    element: scrollContainer,
                    delta,
                    times: scrollTimes,
                    autoScrollAmount,
                    scrollAmountRatio,
                    wait: xpath,
                    waitMode: 'visible',
                    timeout: remainingTimeout,
                    scrollToCenter,
                    centerAdjustTimes,
                    scrollInterval,
                    autoScrollDelay,
                    minScrollRatio,
                    centerSnapThreshold,
                    viewportInset,
                    smoothStepDelta: options?.smoothStepDelta,
                });
            } catch {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }
            if (scrollResult.scrolledToEnd) {
                return {
                    visible: false,
                    scrolledToEnd: true,
                    scrolled: scrollResult.scrolled,
                    targetRect: scrollResult.targetRect,
                    visibleRect: scrollResult.visibleRect,
                };
            }
            try {
                element = await this.findFirst(xpath);
            } catch {
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
            if (Date.now() - startTime >= timeout) {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }
            try {
                return await element.scrollToVisible(scrollContainer, {
                    direction,
                    times: scrollTimes,
                    autoScrollAmount,
                    scrollToCenter,
                    centerAdjustTimes,
                    scrollInterval,
                    autoScrollDelay,
                    minScrollRatio,
                    centerSnapThreshold,
                    viewportInset,
                    smoothStepDelta: options?.smoothStepDelta,
                });
            } catch {
                return { visible: false, scrolledToEnd: false, scrolled: 0 };
            }
        }

        return { visible: true, scrolledToEnd: false, scrolled: 0 };
    }

    /**
     * 纯图像滚动到可见：调用 server 端原生 scroll-find API。
     * 滚动 + 截图 + 匹配 在 server 内存中完成，单次 HTTP 调用，~30fps。
     */
    private async scrollImageVisible(
        xpath: string,
        containerXpath: string | undefined,
        tplPath: string,
        options: ScrollToVisibleOptions,
    ): Promise<ScrollToVisibleResult> {
        const templateBase64 = fs.readFileSync(tplPath).toString('base64');
        const container = containerXpath || xpath;
        const direction = options?.direction ?? 'down';

        // 获取容器 rect 确定采样区域
        const containerRect = await this._getContainerRect(container);
        const sampleRegion = containerRect
            ? { x: containerRect.x, y: containerRect.y, width: containerRect.width, height: containerRect.height }
            : undefined;

        // 一次 HTTP 调用完成全部：滚动 + 截图 + 匹配
        const sed = { ...DEFAULTS.scrollToVisible.scrollEndDetection, ...options?.scrollEndDetection };
        const si = { ...DEFAULTS.scrollToVisible.scrollInset, ...options?.scrollInset };
        const result = await this.client.scrollFind({
            templateBase64,
            scrollContainer: container,
            windowSelector: this.windowSelector!,
            direction,
            scrollDelta: direction === 'up' ? 120 : -120,
            sampleRegion,
            maxScrolls: options?.scrollTimes ?? 200,
            scrollIntervalMs: options?.scrollInterval ?? 33,
            timeoutMs: options?.timeout ?? 120000,
            scrollEndDetection: sed,
            scrollInset: si,
            scrollFindThreading: { ...DEFAULTS.scrollToVisible.scrollFindThreading, ...options?.scrollFindThreading },
        });

        if (result.found && result.match) {
            return {
                visible: true,
                scrolledToEnd: false,
                scrolled: result.scrolled,
                targetRect: { x: result.match.x, y: result.match.y, width: result.match.width, height: result.match.height },
            };
        }
        return { visible: false, scrolledToEnd: result.scrolledToEnd ?? false, scrolled: result.scrolled };
    }

    /**
     * 截图采样变化率检测（scrollDetectByImage）。
     * 截取容器底部区域，滚动一次，对比前后变化率。
     */
    async scrollDetectByImage(
        container: string,
        options?: { sampleRatio?: number; threshold?: number; direction?: 'up' | 'down'; scrollDelayMs?: number; rollback?: boolean },
    ): Promise<ScrollDetectResult> {
        const sampleRatio = options?.sampleRatio ?? 0.2;
        const threshold = options?.threshold ?? 0.02;
        const dir = options?.direction ?? 'down';
        const scrollDelayMs = options?.scrollDelayMs ?? 500;
        const delta = dir === 'down' ? -120 : 120;

        // 1. 获取容器 rect
        const containerRect = await this._getContainerRect(container);
        if (!containerRect) {
            return { success: false, atEnd: false, watchedCount: 0, changedCount: 0, details: [], rolledBack: false, error: `容器未找到: ${container}` };
        }

        // 2. 底部采样区域
        const sampleH = Math.max(1, Math.floor(containerRect.height * sampleRatio));
        const sampleRegion: Rect = {
            x: containerRect.x,
            y: containerRect.y + containerRect.height - sampleH,
            width: containerRect.width,
            height: sampleH,
        };

        // 3. 截取第一帧
        const frame1 = await this.captureScreenshot(sampleRegion);

        // 4. 滚动一次
        await this.client.scrollMouse({ window: this.windowSelector ?? undefined, element: container, delta, times: 1 });
        await delay(scrollDelayMs);

        // 5. 截取第二帧
        const frame2 = await this.captureScreenshot(sampleRegion);

        // 6. 对比变化率
        const compareResult = await this.client.compareImages({ image1Base64: frame1, image2Base64: frame2 });
        const changeRate = compareResult.changeRate ?? 1.0;
        const atEnd = changeRate < threshold;

        // 7. 可选回滚
        if (options?.rollback && !atEnd) {
            await this.client.scrollMouse({ window: this.windowSelector ?? undefined, element: container, delta: -delta, times: 1 });
            await delay(scrollDelayMs);
        }

        return {
            success: true,
            atEnd,
            watchedCount: 0,
            changedCount: atEnd ? 0 : 1,
            details: [],
            rolledBack: options?.rollback ?? false,
            error: null,
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 等待
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 条件等待
     */
    async waitUntil(condition: () => Promise<boolean>, options?: { timeout?: number; interval?: number }): Promise<void> {
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
     */
    async type(text: string, xpath?: string, options?: TypeOptions): Promise<void> {
        if (xpath) {
            const element = await this.find(xpath);
            await element.type(text, options);
        } else {
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
            } else if (this.autoWaitConfig.enable) {
                // 仅在没有配置 waitAfter 且 autoWait 启用时才使用
                await this.maybeAutoWait('afterType');
            }
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
                movePath: options?.movePath ?? DEFAULTS.move.movePath,
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
     * 在指定屏幕坐标点击（移动 + 点击一步完成）
     *
     * @param x 屏幕 X 坐标
     * @param y 屏幕 Y 坐标
     * @param options 点击选项
     *
     * @example
     * await flow.clickAt(500, 300);                    // 左键点击
     * await flow.clickAt(500, 300, { button: 'right' }); // 右键点击
     * await flow.clickAt(500, 300, { humanize: false }); // 直线移动
     */
    async clickAt(x: number, y: number, options?: {
        humanize?: boolean;
        duration?: number;
        button?: 'left' | 'right';
        pauseBefore?: number;
        pauseAfter?: number;
    }): Promise<void> {
        const result = await this.client.clickAtCoordinate({
            x,
            y,
            window: this.windowSelector as string,
            options,
        });
        if (!result.success) {
            throw new Error(`clickAt failed: ${result.error}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 元素便捷操作（find + action 一步到位）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 查找元素并点击
     */
    async click(xpath: string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.click(options);
    }

    /**
     * 查找元素并双击
     */
    async doubleClick(xpath: string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.dblclick();
    }

    /**
     * 查找元素并右键点击
     */
    async rightClick(xpath: string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.rightClick();
    }

    /**
     * 查找元素并点击上方
     *
     * @param xpath 元素 XPath
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**高度**
     * @param options 透传 ClickOptions
     */
    async clickAbove(xpath: string, distance?: number | string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.clickAbove(distance, options);
    }

    /**
     * 查找元素并点击下方
     *
     * @param xpath 元素 XPath
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**高度**
     * @param options 透传 ClickOptions
     */
    async clickBelow(xpath: string, distance?: number | string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.clickBelow(distance, options);
    }

    /**
     * 查找元素并点击左侧
     *
     * @param xpath 元素 XPath
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**宽度**
     * @param options 透传 ClickOptions
     */
    async clickLeft(xpath: string, distance?: number | string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.clickLeft(distance, options);
    }

    /**
     * 查找元素并点击右侧
     *
     * @param xpath 元素 XPath
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**宽度**
     * @param options 透传 ClickOptions
     */
    async clickRight(xpath: string, distance?: number | string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.clickRight(distance, options);
    }

    /**
     * 查找元素并聚焦
     */
    async focus(xpath: string, options?: ClickOptions): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
        await element.focus();
    }

    /**
     * 查找元素、清空内容后输入新文本
     */
    async setValue(xpath: string, text: string, options?: TypeOptions & { accel?: AccelConfig }): Promise<void> {
        const findOpts = options?.accel ? { accel: options.accel } : undefined;
        const element = await this.findOne(xpath, findOpts);
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
     * @param options - 滚动选项：scrollAmount（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
     */
    async scrollUp(xpath: string, times?: number, options?: ScrollOptions): Promise<void> {
        await this._scroll(xpath, times, options, /* direction */ 1);
    }

    /**
     * 向下滚动（视口下移，看到下方内容，delta 为负）
     * @param xpath - 鼠标悬停的元素 XPath（滚动发生在此元素上）
     * @param times - 滚动次数（默认由 DEFAULTS.scroll.times 配置）
     * @param options - 滚动选项：scrollAmount（每次滚动量）、wait（等待出现的 xpath）、timeout（等待超时）、useIdle（是否启用 pushIdle）
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
        const autoScrollAmount = options?.autoScrollAmount ?? DEFAULTS.scroll.autoScrollAmount;
        const scrollAmountRatio = options?.scrollAmountRatio ?? DEFAULTS.scroll.scrollAmountRatio;
        const baseScrollAmount = options?.scrollAmount ?? DEFAULTS.scroll.scrollAmount;
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
                            window: this.windowSelector ?? undefined,
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
                    : baseScrollAmount * direction;

                if (autoScrollAmount && i === 0) {
                    // 首次使用固定 delta 滚动
                    try {
                        await this.client.scrollMouse({
                            element: xpath,
                            delta: currentDelta,
                            times: 1,
                            autoScrollAmount: false, // 首次不使用 autoScrollAmount
                        });
                    } catch {
                        // scrollMouse 失败，停止滚动
                        break;
                    }

                    // 查询容器 rect 获取高度
                    try {
                        const rect = await this._getContainerRect(xpath);
                        if (rect && rect.height > 0) {
                            adaptiveDelta = Math.round(rect.height * scrollAmountRatio);
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
                            autoScrollAmount: false,
                        });
                    } catch {
                        // scrollMouse 失败，停止滚动
                        break;
                    }
                }

                // 滚动间隔，给页面响应时间
                if (i < effectiveTimes - 1) {
                    await delay(options?.scrollInterval ?? DEFAULTS.scroll.scrollInterval);
                }
            }

            // 如果有 wait xpath 但循环结束仍未找到
            if (waitXpath) {
                try {
                    await this.client.find({
                        window: this.windowSelector ?? undefined,
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
        options?: {
            controlTypes?: string[];
            direction?: 'up' | 'down';
            exclude?: string[];
            rollback?: boolean;
            scrollDelayMs?: number;
            sampleRatio?: number;
            threshold?: number;
            accel?: AccelConfig;
        }
    ): Promise<ScrollDetectResult> {
        if (!this.windowSelector) {
            throw new StateError('Must call window() before scrollDetect()', 'no_window');
        }

        if (options?.accel) {
            return this.scrollDetectByImage(container, {
                sampleRatio: options.sampleRatio,
                threshold: options.threshold,
                direction: options.direction,
            scrollDelayMs: options?.scrollDelayMs,
                rollback: options.rollback,
            });
        }

        return this.scrollDetectByElement(container, options);
    }

    /**
     * 纯 UIA 滚动检测（scrollDetect 核心逻辑）。
     */
    private async scrollDetectByElement(
        container: string,
        options?: { controlTypes?: string[]; direction?: 'up' | 'down'; exclude?: string[]; rollback?: boolean; scrollDelayMs?: number }
    ): Promise<ScrollDetectResult> {
        return this.client.scrollDetect({
            window: this.windowSelector!,
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
            humanDetect: options?.humanDetect ?? this.defaultIdleOptions.humanDetect,
        };

        // 构建人工检测配置
        const humanDetect = mergedOptions.humanDetect ? {
            enable: mergedOptions.humanDetect.enable ?? true,
            pauseOnMouse: mergedOptions.humanDetect.pauseOnMouse ?? true,
            pauseOnKeyboard: mergedOptions.humanDetect.pauseOnKeyboard ?? true,
            resumeDelay: mergedOptions.humanDetect.resumeDelay ?? 3000,
        } : undefined;

        await this.client.startIdleMotion({
            window: windowSelector,
            xpath,
            speed: mergedOptions.speed,
            moveInterval: mergedOptions.moveInterval,
            humanDetect,
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
            humanDetect: options?.humanDetect ?? this.defaultIdleOptions.humanDetect,
        };

        // 构建人工检测配置
        const humanDetect = mergedOptions.humanDetect ? {
            enable: mergedOptions.humanDetect.enable ?? true,
            pauseOnMouse: mergedOptions.humanDetect.pauseOnMouse ?? true,
            pauseOnKeyboard: mergedOptions.humanDetect.pauseOnKeyboard ?? true,
            resumeDelay: mergedOptions.humanDetect.resumeDelay ?? 3000,
        } : undefined;

        await this.client.startIdleMotion({
            window: windowSelector,
            xpath,
            speed: mergedOptions.speed,
            moveInterval: mergedOptions.moveInterval,
            humanDetect,
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
            humanDetect: {
                enable: true,
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
        if (!this.autoWaitConfig.enable) return;

        const waitMs = this.autoWaitConfig.delays[phase];
        if (waitMs && waitMs > 0) {
            await delay(waitMs);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 截图 & 图像匹配 API
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 截取指定屏幕区域，返回 base64 PNG
     */
    async captureScreenshot(region: { x: number; y: number; width: number; height: number }): Promise<string> {
        const result = await this.client.captureScreenshot(region);
        if (!result.success || !result.base64) {
            throw new Error(result.error || 'Screenshot capture failed');
        }
        return result.base64;
    }

    /**
     * 截取全屏，返回 base64 PNG
     */
    async captureDesktopScreenshot(): Promise<string> {
        const result = await this.client.captureDesktopScreenshot();
        if (!result.success || !result.base64) {
            throw new Error(result.error || 'Desktop screenshot capture failed');
        }
        return result.base64;
    }

    /**
     * 把 FindImageOptions.region 解析为屏幕坐标矩形。
     *
     * - `'window'` 或省略 → 当前窗口矩形（须先 flow.window()）
     * - `'element'` → 通过 scrollContainer XPath 查找元素矩形
     * - 显式 `Rect` → 直接返回
     */
    private async resolveImageRegion(opt?: 'window' | 'element' | Rect, scrollContainer?: string): Promise<Rect> {
        if (opt && typeof opt === 'object') return opt;
        if (opt === 'element') {
            if (!scrollContainer) throw new Error("region='element' 需要 scrollContainer 参数");
            const rect = await this._getContainerRect(scrollContainer);
            if (!rect) throw new Error(`scrollContainer 元素未找到: ${scrollContainer}`);
            return rect;
        }
        // 默认 / 'window'
        if (!this._currentWindowInfo?.rect) {
            throw new StateError(
                'findImage 需要先 flow.window(...) 设置当前窗口；' +
                    '或使用 flow.findImageOnDesktop(...) 进行全屏查找',
            );
        }
        return this._currentWindowInfo.rect;
    }

    /**
     * 在**当前窗口区域**内查找匹配的图像位置。
     *
     * 默认作用域是 `flow.window()` 设置的当前窗口矩形。如果没有调用过
     * `flow.window(...)` 则抛 `StateError`——绝不静默 fallback 到全屏。
     * 全屏查找请显式使用 {@link findImageOnDesktop}。
     *
     * @param template 模板图像：base64 字符串 / 文件路径 / Buffer
     * @param options 匹配选项；`region` 可设为 `'window'`（默认）或显式 `Rect`
     * @returns 命中数组（按算法返回顺序）
     */
    async findImage(template: Template, options?: FindImageOptions): Promise<FindImageMatch[]> {
        const { base64: templateBase64, meta } = await resolveTemplate(template);
        const templateDpi = meta?.dpi;
        const region = await this.resolveImageRegion(options?.region, options?.scrollContainer);
        const cacheKey = this._imageCacheKey(template);

        // ─── 位置缓存快速路径 ───
        if (options?.usePositionCache && region) {
            const cached = this._imagePositionCache.get(cacheKey);
            if (cached) {
                const subRegion = this._expandPositionCache(cached, region);
                const result = await this.client.findImage({
                    templateBase64,
                    precision: options?.precision,
                    algorithm: options?.algorithm,
                    region: subRegion,
                    templateDpi,
                }).catch(() => null);
                if (result && result.matches.length > 0) {
                    this._updatePositionCache(cacheKey, result.matches[0], region);
                    this.logger.logDebug(
                        `findImage [位置缓存命中]: 命中 ${result.matches.length} 个`,
                        { first: result.matches[0] },
                    );
                    return result.matches;
                }
                // 缓存区域未命中，fallback 全窗口
            }
        }

        // ─── 全窗口搜索 ───
        const result = await this.client.findImage({
            templateBase64,
            precision: options?.precision,
            algorithm: options?.algorithm,
            region,
            templateDpi,
        });
        if (result.error) throw new Error(result.error);

        // 更新位置缓存
        if (options?.usePositionCache && region && result.matches.length > 0) {
            this._updatePositionCache(cacheKey, result.matches[0], region);
        }

        this.logger.logDebug(
            `findImage: 命中 ${result.matches.length} 个`,
            result.matches.length > 0 ? { first: result.matches[0] } : undefined,
        );
        return result.matches;
    }

    // ─── 位置缓存内部工具 ───

    private _imageCacheKey(template: Template): string {
        if (typeof template === 'string' && template.length < 260 && !/^[A-Za-z0-9+/]+=*$/.test(template)) {
            return template; // 文件路径
        }
        // base64 / Buffer → 取前 32 字符做 key（碰撞概率极低）
        const s = typeof template === 'string' ? template : template.toString('base64');
        return s.slice(0, 32);
    }

    /** 把归一化坐标扩展为以该点为中心、2× 模板宽高的子区域 Rect */
    private _expandPositionCache(
        cached: { nx: number; ny: number },
        windowRect: Rect,
    ): Rect {
        // 用 200×200 像素的搜索窗口（模板真实尺寸未知，用固定值兜底）
        const halfSize = 100;
        const cx = Math.round(windowRect.x + cached.nx * windowRect.width);
        const cy = Math.round(windowRect.y + cached.ny * windowRect.height);
        return {
            x: Math.max(windowRect.x, cx - halfSize),
            y: Math.max(windowRect.y, cy - halfSize),
            width: Math.min(halfSize * 2, windowRect.width),
            height: Math.min(halfSize * 2, windowRect.height),
        };
    }

    private _updatePositionCache(
        key: string,
        match: FindImageMatch,
        windowRect: Rect,
    ): void {
        const nx = (match.x - windowRect.x) / windowRect.width;
        const ny = (match.y - windowRect.y) / windowRect.height;
        this._imagePositionCache.set(key, { nx, ny });
    }

    /**
     * 等价于 {@link findImage}，语义强调"返回所有命中"。
     */
    async findAllImages(template: Template, options?: FindImageOptions): Promise<FindImageMatch[]> {
        return this.findImage(template, options);
    }

    /**
     * 串行尝试一组模板，返回第一个有命中的（含模板索引）。
     */
    async findFirstImage(
        templates: Template[],
        options?: FindImageOptions,
    ): Promise<{ match: FindImageMatch; index: number; template: Template }> {
        for (let i = 0; i < templates.length; i++) {
            const matches = await this.findImage(templates[i], options).catch((e) => {
                if (e instanceof StateError) throw e;
                return [] as FindImageMatch[];
            });
            if (matches.length > 0) {
                return { match: matches[0], index: i, template: templates[i] };
            }
        }
        throw new ElementNotFoundError(
            '//image-match-any',
            `任一模板均未命中（共尝试 ${templates.length} 个）`,
        );
    }

    /**
     * 当前窗口区域内是否存在匹配图像。`StateError` 仍会向上抛出。
     */
    async existsImage(template: Template, options?: FindImageOptions): Promise<boolean> {
        try {
            const matches = await this.findImage(template, options);
            return matches.length > 0;
        } catch (e) {
            if (e instanceof StateError) throw e;
            this.logger.logDebug(`existsImage failed: ${e instanceof Error ? e.message : e}`);
            return false;
        }
    }

    /**
     * 等待图像在当前窗口区域出现，超时抛 `TimeoutError`。
     */
    async waitForImage(
        template: Template,
        options?: FindImageOptions,
    ): Promise<FindImageMatch> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const matches = await this.findImage(template, options).catch((e) => {
                if (e instanceof StateError) throw e;
                return [] as FindImageMatch[];
            });
            if (matches.length > 0) return matches[0];
            await delay(interval);
        }
        throw new TimeoutError('waitForImage', timeout);
    }

    /**
     * 等待图像在当前窗口区域消失，超时抛 `TimeoutError`。
     */
    async waitUntilImageGone(
        template: Template,
        options?: FindImageOptions,
    ): Promise<void> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const matches = await this.findImage(template, options).catch((e) => {
                if (e instanceof StateError) throw e;
                return [] as FindImageMatch[];
            });
            if (matches.length === 0) return;
            await delay(interval);
        }
        throw new TimeoutError('waitUntilImageGone', timeout);
    }

    /**
     * 在当前窗口区域查找图像并点击命中位置。
     *
     * - 默认点第 0 个命中的中心点
     * - `all: true` 时依次点击所有命中，返回数组
     * - `clickArea` 支持 Inset 模型（与元素族 ClickArea 一致）
     * - 未 `flow.window()` 抛 `StateError`
     */
    async clickImage(
        template: Template,
        options?: FindImageOptions & ImageClickOptions,
    ): Promise<FindImageMatch | FindImageMatch[]> {
        const matches = await this.findImage(template, options);
        if (matches.length === 0) {
            throw new ElementNotFoundError('//image-match', '当前窗口未找到匹配图像');
        }

        if (options?.all) {
            for (const m of matches) {
                const { x, y } = computeImageClickPoint(m, options?.clickArea);
                await this.client.clickAtCoordinate({
                    x, y,
                    window: this.windowSelector ?? undefined,
                    options: { button: options?.button ?? 'left' },
                });
                if (options?.doubleClick) {
                    await this.client.clickAtCoordinate({
                        x, y,
                        window: this.windowSelector ?? undefined,
                        options: { button: options?.button ?? 'left' },
                    });
                }
            }
            return matches;
        }

        const idx = options?.nth ?? 0;
        const m = matches[idx] ?? matches[0];
        const { x, y } = computeImageClickPoint(m, options?.clickArea);
        this.logger.logSuccess('clickImage', {
            clickPoint: { x, y },
            matchConfidence: m.confidence,
        });
        await this.client.clickAtCoordinate({
            x, y,
            window: this.windowSelector ?? undefined,
            options: { button: options?.button ?? 'left' },
        });
        if (options?.doubleClick) {
            await this.client.clickAtCoordinate({
                x, y,
                window: this.windowSelector ?? undefined,
                options: { button: options?.button ?? 'left' },
            });
        }
        return m;
    }

    // ─── 全屏族（OnDesktop）────────────────────────────────────────────────────
    //
    // 这一组函数与上面"窗口族"严格分离：作用域是整个桌面（或调用方显式
    // 指定的屏幕坐标矩形），不依赖 flow.window()。命名后缀 OnDesktop 是
    // 唯一的全屏入口标识——不通过 fullscreen flag 切换语义。

    /**
     * 在**全屏**范围内查找匹配的图像位置。可通过 `region` 限定子矩形。
     *
     * 与 {@link findImage} 不同，本方法不依赖 `flow.window()`。
     */
    async findImageOnDesktop(
        template: Template,
        options?: { precision?: number; algorithm?: 'segmented' | 'fft'; region?: Rect },
    ): Promise<FindImageMatch[]> {
        const { base64: templateBase64, meta } = await resolveTemplate(template);
        const result = await this.client.findImage({
            templateBase64,
            precision: options?.precision,
            algorithm: options?.algorithm,
            region: options?.region,
            templateDpi: meta?.dpi,
        });
        if (result.error) throw new Error(result.error);
        return result.matches;
    }

    /**
     * 全屏查找图像并点击命中位置。
     */
    async clickImageOnDesktop(
        template: Template,
        options?: { precision?: number; algorithm?: 'segmented' | 'fft'; region?: Rect } & ImageClickOptions,
    ): Promise<FindImageMatch> {
        const matches = await this.findImageOnDesktop(template, options);
        if (matches.length === 0) {
            throw new ElementNotFoundError('//image-match', '桌面未找到匹配图像');
        }
        const idx = options?.nth ?? 0;
        const m = matches[idx] ?? matches[0];
        const { x, y } = computeImageClickPoint(m, options?.clickArea);
        await this.client.clickAtCoordinate({
            x, y,
            options: { button: options?.button ?? 'left' },
        });
        if (options?.doubleClick) {
            await this.client.clickAtCoordinate({
                x, y,
                options: { button: options?.button ?? 'left' },
            });
        }
        return m;
    }

    /**
     * 等待图像在全屏范围出现，超时抛 `TimeoutError`。
     */
    async waitForImageOnDesktop(
        template: Template,
        options?: FindImageOptions,
    ): Promise<FindImageMatch> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const start = Date.now();
        const desktopOpts = {
            precision: options?.precision,
            algorithm: options?.algorithm,
            region: typeof options?.region === 'object' ? options.region : undefined,
        };
        while (Date.now() - start < timeout) {
            const matches = await this.findImageOnDesktop(template, desktopOpts).catch(() => [] as FindImageMatch[]);
            if (matches.length > 0) return matches[0];
            await delay(interval);
        }
        throw new TimeoutError('waitForImageOnDesktop', timeout);
    }

    // ─── 调试可视化 ───────────────────────────────────────────────────────

    /**
     * 截屏 + 模板匹配 + 在截图上画红框标注命中位置，返回 base64 PNG。
     *
     * 用于脚本调试：直观看到模板在屏幕上的匹配位置，保存到文件后
     * 可直接打开查看。
     *
     * @returns `{ base64, matches, width, height }` — base64 是标注后的 PNG
     *
     * @example
     * const viz = await flow.captureMatchVisualization('./images/btn.png');
     * require('fs').writeFileSync('debug-match.png', Buffer.from(viz.base64, 'base64'));
     */
    async captureMatchVisualization(
        template: Template,
        options?: FindImageOptions & { strokeWidth?: number },
    ): Promise<{ base64: string; matches: FindImageMatch[]; width: number; height: number }> {
        const { base64: templateBase64, meta } = await resolveTemplate(template);
        const region = await this.resolveImageRegion(options?.region, options?.scrollContainer);
        const result = await this.client.visualizeImage({
            templateBase64,
            precision: options?.precision,
            algorithm: options?.algorithm,
            region,
            strokeWidth: options?.strokeWidth,
        });
        if (!result.success || !result.base64) {
            throw new Error(result.error || '可视化生成失败');
        }
        return {
            base64: result.base64,
            matches: result.matches,
            width: result.width!,
            height: result.height!,
        };
    }

    // ─── 滚动找图 ───────────────────────────────────────────────────────────

    /**
     * 在滚动容器内滚动查找图像。
     *
     * 采用双线程并行：一个线程持续滚动，另一个线程持续截图匹配。
     * 任一线程先完成（命中 / 滚到底 / 超时）则终止。
     *
     * @param template - 模板图像
     * @param options - 滚动 + 匹配参数
     * @returns 第一个命中
     * @throws ElementNotFoundError 滚到底仍未找到
     * @throws TimeoutError 超时
     */
    async scrollToImage(
        template: Template,
        options?: {
            /** 滚动容器 XPath（鼠标移到此元素中心执行滚动） */
            scrollContainer: string;
            /** 搜索区域：'window'=当前窗口矩形，'element'=容器矩形，或显式 Rect */
            region?: 'window' | 'element' | Rect;
            precision?: number;
            algorithm?: 'segmented' | 'fft';
            /** 最大滚动次数，默认 50 */
            maxScrolls?: number;
            /** 滚动间隔 ms，默认 1000 */
            scrollInterval?: number;
            /** 匹配间隔 ms，默认 500 */
            matchInterval?: number;
            /** 总超时 ms，默认 60000 */
            timeout?: number;
            /** 滚动前是否在容器上 pushIdle（鼠标悬停） */
            useIdle?: boolean;
        },
    ): Promise<FindImageMatch> {
        const maxScrolls = options?.maxScrolls ?? 50;
        const scrollInterval = options?.scrollInterval ?? 1000;
        const matchInterval = options?.matchInterval ?? 500;
        const timeout = options?.timeout ?? 60000;
        const startTime = Date.now();
        const container = options?.scrollContainer;
        if (!container) {
            throw new InvalidArgumentError('scrollContainer', 'scrollToImage 需要 scrollContainer 参数');
        }

        // pushIdle（可选）
        if (options?.useIdle) {
            await this.pushIdle(container);
        }

        // 共享状态
        const state = {
            found: false,
            match: null as FindImageMatch | null,
            scrollEnded: false,
        };

        // ─── 匹配线程 ───
        const matchThread = (async () => {
            while (!state.found && !state.scrollEnded && Date.now() - startTime < timeout) {
                try {
                    const regionOpt: 'window' | 'element' | Rect =
                        options?.region === 'element' ? 'element' : (options?.region ?? 'window');
                    const matches = await this.findImage(template, {
                        precision: options?.precision,
                        algorithm: options?.algorithm,
                        region: regionOpt,
                        scrollContainer: regionOpt === 'element' ? container : undefined,
                    }).catch(() => []);
                    if (matches.length > 0) {
                        state.match = matches[0];
                        state.found = true;
                        return;
                    }
                } catch {
                    // findImage 可能因 StateError 等失败，忽略
                }
                await delay(matchInterval);
            }
        })();

        // ─── 滚动线程 ───
        const scrollThread = (async () => {
            for (let i = 0; i < maxScrolls; i++) {
                if (state.found || Date.now() - startTime >= timeout) break;
                try {
                    await this.scrollDown(container, 1, {
                        scrollInterval,
                        useIdle: false,
                    });
                    // 检测是否到底
                    const detect = await this.scrollDetect(container, {
                        direction: 'down',
                        rollback: false,
                    }).catch(() => ({ atEnd: true }));
                    if (detect.atEnd) {
                        state.scrollEnded = true;
                        break;
                    }
                } catch {
                    state.scrollEnded = true;
                    break;
                }
            }
            state.scrollEnded = true;
        })();

        // ─── 等待任一线程 ───
        await Promise.race([matchThread, scrollThread]);

        // popIdle（可选）
        if (options?.useIdle) {
            await this.popIdle().catch(() => {});
        }

        if (state.match) return state.match;

        if (!state.found) {
            throw new ElementNotFoundError('//image-match', `滚动后未找到匹配图像（maxScrolls=${maxScrolls}）`);
        }
        return state.match!;
    }
}
