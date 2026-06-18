// sdk/nodejs/src/element.ts
// Element 类 - 表示 UI 自动化中的元素对象

import { HttpClient } from './client';
import { ElementInfo, Rect, ClickOptions, TypeOptions, AutoWaitConfig, DEFAULTS, ElementList, FlashOptions, ScrollToVisibleResult, ViewportInset, InspectResponse, InspectNodeInfo, FlatInspectNodeInfo, InspectFilter, InspectOptions, InspectRegionFilter, CacheTime, FindOptions } from './types';
import { ActionFailedError, ElementNotFoundError, InvalidArgumentError } from './errors';
import { OperationLogger } from './logger';
import { delay } from './sleep';
import { assignCompassPaths } from './utils';

/**
 * 罗盘路径 token 类型
 */
type CompassToken =
    | { type: 'parent'; levels: number }
    | { type: 'child'; index: number }
    | { type: 'sibling_abs'; index: number }
    | { type: 'sibling_left'; offset: number }
    | { type: 'sibling_right'; offset: number };

/**
 * Element 类 - UI 元素的一等公民表示
 * 
 * 所有操作都在 Element 对象上执行，支持完整的 TypeScript 控制流。
 * 
 * @example
 * const button = await flow.find('//Button');
 * if (await button.isEnabled()) {
 *     await button.click();
 * }
 */
export class Element {
    readonly windowSelector: string;
    readonly findSelector: string;
    readonly info: ElementInfo;
    /** findSelector 匹配到的元素总数；>1 时操作方法自动使用属性构造唯一 XPath */
    readonly foundElementCount: number;

    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;
    /** 此元素的缓存时间 */
    private cacheTime: CacheTime;

    /**
     * 元素选择器字符串（只读）
     *
     * @example
     * const el = await flow.find('//Button');
     * console.log(el.selector);  // 读取选择器字符串
     */
    readonly selector: string;

    /** 获取 RuntimeId（用于缓存快速查找） */
    private get runtimeId(): string {
        return this.info.runtimeId || '';
    }

    constructor(
        private client: HttpClient,
        xpathStr: string,
        windowSelector: string,
        findSelector: string,
        info: ElementInfo,
        autoWaitConfig: AutoWaitConfig,
        logger: OperationLogger,
        foundElementCount: number = 1,
        cacheTime?: CacheTime,
    ) {
        this.windowSelector = windowSelector;
        this.findSelector = findSelector;
        // 防御性清理：确保 findSelector 不泄漏到 info 中（旧版后端可能仍返回 elementSelector）
        delete (info as any).elementSelector;
        this.info = info;
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;
        this.selector = xpathStr;
        this.foundElementCount = foundElementCount;
        this.cacheTime = cacheTime ?? null;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 查询方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 获取元素名称（对应 UIA Name 属性）
     */
    async name(): Promise<string> {
        return this.info.name || '';
    }

    /**
     * 获取元素文本内容（name 的 Playwright 兼容别名）
     */
    async text(): Promise<string> {
        return this.name();
    }

    /**
     * 检查元素是否可用（使用本地缓存属性，如需最新状态请先 refresh）
     */
    async isEnabled(): Promise<boolean> {
        return this.info.isEnabled;
    }

    /**
     * 获取能唯一定位此元素的 XPath 字符串。
     *
     * 根据 foundElementCount 和 propNames 自动决定：
     * - 传了 propNames → 用指定属性构造唯一 XPath
     * - foundElementCount > 1 → 自动从 info 中选取属性构造唯一 XPath
     * - 否则 → 直接返回 findSelector
     *
     * @example
     * const xpath = el.toXpath();                   // 自动解析
     * const xpath = el.toXpath('name', 'automationId'); // 手动指定属性
     */
    toXpath(...propNames: string[]): string {
        return this.resolveXpath(propNames);
    }

    /**
     * 获取元素的选择器信息（唯一定位此元素的选择器对）
     *
     * @returns 包含 windowSelector 和 elementSelector 的对象
     *
     * @example
     * const sel = el.getSelector();
     * console.log(sel.windowSelector);   // 窗口选择器
     * console.log(sel.elementSelector);   // 元素选择器（已解析为唯一 XPath）
     */
    getSelector(): { windowSelector: string; elementSelector: string } {
        return {
            windowSelector: this.windowSelector,
            elementSelector: this.resolveXpath([]),
        };
    }

    /**
     * 刷新元素最新状态（原地更新 this.info）。
     *
     * **无参数时**：通过 runtimeId 从缓存获取最新属性（~1ms，无 fallback）。
     *   - 缓存未命中/过期 → 抛出 ElementNotFoundError
     *
     * **有参数时**（propNames）：构造精确 XPath 通过 find API 重新搜索（全窗口搜索）。
     *
     * @example
     * await el.refresh();                        // runtimeId 缓存刷新
     * await el.refresh('name', 'automationId');  // XPath 重新搜索
     */
    async refresh(...propNames: string[]): Promise<void> {
        // 无参数 + 有 runtimeId → 缓存刷新
        if (propNames.length === 0 && this.runtimeId) {
            const response = await this.client.refreshByRuntimeId(
                this.windowSelector,
                this.runtimeId
            );
            if (response.found && response.element) {
                delete (response.element as any).elementSelector;
                Object.assign(this.info, response.element);
                return;
            }
            // 缓存未命中，抛出错误（无 fallback）
            throw new ElementNotFoundError(
                `runtimeId=${this.runtimeId}`,
                this.windowSelector,
                '缓存中的元素已失效，请重新查找'
            );
        }

        // 有参数 或 无 runtimeId → XPath 搜索
        const useXpath = this.resolveXpath(propNames);

        const response = await this.client.find({
            window: this.windowSelector,
            element: useXpath,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(useXpath, this.windowSelector);
        }

        delete (response.element as any).elementSelector;
        Object.assign(this.info, response.element);
    }

    /**
     * 通过 XPath 重新查找来刷新元素（基于 findFirst/findOne）。
     *
     * 适用场景：runtimeId 缓存已过期，但你知道当前元素在 DOM 中的位置没变，
     * 通过 XPath 重新找到元素，同时更新 this.info。
     *
     * @param findFn - 查找函数，返回重新找到的 Element
     *
     * @example
     * await el.refreshByXpath(() => el.find('//Button'));
     * await el.refreshByXpath(() => el.findOne('//Button[@Name="确定"]'));
     */
    async refreshByXpath(findFn: () => Promise<Element>): Promise<void> {
        const newEl = await findFn();
        delete (newEl.info as any).elementSelector;
        Object.assign(this.info, newEl.info);
    }

    /**
     * 检查元素是否可见（使用本地缓存属性，如需最新状态请先 refresh）
     */
    async isVisible(): Promise<boolean> {
        return !this.info.isOffscreen &&
               !!this.info.rect &&
               this.info.rect.width > 0 &&
               this.info.rect.height > 0;
    }

    /**
     * 检查元素是否在屏幕外（使用本地缓存属性，如需最新状态请先 refresh）
     */
    async isOffscreen(): Promise<boolean> {
        return this.info.isOffscreen;
    }

    /**
     * 实时检查元素在可视区域的位置信息（查询后端，非缓存）
     * 
     * 与 isOffscreen() 不同，此方法每次调用都会向后端发起实时请求，
     * 返回元素相对视口的可视性、溢出方向、建议滚动方向等详细信息。
     * 适合调试滚动方向问题或判断元素是否可见。
     * 
     * @param containerXPath 可选的滚动容器 XPath，提供后 visibleRect 会额外与容器矩形求交集
     * @param propNames 用于唯一标识元素的属性名列表
     * 
     * @example
     * const vis = await element.checkVisibility();
     * console.log(vis.visibility);    // "fully_visible" | "partially_visible" | "offscreen"
     * console.log(vis.position);      // "above" | "below" | "left" | "right" | "inside"
     * console.log(vis.visibleRect);   // { x: 100, y: 200, width: 300, height: 50 } — 真正可点击的区域
     * console.log(vis.overflow);      // { top: 0, bottom: 130, left: 0, right: 0 }
     * console.log(vis.scrollDirection); // "up" | "down" | "left" | "right" | null
     */
    async checkVisibility(containerXPath?: string, ...propNames: string[]): Promise<import('./types').ElementVisibilityResult> {
       const useXpath = this.resolveXpath(propNames);

        return this.client.getElementVisibility(this.windowSelector, useXpath, containerXPath, this.runtimeId || undefined);
    }

    /**
     * 遍历当前元素下的所有子元素，提取层级/控件类型/name/Text/rect/相对xpath/罗盘路径。
     *
     * 适合调试和元素结构分析：快速了解元素树的完整结构。
     * 每个节点包含 compass 字段，表示从当前元素导航到该节点的罗盘路径（如 "c1>0"），
     * 可直接传给 compass() 方法导航到对应节点。
     *
     * @param options - inspect 选项
     * @param options.format - 返回格式：'json'（默认）返回结构化树，'txt' 返回缩进文本
     * @param options.propNames - 用于唯一标识当前元素的属性名列表
     * @param options.visibleOnly - 仅保留可见元素（isOffscreen === false），regionFilter 启用时自动生效
     * @param options.regionFilter - 区域过滤：仅保留与指定区域有 RECT 交集的可见子元素
     *
     * @returns InspectResponse，包含 nodes（结构化树）或 text（格式化文本）
     *
     * @example
     * // JSON 格式（默认）
     * const result = await element.inspect();
     * console.log(result.nodes);   // InspectNodeInfo 树
     * console.log(result.totalChildren); // 子元素总数
     *
     * // 使用罗盘路径导航到 inspect 发现的节点
     * const result = await element.inspect();
     * const target = result.flatNodes.find(n => n.name === '确定');
     * if (target) await element.compass(target.compass);
     *
     * // 仅保留可见元素
     * const result = await element.inspect({ visibleOnly: true });
     *
     * // 文本格式
     * const result = await element.inspect({ format: 'txt' });
     * console.log(result.text);   // 缩进展示的元素树
     *
     * // 区域过滤：仅显示上半部分的可见元素
     * const result = await element.inspect({ regionFilter: { region: 'top' } });
     * // 仅显示上 30% 区域的可见元素
     * const result = await element.inspect({ regionFilter: { region: 'top', ratio: 0.3 } });
     */
    async inspect(options?: InspectOptions, ...propNames: string[]): Promise<InspectResponse> {
        const useXpath = this.resolveXpath(options?.propNames ?? propNames);
        const result = await this.client.inspectElement(this.windowSelector, useXpath, options?.format, this.runtimeId || undefined);

        // 为所有节点计算罗盘路径
        assignCompassPaths(result);

        if (result.flatNodes) {
            // 1. 过滤 offscreen 元素（visibleOnly 或 regionFilter 启用时生效）
            if (options?.visibleOnly || options?.regionFilter) {
                result.flatNodes = result.flatNodes.filter(node => !node.isOffscreen);
            }

            // 2. 区域过滤（基于 isOffscreen === false 的结果）
            if (options?.regionFilter) {
                const parentRect = this.info.rect;
                if (parentRect) {
                    const regionRect = this.computeRegionRect(parentRect, options.regionFilter);
                    if (regionRect) {
                        result.flatNodes = result.flatNodes.filter(node => {
                            if (!node.rect) return false;
                            return this.rectsIntersect(regionRect, node.rect);
                        });
                    }
                }
            }
        }

        return result;
    }

    /**
     * 根据区域过滤配置计算目标区域 Rect
     */
    private computeRegionRect(parentRect: Rect, filter: InspectRegionFilter): Rect | null {
        const ratio = filter.ratio ?? 0.5;
        const { x, y, width, height } = parentRect;

        switch (filter.region) {
            case 'top':
                return { x, y, width, height: height * ratio };
            case 'bottom':
                return { x, y: y + height * (1 - ratio), width, height: height * ratio };
            case 'left':
                return { x, y, width: width * ratio, height };
            case 'right':
                return { x: x + width * (1 - ratio), y, width: width * ratio, height };
            case 'center':
                return {
                    x: x + width * 0.25,
                    y: y + height * 0.25,
                    width: width * 0.5,
                    height: height * 0.5,
                };
            default:
                return null;
        }
    }

    /**
     * 判断两个 Rect 是否有非零交集
     */
    private rectsIntersect(a: Rect, b: Rect): boolean {
        const ax2 = a.x + a.width;
        const ay2 = a.y + a.height;
        const bx2 = b.x + b.width;
        const by2 = b.y + b.height;
        const intersectX = Math.max(a.x, b.x);
        const intersectY = Math.max(a.y, b.y);
        const intersectX2 = Math.min(ax2, bx2);
        const intersectY2 = Math.min(ay2, by2);
        return intersectX2 > intersectX && intersectY2 > intersectY;
    }

    /**
     * 获取元素属性
     */
    async attr(name: string): Promise<string> {
        switch (name.toLowerCase()) {
            case 'name':
                return this.info.name || '';
            case 'controltype':
            case 'type':
                return this.info.controlType || '';
            case 'automationid':
            case 'id':
                return this.info.automationId || '';
            case 'classname':
            case 'class':
                return this.info.className || '';
            case 'frameworkid':
                return this.info.frameworkId || '';
            case 'helptext':
            case 'desc':
                return this.info.helpText || '';
            case 'enabled':
            case 'isenabled':
                return String(this.info.isEnabled);
            case 'offscreen':
            case 'isoffscreen':
                return String(this.info.isOffscreen);
            case 'password':
            case 'ispassword':
                return String(this.info.isPassword);
            case 'acceleratorkey':
                return this.info.acceleratorKey || '';
            case 'accesskey':
                return this.info.accessKey || '';
            case 'itemtype':
                return this.info.itemType || '';
            case 'itemstatus':
                return this.info.itemStatus || '';
            case 'processid':
            case 'pid':
                return String(this.info.processId);
            default:
                return '';
        }
    }

    /**
     * 获取元素位置和尺寸（使用本地缓存属性，如需最新状态请先 refresh）
     */
    async bounds(): Promise<Rect> {
        if (!this.info.rect) {
            throw new ElementNotFoundError(this.findSelector, this.windowSelector);
        }

        return this.info.rect;
    }

    /**
     * 获取元素位置和尺寸（bounds 的别名，与 Playwright/CDP 一致）
     */
    async boundingBox(): Promise<Rect> {
        return this.bounds();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 操作方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 点击元素
     */
    async click(options?: ClickOptions, ...propNames: string[]): Promise<void> {
        this.logger.logOperation('点击元素', this.info);
        
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.click.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }

        // 点击前闪烁高亮元素框（可选，与 showDot 独立/可同时启用）
        if (options?.flash) {
            const flashOpts = typeof options.flash === 'object' ? options.flash : {};
            await this.flash(flashOpts, ...propNames);
        }

        // 使用 resolveXpath：foundElementCount > 1 时自动构造唯一 XPath
        const useXpath = this.resolveXpath(propNames);
        
        const result = await this.client.clickMouse({
            window: this.windowSelector,
            element: useXpath,
            runtimeId: this.runtimeId || undefined,
            useCache: options?.useCache,
            options: {
                humanize: options?.humanize ?? DEFAULTS.click.humanize,
                randomRange: options?.randomRange ?? DEFAULTS.click.randomRange,
                button: options?.button ?? 'left',
                clickArea: options?.clickArea,
                offset: options?.offset,
                showDot: options?.showDot ?? false,
                dotDuration: options?.dotDuration ?? 3000,
                clickMode: options?.clickMode ?? 'mouse',
                checkBlocked: options?.checkBlocked,
            },
        });
        
        if (!result.success) {
            const errMsg = result.error || 'Click failed';
            this.logger.logError('点击元素', new ActionFailedError('click', errMsg, undefined));
            throw new ActionFailedError('click', errMsg, undefined);
        }
        
        // 记录点击成功，包含坐标信息
        this.logger.logSuccess('点击元素', { clickPoint: result.clickPoint, elementInfo: this.info });
        
        // 操作后等待（优先级：options > DEFAULTS > autoWait）
        const waitAfter = options?.waitAfter ?? DEFAULTS.click.waitAfter;
        if (waitAfter && waitAfter > 0) {
            await delay(waitAfter);
        } else if (this.autoWaitConfig.enable) {
            // 仅在没有配置 waitAfter 且 autoWait 启用时才使用
            await this.maybeAutoWait('afterClick');
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 周边点击便捷函数
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 解析距离值为像素
     * @param distance 数字(当像素) | "10px" | "20%"
     * @param dimension 元素对应轴的尺寸（width 或 height），用于百分比换算
     */
    private resolveDistance(distance: number | string, dimension: number): number {
        if (typeof distance === 'number') {
            return distance;
        }
        const str = String(distance).trim();
        if (str.endsWith('px')) {
            return parseFloat(str.slice(0, -2)) || 0;
        }
        if (str.endsWith('%')) {
            return dimension * (parseFloat(str.slice(0, -1)) || 0) / 100;
        }
        // 纯数字字符串兜底
        return parseFloat(str) || 0;
    }

    /**
     * 点击元素上方指定距离处
     *
     * 在元素顶部边缘上方 distance 像素处点击，水平居中。
     * 点击区域为 10×10 像素，每次实际点击位置在区域内随机（拟人化）。
     *
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**高度**
     * @param options 透传 ClickOptions
     *
     * @example
     * await el.clickAbove();          // 上方 5px（默认）
     * await el.clickAbove(20);        // 上方 20px
     * await el.clickAbove("30px");    // 上方 30px
     * await el.clickAbove("20%");     // 上方 = 元素高度的 20%
     */
    async clickAbove(distance: number | string = 5, options?: ClickOptions): Promise<void> {
        const b = this.info.rect!;
        const dist = this.resolveDistance(distance, b.height);
        const halfBand = 5;
        await this.click({
            ...options,
            clickArea: {
                left:   `${b.width / 2 - halfBand}px`,
                right:  `${b.width / 2 - halfBand}px`,
                top:    `${-(dist + halfBand)}px`,
                bottom: `${b.height + dist - halfBand}px`,
            },
        });
    }

    /**
     * 点击元素下方指定距离处
     *
     * 在元素底部边缘下方 distance 像素处点击，水平居中。
     *
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**高度**
     * @param options 透传 ClickOptions
     *
     * @example
     * await el.clickBelow(10);        // 下方 10px
     * await el.clickBelow("50%");     // 下方 = 元素高度的 50%
     */
    async clickBelow(distance: number | string = 5, options?: ClickOptions): Promise<void> {
        const b = this.info.rect!;
        const dist = this.resolveDistance(distance, b.height);
        const halfBand = 5;
        await this.click({
            ...options,
            clickArea: {
                left:   `${b.width / 2 - halfBand}px`,
                right:  `${b.width / 2 - halfBand}px`,
                top:    `${b.height + dist - halfBand}px`,
                bottom: `${-(dist + halfBand)}px`,
            },
        });
    }

    /**
     * 点击元素左侧指定距离处
     *
     * 在元素左边边缘左侧 distance 像素处点击，垂直居中。
     *
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**宽度**
     * @param options 透传 ClickOptions
     *
     * @example
     * await el.clickLeft(15);         // 左侧 15px
     * await el.clickLeft("10%");      // 左侧 = 元素宽度的 10%
     */
    async clickLeft(distance: number | string = 5, options?: ClickOptions): Promise<void> {
        const b = this.info.rect!;
        const dist = this.resolveDistance(distance, b.width);
        const halfBand = 5;
        await this.click({
            ...options,
            clickArea: {
                left:   `${-(dist + halfBand)}px`,
                right:  `${b.width + dist - halfBand}px`,
                top:    `${b.height / 2 - halfBand}px`,
                bottom: `${b.height / 2 - halfBand}px`,
            },
        });
    }

    /**
     * 点击元素右侧指定距离处
     *
     * 在元素右边边缘右侧 distance 像素处点击，垂直居中。
     *
     * @param distance 距离（默认 5px）。支持：数字(像素)、"10px"、"20%"
     *   - 百分比基准为元素**宽度**
     * @param options 透传 ClickOptions
     *
     * @example
     * await el.clickRight(10);        // 右侧 10px
     * await el.clickRight("15%");     // 右侧 = 元素宽度的 15%
     */
    async clickRight(distance: number | string = 5, options?: ClickOptions): Promise<void> {
        const b = this.info.rect!;
        const dist = this.resolveDistance(distance, b.width);
        const halfBand = 5;
        await this.click({
            ...options,
            clickArea: {
                left:   `${b.width + dist - halfBand}px`,
                right:  `${-(dist + halfBand)}px`,
                top:    `${b.height / 2 - halfBand}px`,
                bottom: `${b.height / 2 - halfBand}px`,
            },
        });
    }

    /**
     * 双击元素
     */
    async dblclick(): Promise<void> {
        // 目前后端没有单独的双击 API，通过两次点击模拟
        await this.click();
        await delay(100);
        await this.click();
    }

    /**
     * 右键点击元素
     */
    async rightClick(...propNames: string[]): Promise<void> {
        this.logger.logOperation('右键点击元素', this.info);

        const useXpath = this.resolveXpath(propNames);

        const result = await this.client.clickMouse({
            window: this.windowSelector,
            element: useXpath,
            runtimeId: this.runtimeId || undefined,
            options: {
                button: 'right',
                humanize: true,
                randomRange: 0.55,
                offset: 'center',  // 默认使用 center
            },
        });

        if (!result.success) {
            const errMsg = result.error || 'Click failed';
            this.logger.logError('右键点击元素', new ActionFailedError('rightClick', errMsg, undefined));
            throw new ActionFailedError('rightClick', errMsg, undefined);
        }

        this.logger.logSuccess('右键点击元素', { clickPoint: result.clickPoint, elementInfo: this.info });
        await this.maybeAutoWait('afterClick');
    }

    /**
     * 在元素中输入文本
     * 
     * 支持普通字符和虚拟键混合输入。
     * 
     * **支持的虚拟键格式：**
     * - `{Enter}` - 回车键
     * - `{Tab}` - Tab 键
     * - `{Escape}` / `{Esc}` - ESC 键
     * - `{Backspace}` / `{Back}` - 退格键
     * - `{Delete}` / `{Del}` - 删除键
     * - `{Home}` - Home 键
     * - `{End}` - End 键
     * - `{PageUp}` / `{PgUp}` - Page Up 键
     * - `{PageDown}` / `{PgDn}` - Page Down 键
     * - `{Left}` / `{Right}` / `{Up}` / `{Down}` - 方向键
     * - `{F1}` - `{F12}` - 功能键
     * 
     * **转义字符：**
     * - 要输入字面意义的 `{`，使用 `{{`
     * - 要输入字面意义的 `}`，使用 `}}`
     * 
     * @example
     * ```typescript
     * // 输入普通文本
     * await inputArea.type('Hello World');
     * 
     * // 输入文本后按回车
     * await inputArea.type('测试内容{Enter}');
     * 
     * // 输入多行文本
     * await inputArea.type('第一行{Enter}第二行{Enter}第三行');
     * 
     * // 输入包含花括号的文本
     * await inputArea.type('配置项: {{key}} = value');
     * 
     * // 使用 Tab 切换字段
     * await field1.type('用户名{Tab}');
     * await field2.type('密码{Enter}');
     * ```
     */
    async type(text: string, options?: TypeOptions): Promise<void> {
        this.logger.logOperation('输入文本到元素', this.info, { text, mode: options?.typeMode ?? 'key' });
        
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.type.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }
        
        const typeMode = options?.typeMode ?? 'key';

        if (typeMode === 'set') {
            // Value 模式：直接通过 UIA ValuePattern.SetValue，不需要点击聚焦
            const result = await this.client.typeText(
                text,
                options,
                this.windowSelector,
                this.toXpath(),
                this.runtimeId || undefined,
            );
            if (!result.success) {
                this.logger.logError('输入文本', new Error(result.error || '输入失败'));
                throw new Error('Type text failed: ' + (result.error || 'unknown'));
            }
        } else {
            // Key/Paste 模式：先点击元素获得焦点，再输入
            await this.click({ waitAfter: 100 });
            // paste 模式不需要额外传递 window/element（后端自己处理剪贴板）
            const result = await this.client.typeText(
                text,
                { charDelay: options?.charDelay },
                typeMode === 'paste' ? this.windowSelector : undefined,
                typeMode === 'paste' ? this.toXpath() : undefined,
                typeMode === 'paste' ? (this.runtimeId || undefined) : undefined,
            );
            if (!result.success) {
                this.logger.logError('输入文本', new Error('输入失败'));
                throw new Error('Type text failed');
            }
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
    
    /**
     * 清空元素内容
     */
    async clear(): Promise<void> {
        // 先全选，然后删除
        await this.click({ waitAfter: 100 });
        await this.client.shortcut('Ctrl+A');
        await this.client.executeKey('Delete');
    }

    /**
     * 填充元素内容（自动清空后输入，类似 Playwright 的 fill）。
     * 与 type() 的区别：fill 先清空内容再输入，适合替换已有文本。
     */
    async fill(text: string, options?: TypeOptions): Promise<void> {
        await this.clear();
        await this.type(text, options);
    }

    /**
     * 聚焦元素
     */
    async focus(): Promise<void> {
        await this.click({ waitAfter: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 断言方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 断言元素存在
     */
    async assertExists(...propNames: string[]): Promise<void> {
        // 有 runtimeId 时直接验证缓存是否有效
        if (this.runtimeId) {
            const response = await this.client.refreshByRuntimeId(
                this.windowSelector, this.runtimeId
            );
            if (response.found) return;
            throw new ElementNotFoundError(
                `runtimeId=${this.runtimeId}`,
                this.windowSelector,
                '元素已不存在'
            );
        }
        // 无 runtimeId 走 XPath
        const useXpath = this.resolveXpath(propNames);
        const response = await this.client.find({
            window: this.windowSelector,
            element: useXpath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(useXpath, this.windowSelector);
        }
    }

    /**
     * 断言元素可用
     */
    async assertEnabled(): Promise<void> {
        const enabled = await this.isEnabled();
        if (!enabled) {
            throw new ActionFailedError('assertEnabled', 'Element is not enabled', undefined);
        }
    }

    /**
     * 断言元素可见
     */
    async assertVisible(): Promise<void> {
        const visible = await this.isVisible();
        if (!visible) {
            throw new ActionFailedError('assertVisible', 'Element is not visible', undefined);
        }
    }

    /**
     * 断言元素文本
     */
    async assertText(expected: string): Promise<void> {
        const actual = await this.name();
        if (actual !== expected) {
            throw new ActionFailedError(
                'assertText', 
                `Text mismatch: expected "${expected}", got "${actual}"`,
                undefined
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 子元素查找
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 在当前元素下查找唯一匹配的子元素（匹配多个时报错）
     */
    /**
     * 在当前元素下查找唯一匹配的子元素（匹配多个时报错）
     */
    async findOne(xpath: string, options?: FindOptions, ...propNames: string[]): Promise<Element> {
        const element = await this.findElement(xpath, options?.propNames ?? propNames, true, options);
        return element;
    }

    /**
     * 在当前元素下查找第一个匹配的子元素（多个匹配也不报错）
     */
    async findFirst(xpath: string, options?: FindOptions, ...propNames: string[]): Promise<Element> {
        const element = await this.findElement(xpath, options?.propNames ?? propNames, false, options);
        return element;
    }

    /**
     * 在当前元素下查找第一个匹配的子元素（findFirst 的别名）
     */
    async find(xpath: string, options?: FindOptions, ...propNames: string[]): Promise<Element> {
        return this.findFirst(xpath, options, ...propNames);
    }

    /**
     * 在当前元素下查找所有匹配的子元素
     *
     * @returns 返回 ElementList，支持 .position(n) 方法按位置获取
     */
    async findAll(xpath: string, options?: FindOptions, ...propNames: string[]): Promise<ElementList> {
        const effectivePropNames = options?.propNames ?? propNames;

        if (!this.runtimeId) {
            return this.findAllByXPath(xpath, effectivePropNames, options);
        }

        // 有 runtimeId：使用 findFromElement API
        const relativeXpath = this.buildRelativeXpath(xpath, effectivePropNames);
        const response = await this.client.findFromElement({
            runtimeId: this.runtimeId,
            xpath: relativeXpath,
            searchStrategy: 'Fast',
        });

        if (!response.found || response.elements.length === 0) {
            return this.emptyElementList(relativeXpath);
        }

        const fullXPath = this.resolveRelativeXpath(xpath, effectivePropNames);
        const totalCount = response.total;

        const elements: Element[] = response.elements.map((item) => {
            return new Element(
                this.client,
                fullXPath,
                this.windowSelector,
                item.findSelector || fullXPath,
                item,
                this.autoWaitConfig,
                this.logger,
                totalCount,
                options?.cacheTime ?? this.cacheTime,
            );
        });

        const positionFn = async (n: number): Promise<Element> => {
            const nthXpath = `(${fullXPath})[position()=${n}]`;
            const resp = await this.client.findFromElement({
                runtimeId: this.runtimeId!,
                xpath: `(${this.buildRelativeXpath(xpath, [])})[position()=${n}]`,
                searchStrategy: 'Fast',
            });
            if (!resp.found || resp.elements.length === 0) {
                throw new ElementNotFoundError(nthXpath, this.windowSelector, undefined, resp.notFoundReason);
            }
            return new Element(
                this.client,
                nthXpath,
                this.windowSelector,
                nthXpath,
                resp.elements[0],
                this.autoWaitConfig,
                this.logger,
                1,
                options?.cacheTime ?? this.cacheTime,
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /** findAll XPath 回退（无 runtimeId 时使用） */
    private async findAllByXPath(xpath: string, propNames: string[], options?: FindOptions): Promise<ElementList> {
        const fullXPath = this.resolveRelativeXpath(xpath, propNames);

        const response = await this.client.findAll({
            window: this.windowSelector,
            element: fullXPath,
            chromeTreewalkerFallback: options?.chromeTreewalkerFallback,
        });

        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(fullXPath);
        }

        const totalCount = response.total ?? response.elements.length;

        const elements: Element[] = response.elements.map((item) => {
            return new Element(
                this.client,
                fullXPath,
                this.windowSelector,
                item.findSelector || fullXPath,
                item.info,
                this.autoWaitConfig,
                this.logger,
                totalCount,
            );
        });

        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${fullXPath}[position()=${n}]`;
            const resp = await this.client.find({
                window: this.windowSelector,
                element: pXpath,
            });
            if (!resp.found || !resp.element) {
                throw new ElementNotFoundError(pXpath, this.windowSelector);
            }
            return new Element(
                this.client,
                pXpath,
                this.windowSelector,
                resp.findSelector || pXpath,
                resp.element!,
                this.autoWaitConfig,
                this.logger,
                resp.total ?? 1,
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /**
     * 在当前元素下查找第 N 个匹配的子元素（1-based，与 XPath position() 一致）。
     *
     * 等价于 XPath 的 `(//Text)[2]`，但由 SDK 正确处理括号拼接，
     * 避免手写 `(//Text)[2]` 被 resolveRelativeXpath 破坏括号的问题。
     *
     * @param xpath - 相对 XPath 表达式（如 'Text'、'//Button'、'/List[@Name="x"]'）
     * @param n - 位置索引（1-based，1=第 1 个，2=第 2 个）
     * @returns 第 N 个匹配的元素
     *
     * @example
     * await el.nth('Text', 1);      // 第 1 个 Text 子孙
     * await el.nth('//Button', 3);  // 第 3 个 Button 子孙
     * await el.nth('/List', 2);     // 第 2 个 List 直接子元素
     */
    async nth(xpath: string, n: number, ...propNames: string[]): Promise<Element> {
        const fullXPath = this.resolveRelativeXpath(xpath, propNames);
        // 用括号包裹后再加 position 谓词，确保 position() 作用于全局结果集
        const nthXpath = `(${fullXPath})[position()=${n}]`;

        if (this.runtimeId) {
            const relativeXpath = this.buildRelativeXpath(xpath, propNames);
            const nthRelativeXpath = `(${relativeXpath})[position()=${n}]`;
            const response = await this.client.findFromElement({
                runtimeId: this.runtimeId,
                xpath: nthRelativeXpath,
                searchStrategy: 'Fast',
            });

            if (!response.found || response.elements.length === 0) {
                throw new ElementNotFoundError(nthXpath, this.windowSelector, undefined, response.notFoundReason);
            }

            return new Element(
                this.client,
                nthXpath,
                this.windowSelector,
                nthXpath,
                response.elements[0],
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        }

        const response = await this.client.find({
            window: this.windowSelector,
            element: nthXpath,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(nthXpath, this.windowSelector);
        }

        return new Element(
            this.client,
            nthXpath,
            this.windowSelector,
            response.findSelector || nthXpath,
            response.element!,
            this.autoWaitConfig,
            this.logger,
            response.total ?? 1,
        );
    }

    /**
     * 在当前元素下查找子元素（findOne 的别名，与 Playwright 命名一致）
     *
     * Web CDP: element.querySelector(xpath)
     * Windows: 拼接相对 XPath
     */
    async locator(xpath: string, ...propNames: string[]): Promise<Element> {
        return this.findOne(xpath, undefined, ...propNames);
    }

    /**
     * 获取当前元素的直接子元素列表。
     *
     * @param xpath - 可选的 XPath 过滤器，用于在子元素中进一步筛选
     * @returns 返回 ElementList，支持 .position(n) 方法按位置获取
     *
     * @example
     * const children = await el.children();
     * const buttons = await el.children('Button');
     */
    async children(xpath?: string, ...propNames: string[]): Promise<ElementList> {
        const baseXpath = this.resolveXpath(propNames);
        const directChildrenXpath = `${baseXpath}/*`;
        const fullXpath = xpath
            ? `${baseXpath}/${xpath}`
            : directChildrenXpath;

        // 有 runtimeId 时使用 findFromElement
        if (this.runtimeId) {
            const relativeXpath = xpath
                ? `/${xpath}`
                : '/*';
            const response = await this.client.findFromElement({
                runtimeId: this.runtimeId,
                xpath: relativeXpath,
                searchStrategy: 'Fast',
            });

            if (!response.found || response.elements.length === 0) {
                return this.emptyElementList(fullXpath);
            }

            const totalCount = response.total ?? response.elements.length;
            const elements: Element[] = response.elements.map((item) => {
                return new Element(
                    this.client,
                    fullXpath,
                    this.windowSelector,
                    item.findSelector || fullXpath,
                    item,
                    this.autoWaitConfig,
                    this.logger,
                    totalCount,
                );
            });

            const positionFn = async (n: number): Promise<Element> => {
                const pXpath = `${fullXpath}[position()=${n}]`;
                const resp = await this.client.findFromElement({
                    runtimeId: this.runtimeId!,
                    xpath: `/*[position()=${n}]`,
                    searchStrategy: 'Fast',
                });
                if (!resp.found || resp.elements.length === 0) {
                    throw new ElementNotFoundError(pXpath, this.windowSelector, undefined, resp.notFoundReason);
                }
                return new Element(
                    this.client,
                    pXpath,
                    this.windowSelector,
                    pXpath,
                    resp.elements[0],
                    this.autoWaitConfig,
                    this.logger,
                    1,
                );
            };

            return Object.assign(elements, { position: positionFn }) as ElementList;
        }

        const response = await this.client.findAll({
            window: this.windowSelector,
            element: fullXpath,
        });

        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(fullXpath);
        }

        const totalCount = response.total ?? response.elements.length;

        const elements: Element[] = response.elements.map((item) => {
            return new Element(
                this.client,
                fullXpath,
                this.windowSelector,
                item.findSelector || fullXpath,
                item.info,
                this.autoWaitConfig,
                this.logger,
                totalCount,
            );
        });

        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${fullXpath}[position()=${n}]`;
            const resp = await this.client.find({
                window: this.windowSelector,
                element: pXpath,
            });
            if (!resp.found || !resp.element) {
                throw new ElementNotFoundError(pXpath, this.windowSelector);
            }
            return new Element(
                this.client,
                pXpath,
                this.windowSelector,
                resp.findSelector || pXpath,
                resp.element!,
                this.autoWaitConfig,
                this.logger,
                resp.total ?? 1,
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /**
     * 获取当前元素的直接子元素数量
     */
    async childCount(...propNames: string[]): Promise<number> {
        const baseXpath = this.resolveXpath(propNames);
        const response = await this.client.findAll({
            window: this.windowSelector,
            element: `${baseXpath}/*`,
        });
        return response.total ?? 0;
    }

    /**
     * 获取当前元素的指定索引子控件。
     *
     * 索引为 0-based：`child(0)` 返回首个子控件，`child(-1)` 返回末尾子控件。
     *
     * @param index - 子控件索引（0-based，负数表示倒数，如 -1=末尾）
     * @returns 子控件 Element
     *
     * @example
     * await el.child(0);   // 首个子控件
     * await el.child(2);   // 第 3 个子控件
     * await el.child(-1);  // 末尾子控件
     * await el.child(-2);  // 倒数第 2 个子控件
     */
    async child(index: number, ...propNames: string[]): Promise<Element> {
        const baseXpath = this.resolveXpath(propNames);
        const childXpath = `${baseXpath}${this.buildChildIndexPredicate(index)}`;

        const response = await this.client.find({
            window: this.windowSelector,
            element: childXpath,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(childXpath, this.windowSelector);
        }

        return new Element(
            this.client,
            childXpath,
            this.windowSelector,
            response.findSelector || childXpath,
            response.element!,
            this.autoWaitConfig,
            this.logger,
            response.total ?? 1,
        );
    }

    /**
     * 获取当前元素在父控件中的 0-based 索引位置。
     *
     * 即当前元素前面有多少个兄弟节点。
     *
     * @returns 0-based 索引（首个子元素返回 0）
     *
     * @example
     * const idx = await el.indexInParent();  // 例如返回 2，表示是第 3 个子元素
     */
    async indexInParent(...propNames: string[]): Promise<number> {
        const baseXpath = this.resolveXpath(propNames);
        const precedingXpath = `${baseXpath}/preceding-sibling::*`;

        const response = await this.client.findAll({
            window: this.windowSelector,
            element: precedingXpath,
        });

        return response.total ?? 0;
    }

    /**
     * 获取当前元素的祖先元素（向上 N 层）。
     *
     * Web: element.parentElement (反复调用)
     * Windows: XPath `/..` (拼接 N 次)
     *
     * @param levelOrPropNames - 向上层数（默认 1），或属性名（向后兼容）
     *   - `parent()` / `parent(1)` → 直接父元素
     *   - `parent(2)` → 爷爷元素（等价于 `/../..`）
     *   - `parent('name', 'automationId')` → 带属性定位的父元素
     * @returns 祖先元素，如果不存在返回 null
     */
    async parent(levelOrPropNames?: number | string, ...restPropNames: string[]): Promise<Element | null> {
        let levels = 1;
        let propNames: string[] = [];

        if (typeof levelOrPropNames === 'number') {
            levels = Math.max(1, levelOrPropNames);
            propNames = restPropNames;
        } else if (typeof levelOrPropNames === 'string') {
            propNames = [levelOrPropNames, ...restPropNames];
        }

        // 优先通过 runtimeId + navigateElement（TreeWalker）获取父元素，
        // 避免 XPath `//descendant/..` 的语义歧义导致返回 null。
        if (this.runtimeId) {
            try {
                const steps = [{ type: 'parent' as const, levels }];
                const response = await this.client.navigateElement(
                    this.windowSelector,
                    this.resolveXpath(propNames),
                    steps,
                    this.runtimeId,
                );
                if (response.found && response.element) {
                    const parentXpath = this.resolveXpath(propNames) + '/..'.repeat(levels);
                    return new Element(
                        this.client,
                        parentXpath,
                        this.windowSelector,
                        response.findSelector || parentXpath,
                        response.element,
                        this.autoWaitConfig,
                        this.logger,
                        1,
                    );
                }
                return null;
            } catch {
                return null;
            }
        }

        // 无 runtimeId 时回退到 XPath 拼接（仅适用于简单场景）
        const baseXpath = this.resolveXpath(propNames);
        const suffix = '/..'.repeat(levels);
        const parentXpath = `${baseXpath}${suffix}`;
        try {
            const response = await this.client.find({
                window: this.windowSelector,
                element: parentXpath,
            });
            if (!response.found || !response.element) {
                return null;
            }
            return new Element(
                this.client,
                parentXpath,
                this.windowSelector,
                response.findSelector || parentXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        } catch {
            return null;
        }
    }

    /**
     * 获取下一个兄弟元素。
     *
     * Web: element.nextElementSibling
     * Windows: XPath `following-sibling::*[1]`
     *
     * @returns 下一个兄弟元素，如果不存在返回 null
     */
    async next(...propNames: string[]): Promise<Element | null> {
        const useXpath = this.resolveXpath(propNames);
        const siblingXpath = `${useXpath}/following-sibling::*[1]`;
        try {
            const response = await this.client.find({
                window: this.windowSelector,
                element: siblingXpath,
            });
            if (!response.found || !response.element) {
                return null;
            }
            return new Element(
                this.client,
                siblingXpath,
                this.windowSelector,
                response.findSelector || siblingXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        } catch {
            return null;
        }
    }

    /**
     * 获取上一个兄弟元素。
     *
     * Web: element.previousElementSibling
     * Windows: XPath `preceding-sibling::*[1]`
     *
     * @returns 上一个兄弟元素，如果不存在返回 null
     */
    async prev(...propNames: string[]): Promise<Element | null> {
        const useXpath = this.resolveXpath(propNames);
        const siblingXpath = `${useXpath}/preceding-sibling::*[1]`;
        try {
            const response = await this.client.find({
                window: this.windowSelector,
                element: siblingXpath,
            });
            if (!response.found || !response.element) {
                return null;
            }
            return new Element(
                this.client,
                siblingXpath,
                this.windowSelector,
                response.findSelector || siblingXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger,
                response.total ?? 1,
            );
        } catch {
            return null;
        }
    }

    /**
     * 控件罗盘 —— 通过简洁的路径表达式导航 UI 元素树。
     *
     * 路径由多个 token 拼接而成，从左到右依次导航：
     *
     * | 语法   | 含义                        | 等价表达式                                  |
     * |--------|-----------------------------|---------------------------------------------|
     * | `p`    | 父控件                      | `parent()`                                  |
     * | `pN`   | 向上 N 层父控件              | `parent(N)` / `/..` × N                     |
     * | `cN`   | 索引 N 子控件 (0-based)      | `child(N)`                                  |
     * | `c-N`  | 倒数第 \|N\| 子控件          | `child(-N)`，如 `c-1` = 末尾子控件          |
     * | `sN`   | 索引 N 兄弟控件 (0-based)    | `parent().child(N)`                         |
     * | `s-N`  | 倒数兄弟控件                 | `parent().child(-N)`                        |
     * | `s<N`  | 左侧第 N 个兄弟（相对偏移）  | `parent().child(indexInParent()-N)`         |
     * | `s>N`  | 右侧第 N 个兄弟（相对偏移）  | `parent().child(indexInParent()+N)`         |
     * | `>N`   | cN 的简写（路径续接时使用）   | 同 `cN`                                     |
     *
     * @param path - 罗盘路径字符串
     * @returns 目标元素
     *
     * @example
     * await el.compass('p');                // 父控件
     * await el.compass('p2');               // 二级父控件
     * await el.compass('c0');               // 首个子控件
     * await el.compass('c-1');              // 末尾子控件
     * await el.compass('s5');               // 索引 5 兄弟控件
     * await el.compass('s-2');              // 倒数第 2 兄弟控件
     * await el.compass('s<1');              // 相邻左侧兄弟
     * await el.compass('s>1');              // 相邻右侧兄弟
     * await el.compass('p4c0>1>1>0');       // 多级访问
     */
    async compass(path: string, ...propNames: string[]): Promise<Element> {
        const tokens = this.parseCompassPath(path);
        const baseXpath = this.resolveXpath(propNames);

        // 将 CompassToken[] 转换为 NavigateStep[] 发送给后端
        const steps = tokens.map(token => {
            switch (token.type) {
                case 'parent':
                    return { type: 'parent' as const, levels: token.levels };
                case 'child':
                    return { type: 'child' as const, index: token.index };
                case 'sibling_abs':
                    return { type: 'sibling_abs' as const, index: token.index };
                case 'sibling_left':
                    return { type: 'sibling_left' as const, offset: token.offset };
                case 'sibling_right':
                    return { type: 'sibling_right' as const, offset: token.offset };
            }
        });

        const response = await this.client.navigateElement(this.windowSelector, baseXpath, steps, this.runtimeId || undefined);

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(path, this.windowSelector);
        }

        // findSelector: 基于 baseXpath 构造等价 XPath（和 parent() 等方法一致，
        // 后端 find API 带 fallback 机制能正确处理）
        const findSelector = this.buildCompassXpath(baseXpath, tokens);

        return new Element(
            this.client,
            findSelector,
            this.windowSelector,
            findSelector,
            response.element,
            this.autoWaitConfig,
            this.logger,
            1,
            this.cacheTime,
        );
    }

    /** 返回空的 ElementList（带 position 方法） */
    private emptyElementList(queryXpath: string): ElementList {
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${queryXpath}[position()=${n}]`;
            throw new ElementNotFoundError(pXpath, this.windowSelector);
        };
        return Object.assign([], { position: positionFn }) as ElementList;
    }

    /**
     * findOne/findFirst 的公共实现（P2 优化版）
     *
     * 有 runtimeId 时通过 findFromElement API 定位子元素（~5-15ms），
     * 无 runtimeId 时回退到 XPath 拼接全窗口搜索。
     *
     * @param xpath - 相对 XPath 表达式
     * @param propNames - 用于定位当前元素的属性名列表
     * @param expectSingle - true 时匹配多个元素会报错（findOne），false 时不报错（findFirst）
     * @param options - 查找选项（cacheTime 覆盖）
     */
    private async findElement(xpath: string, propNames: string[], expectSingle: boolean, options?: FindOptions): Promise<Element> {
        if (!this.runtimeId) {
            // 无 runtimeId：回退到 XPath 拼接（初始场景）
            return this.findElementByXPath(xpath, propNames, expectSingle, options);
        }

        // 有 runtimeId：使用 findFromElement API
        const relativeXpath = this.buildRelativeXpath(xpath, propNames);
        const response = await this.client.findFromElement({
            runtimeId: this.runtimeId,
            xpath: relativeXpath,
            searchStrategy: 'Fast',
        });

        if (!response.found || response.elements.length === 0) {
            throw new ElementNotFoundError(relativeXpath, this.windowSelector, undefined, response.notFoundReason);
        }

        if (expectSingle && response.total > 1) {
            throw new Error(`findOne 匹配到 ${response.total} 个元素，期望恰好 1 个: ${relativeXpath}`);
        }

        const el = response.elements[0];
        const findSelector = this.buildChildXpath(xpath);
        return new Element(
            this.client,
            findSelector,
            this.windowSelector,
            findSelector,
            el,
            this.autoWaitConfig,
            this.logger,
            response.total,
            options?.cacheTime ?? this.cacheTime,
        );
    }

    /** XPath 拼接回退（无 runtimeId 时使用） */
    private async findElementByXPath(xpath: string, propNames: string[], expectSingle: boolean, options?: FindOptions): Promise<Element> {
        const fullXPath = this.resolveRelativeXpath(xpath, propNames);

        const response = await this.client.find({
            window: this.windowSelector,
            element: fullXPath,
            chromeTreewalkerFallback: options?.chromeTreewalkerFallback,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(fullXPath, this.windowSelector);
        }

        if (expectSingle && response.total > 1) {
            throw new Error(`findOne 匹配到 ${response.total} 个元素，期望恰好 1 个: ${fullXPath}`);
        }

        return new Element(
            this.client,
            fullXPath,
            this.windowSelector,
            response.findSelector || fullXPath,
            response.element,
            this.autoWaitConfig,
            this.logger,
            response.total ?? 1,
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // XPath 辅助方法
    // ═══════════════════════════════════════════════════════════════════════════

    /** 获取父元素的 XPath（去掉最后一个路径步骤）。
     *  例如 `/Window/Pane[@Name="list"]/Button` → `/Window/Pane[@Name="list"]`
     *  无法再往上时返回 null。 */
    private getParentXpath(): string | null {
        const xpath = this.findSelector;
        // 找到最后一个 '/'，但跳过谓词内的 '/'
        let lastSlash = -1;
        let depth = 0;
        for (let i = xpath.length - 1; i >= 0; i--) {
            if (xpath[i] === ']') depth++;
            else if (xpath[i] === '[') depth--;
            else if (xpath[i] === '/' && depth === 0) {
                lastSlash = i;
                break;
            }
        }
        if (lastSlash <= 0) return null; // 已经是根节点
        return xpath.substring(0, lastSlash);
    }

    /** 在 findSelector 的最后一个节点上追加谓词。
     *  正确处理已存在谓词的情况：
     *  - `/A/B[@className="a"]` → `/A/B[@className="a" and @Name="xxx"]`（在 `]` 内插入）
     *  - `/A/B` → `/A/B[@Name="xxx"]`（追加 `[]`） */
    private appendPredicates(baseXpath: string, preds: string[]): string {
        if (preds.length === 0) return baseXpath;
        const extra = preds.join(' and ');
        if (baseXpath.endsWith(']')) {
            // 已有谓词：在最后一个 `]` 前插入
            const idx = baseXpath.lastIndexOf(']');
            return `${baseXpath.slice(0, idx)} and ${extra}]`;
        }
        // 无谓词：直接追加
        return `${baseXpath}[${extra}]`;
    }

    /** 将属性名数组转换为 XPath 谓词字符串。
     *  不传 props 时自动从 info 中选取有值的属性。
     *  自动跳过 findSelector 最后一步中已存在的属性谓词，避免重复。 */
    private buildXpathFromProps(propNames: string[]): string {
        const autoProps = propNames.length === 0
            ? this.selectAutoProps()
            : propNames;

        // 解析 findSelector 最后一步中已存在的属性名（如 @FrameworkId、@ControlType）
        const existingAttrs = this.parseExistingAttrs(this.findSelector);

        const preds: string[] = [];
        for (const prop of autoProps) {
            const attr = this.mapPropToAttr(prop);
            // 跳过 findSelector 中已存在的属性，避免重复谓词
            if (existingAttrs.has(attr)) continue;
            const value = this.getPropValue(prop);
            if (value) {
                preds.push(`@${attr}='${this.escapeXpath(value)}'`);
            }
        }

        return this.appendPredicates(this.findSelector, preds);
    }

    /** 解析操作时实际使用的 XPath。
     *  - 用户传了 propNames → buildXpathFromProps(propNames)
     *  - foundElementCount > 1 且没传 propNames → 自动 buildXpathFromProps([])
     *  - 否则 → 直接 findSelector
     */
    resolveXpath(propNames: string[]): string {
        if (propNames.length > 0) {
            return this.buildXpathFromProps(propNames);
        }
        if (this.foundElementCount > 1) {
            return this.buildXpathFromProps([]);
        }
        return this.findSelector;
    }

    /** 将用户传入的 xpath 解析为基于当前元素的完整 XPath。
     *  确保搜索范围始终限定在当前元素下，按前缀决定搜索深度：
     *  - 无前缀（如 'Button'）：搜索所有子孙 → {baseXpath}//Button
     *  - '//' 前缀（如 '//Button'）：搜索所有子孙 → {baseXpath}//Button
     *  - '/' 前缀（如 '/Button'）：搜索直接子元素 → {baseXpath}/Button
     *
     *  如果 xpath 已经是完整路径（含自定义轴前缀 [fast/[full/[fast-child），
     *  则不拼接，直接返回原值。
     */
    private resolveRelativeXpath(xpath: string, propNames: string[]): string {
        // 已经是完整路径（含自定义轴前缀），不拼接
        if (xpath.startsWith('[fast') || xpath.startsWith('[full')) {
            return xpath;
        }

        const baseXpath = this.resolveXpath(propNames);
        if (xpath.startsWith('//')) {
            return `${baseXpath}//${xpath.substring(2)}`;
        }
        if (xpath.startsWith('/')) {
            return `${baseXpath}/${xpath.substring(1)}`;
        }
        // 无前缀，默认搜索所有子孙
        return `${baseXpath}//${xpath}`;
    }

    /** 从 XPath 最后一步的谓词中解析出已有的属性名。
     *  例：`/A/B[@Name='x' and @FrameworkId='Chrome']` → Set {'Name', 'FrameworkId'} */
    private parseExistingAttrs(xpath: string): Set<string> {
        const attrs = new Set<string>();
        // 找到最后一个步骤的谓词部分 [...]
        const lastBracket = xpath.lastIndexOf('[');
        if (lastBracket < 0) return attrs;
        const closingBracket = xpath.lastIndexOf(']');
        if (closingBracket < 0) return attrs;
        const predicate = xpath.substring(lastBracket + 1, closingBracket);
        // 匹配 @AttrName= 模式
        const attrPattern = /@(\w+)/g;
        let match;
        while ((match = attrPattern.exec(predicate)) !== null) {
            attrs.add(match[1]);
        }
        return attrs;
    }

    /** 自动从 info 中选取有值的属性（按优先级排序） */
    private selectAutoProps(): string[] {
        const props = ['automationId', 'name', 'className', 'frameworkId', 'controlType', 'helpText', 'itemType', 'itemStatus'];
        // 过滤掉值为空字符串的属性
        return props.filter(p => this.getPropValue(p) !== '');
    }

    /** 属性名 → UIA 属性名映射 */
    private mapPropToAttr(prop: string): string {
        const map: Record<string, string> = {
            'name': 'Name',
            'automationId': 'AutomationId',
            'className': 'ClassName',
            'frameworkId': 'FrameworkId',
            'controlType': 'ControlType',
            'helpText': 'HelpText',
            'itemType': 'ItemType',
            'itemStatus': 'ItemStatus',
        };
        return map[prop] || prop;
    }

    /** 属性名 → this.info 中对应值 */
    private getPropValue(prop: string): string {
        const info = this.info;
        switch (prop) {
            case 'name': return info.name;
            case 'automationId': return info.automationId;
            case 'className': return info.className;
            case 'frameworkId': return info.frameworkId;
            case 'controlType': return info.controlType;
            case 'helpText': return info.helpText;
            case 'itemType': return info.itemType;
            case 'itemStatus': return info.itemStatus;
            default: return '';
        }
    }

    /** 转义 XPath 字符串中的单引号 */
    private escapeXpath(s: string): string {
        return s.replace(/'/g, "&apos;");
    }

    /**
     * 构造相对 XPath，用于 findFromElement API。
     *
     * 规则：
     *  - 如果 xpath 已是完整路径（含自定义轴前缀 [fast/[full/[fast-child），不拼接，原样返回。
     *  - 否则，去掉父元素 findSelector 前缀，保留用户指定的搜索范围前缀：
     *    - 'Button' 或 '//Button' → '//Button'（搜索所有子孙）
     *    - '/Button' → '/Button'（搜索直接子元素）
     */
    private buildRelativeXpath(xpath: string, propNames: string[]): string {
        // 已经是完整路径（含自定义轴前缀），直接返回
        if (xpath.startsWith('[fast') || xpath.startsWith('[full')) {
            return xpath;
        }

        const fullXPath = this.resolveRelativeXpath(xpath, propNames);
        const prefix = this.resolveXpath(propNames);
        if (fullXPath.startsWith(prefix + '//')) {
            return '//' + fullXPath.substring(prefix.length + 2);
        }
        if (fullXPath.startsWith(prefix + '/')) {
            return '/' + fullXPath.substring(prefix.length + 1);
        }
        return fullXPath;
    }

    /** 构造子元素的完整 XPath（用于 Element.findSelector） */
    private buildChildXpath(xpath: string): string {
        return this.resolveRelativeXpath(xpath, []);
    }

    /**
     * 构造子控件索引的 XPath 谓词后缀。
     *
     * - index >= 0 → `/*[position()=N+1]`
     * - index == -1 → `/*[last()]`
     * - index < -1 → `/*[last()+N+1]`
     */
    private buildChildIndexPredicate(index: number): string {
        if (index >= 0) {
            return `/*[position()=${index + 1}]`;
        } else if (index === -1) {
            return `/*[last()]`;
        } else {
            // index < -1: e.g. -2 → last()-1, -3 → last()-2
            const offset = Math.abs(index) - 1;
            return `/*[last()-${offset}]`;
        }
    }

    /**
     * 解析罗盘路径字符串为 token 数组。
     *
     * 支持的 token 类型：
     * - `{ type: 'parent', levels: N }` — 向上 N 层
     * - `{ type: 'child', index: N }` — 子控件索引（可负）
     * - `{ type: 'sibling_abs', index: N }` — 绝对位置兄弟（可负）
     * - `{ type: 'sibling_left', offset: N }` — 左侧第 N 个兄弟
     * - `{ type: 'sibling_right', offset: N }` — 右侧第 N 个兄弟
     */
    private parseCompassPath(path: string): CompassToken[] {
        if (!path || path.length === 0) {
            throw new InvalidArgumentError('path', '罗盘路径不能为空');
        }

        const tokens: CompassToken[] = [];
        let i = 0;

        while (i < path.length) {
            const ch = path[i];

            if (ch === 'p') {
                // 父级：p 或 pN
                i++;
                const num = this.readOptionalNumber(path, i);
                tokens.push({ type: 'parent', levels: num !== null ? num : 1 });
                if (num !== null) i += String(num).length;
            } else if (ch === 'c') {
                // 子级：cN 或 c-N
                i++;
                const num = this.readSignedNumber(path, i);
                if (num === null) {
                    throw new InvalidArgumentError('path', `罗盘路径 'c' 后缺少索引数字，位置 ${i}`);
                }
                tokens.push({ type: 'child', index: num });
                i += String(num).length;
            } else if (ch === 's') {
                // 兄弟：sN / s-N / s<N / s>N
                i++;
                if (i < path.length && path[i] === '<') {
                    i++;
                    const num = this.readSignedNumber(path, i);
                    if (num === null) {
                        throw new InvalidArgumentError('path', `罗盘路径 's<' 后缺少偏移数字，位置 ${i}`);
                    }
                    tokens.push({ type: 'sibling_left', offset: num });
                    i += String(num).length;
                } else if (i < path.length && path[i] === '>') {
                    i++;
                    const num = this.readSignedNumber(path, i);
                    if (num === null) {
                        throw new InvalidArgumentError('path', `罗盘路径 's>' 后缺少偏移数字，位置 ${i}`);
                    }
                    tokens.push({ type: 'sibling_right', offset: num });
                    i += String(num).length;
                } else {
                    const num = this.readSignedNumber(path, i);
                    if (num === null) {
                        throw new InvalidArgumentError('path', `罗盘路径 's' 后缺少索引数字，位置 ${i}`);
                    }
                    tokens.push({ type: 'sibling_abs', index: num });
                    i += String(num).length;
                }
            } else if (ch === '>') {
                // 子级简写：>N 或 >-N
                i++;
                const num = this.readSignedNumber(path, i);
                if (num === null) {
                    throw new InvalidArgumentError('path', `罗盘路径 '>' 后缺少索引数字，位置 ${i}`);
                }
                tokens.push({ type: 'child', index: num });
                i += String(num).length;
            } else {
                throw new InvalidArgumentError('path', `罗盘路径包含无法识别的字符 '${ch}'，位置 ${i}`);
            }
        }

        if (tokens.length === 0) {
            throw new InvalidArgumentError('path', '罗盘路径解析结果为空');
        }

        return tokens;
    }

    /** 读取可选的正整数（无数字时返回 null） */
    private readOptionalNumber(path: string, pos: number): number | null {
        if (pos >= path.length) return null;
        const match = path.substring(pos).match(/^(\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /** 读取带符号的整数（如 "3"、"-1"） */
    private readSignedNumber(path: string, pos: number): number | null {
        if (pos >= path.length) return null;
        const match = path.substring(pos).match(/^(-?\d+)/);
        return match ? parseInt(match[1], 10) : null;
    }

    /**
     * 将罗盘 token 数组转换为完整 XPath 表达式。
     *
     * 对 `sibling_left` / `sibling_right` token，使用 XPath 的
     * `preceding-sibling::*[N]` / `following-sibling::*[N]` 实现。
     * 其余 token 直接拼接 XPath 轴。
     */
    private buildCompassXpath(baseXpath: string, tokens: CompassToken[]): string {
        let xpath = baseXpath;

        for (const token of tokens) {
            switch (token.type) {
                case 'parent':
                    xpath += '/..'.repeat(token.levels);
                    break;
                case 'child':
                    xpath += this.buildChildIndexPredicate(token.index);
                    break;
                case 'sibling_abs':
                    xpath += '/..' + this.buildChildIndexPredicate(token.index);
                    break;
                case 'sibling_left':
                    xpath += `/preceding-sibling::*[${token.offset}]`;
                    break;
                case 'sibling_right':
                    xpath += `/following-sibling::*[${token.offset}]`;
                    break;
            }
        }

        return xpath;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 等待方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 等待元素消失
     */
    async waitUntilGone(options?: FindOptions & { timeout?: number; interval?: number }, ...propNames: string[]): Promise<void> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const useXpath = this.resolveXpath(propNames);
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            // 有 runtimeId 时通过缓存验证（极快，~1ms）
            if (this.runtimeId) {
                const resp = await this.client.refreshByRuntimeId(
                    this.windowSelector, this.runtimeId
                );
                if (!resp.found) return; // 缓存未命中 = 元素消失
            } else {
                const response = await this.client.find({
                    window: this.windowSelector,
                    element: useXpath,
                });
                if (!response.found) return;
            }
            
            await delay(interval);
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${useXpath}`);
    }

    /**
     * 等待当前元素出现并返回最新实例。
     *
     * @param options - 等待选项
     * @returns 最新的 Element 实例
     *
     * @example
     * const el = await button.waitFor({ timeout: 5000 });
     */
    async waitFor(options?: FindOptions & { timeout?: number; interval?: number }, ...propNames: string[]): Promise<Element> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const useXpath = this.resolveXpath(propNames);
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            if (this.runtimeId) {
                const resp = await this.client.refreshByRuntimeId(
                    this.windowSelector, this.runtimeId
                );
                if (resp.found && resp.element) {
                    delete (resp.element as any).elementSelector;
                    Object.assign(this.info, resp.element);
                    return this;
                }
            } else {
                try {
                    const response = await this.client.find({
                        window: this.windowSelector,
                        element: useXpath,
                    });
                    if (response.found && response.element) {
                        return new Element(
                            this.client,
                            useXpath,
                            this.windowSelector,
                            response.findSelector || useXpath,
                            response.element!,
                            this.autoWaitConfig,
                            this.logger,
                            response.total ?? 1,
                        );
                    }
                } catch { /* keep polling */ }
            }
            await delay(interval);
        }

        throw new Error(`Element did not appear within ${timeout}ms: ${useXpath}`);
    }

    /**
     * 滚动使当前元素完全可见（top 和 bottom 都在容器视口内）。
     * 在 containerSelector 指定的容器上悬停并滚动鼠标滚轮，直到当前元素进入视口。
     *
     * 必须通过 direction 参数指定滚动方向：
     * - 'up'：向上滚动（视口上移，内容向屏幕底部移出，看到上方内容），delta = +120
     * - 'down'：向下滚动（视口下移，内容向屏幕顶部移出，看到下方内容），delta = -120
     *
     * @param containerSelector - 滚动容器的 XPath，鼠标将在此元素上悬停并滚动。
     * @param options - 滚动选项
     * @param options.direction - 滚动方向：'up' 或 'down'（必填）
     * @param options.propNames - refresh 时用于构造精确 XPath 的属性名
     * @param options.times - 最大滚动次数，默认 100
     * @param options.autoScrollAmount - 是否自动调整滚动量，默认 false
     * @param options.scrollInterval - 每次滚动后的等待时间（ms），默认 1000
     * @param options.scrollToCenter - 是否滚动到视口中心，默认 true
     * @param options.centerAdjustTimes - scrollToCenter 最大调整次数，默认 5
     *
     * @returns ScrollToVisibleResult - 包含 visible、scrolledToEnd、scrolled、targetRect 字段
     *
     * @example
     * const result = await el.scrollToVisible('/Window/Pane[@Name="list"]', { direction: 'up' });
     * if (!result.visible && result.scrolledToEnd) {
     *     // 滚动到底了，可以尝试反方向
     * }
     */
    async scrollToVisible(
        containerSelector: string,
        options: { direction: 'up' | 'down'; propNames?: string[]; times?: number; autoScrollAmount?: boolean; scrollToCenter?: boolean; centerAdjustTimes?: number; scrollInterval?: number; autoScrollDelay?: number; minScrollRatio?: number; centerSnapThreshold?: number; viewportInset?: ViewportInset; smoothStepDelta?: number }
    ): Promise<ScrollToVisibleResult> {
        const times = options?.times ?? DEFAULTS.scrollToVisible.scrollTimes;
        const propNames = options?.propNames ?? [];
        const autoScrollAmount = options?.autoScrollAmount ?? false;
        const scrollToCenter = options?.scrollToCenter ?? true;
        const centerAdjustTimes = options?.centerAdjustTimes ?? 5;
        const scrollInterval = options?.scrollInterval ?? DEFAULTS.scrollToVisible.scrollInterval;
        const autoScrollDelay = options?.autoScrollDelay ?? DEFAULTS.scrollToVisible.autoScrollDelay;
        const minScrollRatio = options?.minScrollRatio ?? DEFAULTS.scrollToVisible.minScrollRatio;
        const centerSnapThreshold = options?.centerSnapThreshold ?? DEFAULTS.scrollToVisible.centerSnapThreshold;
        const viewportInset = options?.viewportInset;

        // direction 必填
        const delta = options.direction === 'up' ? 120 : -120;

        // 使用带唯一属性的 XPath 作为 wait 条件
        const waitXpath = this.resolveXpath(propNames);

        // 第一阶段：滚动到元素部分可见（isOffscreen=false）
        let scrollResult;
        try {
            scrollResult = await this.client.scrollMouse({
                window: this.windowSelector,
                element: containerSelector,
                delta,
                times,
                autoScrollAmount,
                wait: waitXpath,
                waitMode: 'visible',
                timeout: scrollInterval * times,
                scrollToCenter,
                centerAdjustTimes,
                scrollInterval,
                autoScrollDelay,
                minScrollRatio,
                centerSnapThreshold,
                viewportInset,
                smoothStepDelta: options?.smoothStepDelta,
            });
        } catch (error) {
            // scrollMouse HTTP 超时或网络错误，返回失败结果而非抛出异常
            return { visible: false, scrolledToEnd: false, scrolled: 0 };
        }

        // 刷新获取最新元素 rect
        try {
            await this.refresh(...propNames || []);
        } catch {
            // refresh 失败，元素可能已不在 DOM 中
        }

        const visible = !this.info.isOffscreen;
        return {
            visible,
            scrolledToEnd: scrollResult.scrolledToEnd ?? false,
            scrolled: scrollResult.scrolled,
            targetRect: scrollResult.targetRect,
            visibleRect: scrollResult.visibleRect,
        };
    }

   
    // ═══════════════════════════════════════════════════════════════════════════
    // 控件状态方法（需要后端提供 UIA Pattern 信息）
    // ═══════════════════════════════════════════════════════════════════════════

    /** 元素是否支持 Toggle（checkbox / radio / toggle button）。
     *  依赖后端在 ElementInfo 中返回 isCheckable。（使用本地缓存属性，如需最新状态请先 refresh） */
    async isCheckable(): Promise<boolean> {
        return this.info.isCheckable ?? false;
    }

    /** 元素是否处于勾选状态。
     *  依赖后端在 ElementInfo 中返回 isChecked。（使用本地缓存属性，如需最新状态请先 refresh） */
    async isChecked(): Promise<boolean> {
        return this.info.isChecked ?? false;
    }

    /** 元素是否可点击（支持 InvokePattern 或属于可点击的 ControlType）。
     *  依赖后端在 ElementInfo 中返回 isClickable。（使用本地缓存属性，如需最新状态请先 refresh） */
    async isClickable(): Promise<boolean> {
        return this.info.isClickable ?? true;
    }

    /** 元素是否可滚动（支持 ScrollPattern）。
     *  依赖后端在 ElementInfo 中返回 isScrollable。（使用本地缓存属性，如需最新状态请先 refresh） */
    async isScrollable(): Promise<boolean> {
        return this.info.isScrollable ?? false;
    }

    /** 元素是否处于选中状态（list item / tab / tree item 等）。
     *  依赖后端在 ElementInfo 中返回 isSelected。（使用本地缓存属性，如需最新状态请先 refresh） */
    async isSelected(): Promise<boolean> {
        return this.info.isSelected ?? false;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 操作扩展方法（Phase 2: 需要后端 hover/drag 端点）
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 在元素位置显示高亮闪烁（绿色边框 + 类型标签），指定时间后自动消失。
     *
     * 适合调试和视觉验证：确认定位到的元素是否正确。
     *
     * @param options - 闪烁选项
     * @param options.timeout - 闪烁持续时间（ms），默认 1000
     *
     * @example
     * await button.flash();                 // 默认闪烁 1 秒
     * await button.flash({ timeout: 3000 }); // 闪烁 3 秒
     */
    async flash(options?: FlashOptions, ...propNames: string[]): Promise<void> {
        this.logger.logOperation('高亮闪烁元素', this.info);

        const useXpath = this.resolveXpath(propNames);

        const result = await this.client.flashElement(
            this.windowSelector,
            useXpath,
            options?.timeout ?? 1000,
            this.runtimeId || undefined,
        );

        if (!result.success) {
            this.logger.logError('高亮闪烁元素', new ActionFailedError('flash', result.error ?? 'Flash failed', undefined));
            throw new ActionFailedError('flash', result.error ?? 'Flash failed', undefined);
        }

        this.logger.logSuccess('高亮闪烁元素');
    }

    /**
     * 鼠标悬停在元素上（触发 tooltip/hover 菜单）。
     *
     * Web CDP: dispatchMouseEvent('mousemove')
     * Windows: humanized_move to center + 停留
     *
     * @param options - 悬停选项
     * @param options.duration - 悬停停留时间（ms），默认 500
     * @param options.humanize - 是否拟人化移动，默认 true
     *
     * @example
     * await menuItem.hover();  // 悬停触发子菜单
     * await tooltipEl.hover(); // 悬停显示 tooltip
     */
    async hover(options?: { duration?: number; humanize?: boolean }, ...propNames: string[]): Promise<void> {
        this.logger.logOperation('悬停在元素上', this.info);

        const useXpath = this.resolveXpath(propNames);

        const result = await this.client.hoverMouse({
            window: this.windowSelector,
            element: useXpath,
            runtimeId: this.runtimeId || undefined,
            duration: options?.duration ?? 500,
            humanize: options?.humanize ?? true,
        });

        if (!result.success) {
            throw new ActionFailedError('hover', result.error ?? 'Hover failed', undefined);
        }

        this.logger.logSuccess('悬停在元素上');
        await this.maybeAutoWait('afterFind');
    }

    /**
     * 拖拽当前元素到目标元素。
     *
     * Web CDP: dispatchDragEvents
     * Windows: mouse_down → bezier_move → mouse_up
     *
     * @param target - 目标元素或坐标
     * @param options - 拖拽选项
     * @param options.duration - 拖拽持续时间（ms），默认 1000
     *
     * @example
     * await fileItem.dragTo(folderItem);           // 拖拽文件到文件夹
     * await listItem.dragTo(dropZone);             // 拖拽列表项到放置区
     * await slider.dragTo({ x: 500, y: 300 });    // 拖拽滑块到坐标
     */
    async dragTo(target: Element | { x: number; y: number }, options?: { duration?: number; propNames?: string[]; targetPropNames?: string[] }): Promise<void> {
        this.logger.logOperation('拖拽元素', this.info);

        if ('x' in target && 'y' in target) {
            // 坐标目标 — 需要构造一个临时元素用于后端查找
            // 后端 drag 需要源元素和目标元素 XPath，
            // 对于坐标目标，直接使用源元素坐标 → 目标坐标
            throw new ActionFailedError('dragTo', '坐标拖拽暂不支持，请使用元素作为目标', undefined);
        }

        const useXpath = this.resolveXpath(options?.propNames ?? []);
        const targetXpath = target.resolveXpath(options?.targetPropNames ?? []);

        const result = await this.client.dragMouse({
            window: this.windowSelector,
            sourceElement: useXpath,
            sourceRuntimeId: this.runtimeId || undefined,
            targetElement: targetXpath,
            targetRuntimeId: target.runtimeId || undefined,
            duration: options?.duration ?? 1000,
        });

        if (!result.success) {
            throw new ActionFailedError('dragTo', result.error ?? 'Drag failed', undefined);
        }

        this.logger.logSuccess('拖拽元素');
        await this.maybeAutoWait('afterClick');
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 内部工具方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 解析窗口选择器字符串为对象
     */
    private parseWindowSelector(selector: string): any {
        // 简单实现：假设格式为 "title:xxx className:xxx processName:xxx"
        const parts = selector.split(' ').filter(p => p.includes(':'));
        const result: any = {};
        
        for (const part of parts) {
            const [key, value] = part.split(':');
            if (key === 'title') result.title = value;
            else if (key === 'className') result.className = value;
            else if (key === 'processName') result.processName = value;
        }
        
        // 如果没有解析出任何属性，假设是 title
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

    /**
     * 自定义 JSON 序列化，使 console.log 能正确显示元素信息
     */
    toJSON() {
        return {
            selector: this.selector,
            window: this.windowSelector,
            findSelector: this.findSelector,
            info: this.info,
        };
    }
}
