// sdk/nodejs/src/element.ts
// Element 类 - 表示 UI 自动化中的元素对象

import { HttpClient } from './client';
import { ElementInfo, Rect, ClickOptions, TypeOptions, WaitOptions, AutoWaitConfig, DEFAULTS, ElementList } from './types';
import { ActionFailedError, ElementNotFoundError } from './errors';
import { OperationLogger } from './logger';
import { delay } from './sleep';

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

    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;

    /**
     * 元素选择器字符串（只读）
     *
     * @example
     * const el = await flow.find('//Button');
     * console.log(el.selector);  // 读取选择器字符串
     */
    readonly selector: string;

    constructor(
        private client: HttpClient,
        xpathStr: string,
        windowSelector: string,
        findSelector: string,
        info: ElementInfo,
        autoWaitConfig: AutoWaitConfig,
        logger: OperationLogger
    ) {
        this.windowSelector = windowSelector;
        this.findSelector = findSelector;
        // 防御性清理：确保 findSelector 不泄漏到 info 中（旧版后端可能仍返回 elementSelector）
        delete (info as any).elementSelector;
        this.info = info;
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;
        this.selector = xpathStr;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 查询方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 获取元素文本
     */
    async text(): Promise<string> {
        return this.info.name || '';
    }

    /**
     * 获取元素文本内容（text 的向后兼容别名）
     */
    async getText(): Promise<string> {
        return this.text();
    }

    /**
     * 检查元素是否可用（使用本地缓存属性，如需最新状态请先 refresh）
     */
    async isEnabled(): Promise<boolean> {
        return this.info.isEnabled;
    }

    /**
     * 获取元素定位器
     */
    async getLocator(...propNames : string[]){
        if(this.findSelector){
            const useXpath = this.buildXpathFromProps(propNames);
            return useXpath;
        }

        return this.findSelector
    }

    /**
     * 获取元素的选择器信息（唯一定位此元素的选择器）
     *
     * @returns 包含 windowSelector 和 elementSelector 的对象
     *
     * @example
     * const sel = el.getSelector();
     * console.log(sel.windowSelector);   // 窗口选择器
     * console.log(sel.elementSelector);   // 元素选择器
     */
    getSelector(): { windowSelector: string; elementSelector: string } {
        return {
            windowSelector: this.windowSelector,
            elementSelector: this.findSelector,
        };
    }

    /**
     * 刷新元素最新状态（原地更新 this.info）。
     *
     * 不传参数时使用 findSelector（适合 find() 返回的精确元素）；
     * 传参数时使用属性构造精确 XPath（适合 findAll() 返回的兄弟元素，XPath 相同的情况）。
     * 元素被删除时抛出 ElementNotFoundError。
     *
     * @example
     * await el.refresh();                        // 用 findSelector 刷新
     * await el.refresh('name', 'automationId');   // 用 name+AutomationId 构造精确 XPath
     * await el.refresh(); // refresh 后继续操作
     * await el.click();
     */
    async refresh(...propNames: string[]): Promise<void> {
        const useXpath = this.buildXpathFromProps(propNames);

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
     * @example
     * const vis = await element.checkVisibility();
     * console.log(vis.visibility);    // "fully_visible" | "partially_visible" | "offscreen"
     * console.log(vis.position);      // "above" | "below" | "left" | "right" | "inside"
     * console.log(vis.overflow);      // { top: 0, bottom: 130, left: 0, right: 0 }
     * console.log(vis.scrollDirection); // "up" | "down" | "left" | "right" | null
     */
    async checkVisibility(...propNames: string[]): Promise<import('./types').ElementVisibilityResult> {
       const useXpath = this.buildXpathFromProps(propNames);

        return this.client.getElementVisibility(this.windowSelector, useXpath);
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
     * 获取元素属性（attr 的向后兼容别名）
     */
    async getAttribute(name: string): Promise<string> {
        return this.attr(name);
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
     * 获取元素位置和尺寸（bounds 的向后兼容别名）
     */
    async getRect(): Promise<Rect> {
        return this.bounds();
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
    async click(options?: ClickOptions): Promise<void> {
        this.logger.logOperation('点击元素', this.info);
        
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.click.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }
        
        const result = await this.client.clickMouse({
            window: this.windowSelector,
            element: this.findSelector,
            options: {
                humanize: options?.humanize ?? DEFAULTS.click.humanize,
                randomRange: options?.randomRange ?? DEFAULTS.click.randomRange,
                button: options?.button ?? 'left',
                clickArea: options?.clickArea,
            },
        });
        
        if (!result.success) {
            this.logger.logError('点击元素', new ActionFailedError('click', 'Click failed', undefined));
            throw new ActionFailedError('click', 'Click failed', undefined);
        }
        
        // 记录点击成功，包含坐标信息
        this.logger.logSuccess('点击元素', { clickPoint: result.clickPoint, elementInfo: this.info });
        
        // 操作后等待（优先级：options > DEFAULTS > autoWait）
        const waitAfter = options?.waitAfter ?? DEFAULTS.click.waitAfter;
        if (waitAfter && waitAfter > 0) {
            await delay(waitAfter);
        } else if (this.autoWaitConfig.enabled) {
            // 仅在没有配置 waitAfter 且 autoWait 启用时才使用
            await this.maybeAutoWait('afterClick');
        }
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
     * 双击元素（dblclick 的向后兼容别名）
     */
    async doubleClick(): Promise<void> {
        return this.dblclick();
    }

    /**
     * 右键点击元素
     */
    async rightClick(): Promise<void> {
        this.logger.logOperation('右键点击元素', this.info);

        const result = await this.client.clickMouse({
            window: this.windowSelector,
            element: this.findSelector,
            options: {
                button: 'right',
                humanize: true,
                randomRange: 0.55,
            },
        });

        if (!result.success) {
            this.logger.logError('右键点击元素', new ActionFailedError('rightClick', 'Click failed', undefined));
            throw new ActionFailedError('rightClick', 'Click failed', undefined);
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
        this.logger.logOperation('输入文本到元素', this.info, { text });
        
        // 操作前等待（优先级：options > DEFAULTS）
        const waitBefore = options?.waitBefore ?? DEFAULTS.type.waitBefore;
        if (waitBefore && waitBefore > 0) {
            await delay(waitBefore);
        }
        
        // 先点击元素获得焦点
        await this.click({ waitAfter: 100 });
        
        // 然后输入文本
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
     * 在元素中输入文本（type 的别名）
     */
    async typeText(text: string, options?: TypeOptions): Promise<void> {
        return this.type(text, options);
    }
    
    /**
     * 清空元素内容
     */
    async clear(): Promise<void> {
        // 先全选，然后删除
        await this.type('\x08'.repeat(100)); // 发送退格键
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
    async assertExists(): Promise<void> {
        const response = await this.client.find({
            window: this.windowSelector,
            element: this.findSelector,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(this.findSelector, this.windowSelector);
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
        const actual = await this.getText();
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
    async findOne(xpath: string): Promise<Element> {
        const fullXPath = xpath.startsWith('/') 
            ? xpath 
            : `${this.findSelector}//${xpath}`;
        
        const response = await this.client.find({
            window: this.windowSelector,
            element: fullXPath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(fullXPath, this.windowSelector);
        }

        if (response.total > 1) {
            throw new Error(`findOne 匹配到 ${response.total} 个元素，期望恰好 1 个: ${fullXPath}`);
        }
        
        return new Element(
            this.client,
            fullXPath,
            this.windowSelector,
            response.findSelector || fullXPath,
            response.element,
            this.autoWaitConfig,
            this.logger
        );
    }

    /**
     * 在当前元素下查找第一个匹配的子元素（多个匹配也不报错）
     */
    async findFirst(xpath: string): Promise<Element> {
        const fullXPath = xpath.startsWith('/') 
            ? xpath 
            : `${this.findSelector}//${xpath}`;
        
        const response = await this.client.find({
            window: this.windowSelector,
            element: fullXPath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(fullXPath, this.windowSelector);
        }
        
        return new Element(
            this.client,
            fullXPath,
            this.windowSelector,
            response.findSelector || fullXPath,
            response.element,
            this.autoWaitConfig,
            this.logger
        );
    }

    /**
     * 在当前元素下查找子元素（findOne 的别名）
     *
     * @deprecated 建议使用 findOne() 或 findFirst() 以明确语义
     */
    async find(xpath: string): Promise<Element> {
        return this.findOne(xpath);
    }

    /**
     * 在当前元素下查找所有匹配的子元素
     */
    async findAll(xpath: string): Promise<Element[]> {
        // TODO: 需要后端支持 findAll API
        // 目前先返回单个元素数组
        const element = await this.findFirst(xpath);
        return [element];
    }

    /**
     * 在当前元素下查找子元素（findOne 的别名，与 Playwright 命名一致）
     *
     * Web CDP: element.querySelector(xpath)
     * Windows: 拼接相对 XPath
     */
    async locator(xpath: string): Promise<Element> {
        return this.findOne(xpath);
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
    async children(xpath?: string): Promise<ElementList> {
        const directChildrenXpath = `${this.findSelector}/*`;
        const fullXpath = xpath
            ? `${directChildrenXpath}//${xpath}`
            : directChildrenXpath;

        const response = await this.client.findAll({
            window: this.windowSelector,
            element: fullXpath,
        });

        if (!response.found || !response.elements || response.elements.length === 0) {
            return this.emptyElementList(fullXpath);
        }

        const elements: Element[] = response.elements.map((item) => {
            return new Element(
                this.client,
                fullXpath,
                this.windowSelector,
                fullXpath,
                item,
                this.autoWaitConfig,
                this.logger
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
                this.logger
            );
        };

        return Object.assign(elements, { position: positionFn }) as ElementList;
    }

    /**
     * 获取当前元素的直接子元素数量
     */
    async childCount(): Promise<number> {
        const response = await this.client.findAll({
            window: this.windowSelector,
            element: `${this.findSelector}/*`,
        });
        return response.total ?? 0;
    }

    /**
     * 获取当前元素的父元素。
     *
     * Web: element.parentElement
     * Windows: XPath `/..`
     *
     * @returns 父元素，如果不存在返回 null
     */
    async parent(): Promise<Element | null> {
        const parentXpath = `${this.findSelector}/..`;
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
                this.logger
            );
        } catch {
            return null;
        }
    }

    /**
     * 获取当前元素的父元素（parent 的向后兼容别名）
     */
    async parentElement(): Promise<Element | null> {
        return this.parent();
    }

    /**
     * 获取下一个兄弟元素。
     *
     * Web: element.nextElementSibling
     * Windows: XPath `following-sibling::*[1]`
     *
     * @returns 下一个兄弟元素，如果不存在返回 null
     */
    async next(): Promise<Element | null> {
        const siblingXpath = `${this.findSelector}/following-sibling::*[1]`;
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
                this.logger
            );
        } catch {
            return null;
        }
    }

    /**
     * 获取下一个兄弟元素（next 的向后兼容别名）
     */
    async nextSiblingElement(): Promise<Element | null> {
        return this.next();
    }

    /**
     * 获取上一个兄弟元素。
     *
     * Web: element.previousElementSibling
     * Windows: XPath `preceding-sibling::*[1]`
     *
     * @returns 上一个兄弟元素，如果不存在返回 null
     */
    async prev(): Promise<Element | null> {
        const siblingXpath = `${this.findSelector}/preceding-sibling::*[1]`;
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
                this.logger
            );
        } catch {
            return null;
        }
    }

    /**
     * 获取上一个兄弟元素（prev 的向后兼容别名）
     */
    async previousSiblingElement(): Promise<Element | null> {
        return this.prev();
    }

    /** 返回空的 ElementList（带 position 方法） */
    private emptyElementList(queryXpath: string): ElementList {
        const positionFn = async (n: number): Promise<Element> => {
            const pXpath = `${queryXpath}[position()=${n}]`;
            throw new ElementNotFoundError(pXpath, this.windowSelector);
        };
        return Object.assign([], { position: positionFn }) as ElementList;
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

    // ═══════════════════════════════════════════════════════════════════════════
    // 等待方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 等待元素消失
     */
    async waitUntilGone(options?: WaitOptions): Promise<void> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const response = await this.client.find({
                window: this.windowSelector,
                element: this.findSelector,
            });

            if (!response.found) {
                return; // 元素已消失
            }
            
            await delay(interval);
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${this.findSelector}`);
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
    async waitFor(options?: WaitOptions): Promise<Element> {
        const timeout = options?.timeout ?? 10000;
        const interval = options?.interval ?? 500;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const response = await this.client.find({
                    window: this.windowSelector,
                    element: this.findSelector,
                });
                if (response.found && response.element) {
                    return new Element(
                        this.client,
                        this.findSelector,
                        this.windowSelector,
                        response.findSelector || this.findSelector,
                        response.element!,
                        this.autoWaitConfig,
                        this.logger
                    );
                }
            } catch { /* keep polling */ }
            await delay(interval);
        }

        throw new Error(`Element did not appear within ${timeout}ms: ${this.findSelector}`);
    }

    /**
     * 滚动使当前元素完全可见（top 和 bottom 都在容器视口内）。
     * 在 hoverSelector 指定的容器上悬停并滚动鼠标滚轮，直到当前元素进入视口。
     *
     * 必须通过 direction 参数指定滚动方向：
     * - 'up'：向上滚动（内容向屏幕顶部移动，看到下方内容），delta = +120
     * - 'down'：向下滚动（内容向屏幕底部移动，看到上方内容），delta = -120
     *
     * @param hoverSelector - 滚动容器的 XPath，鼠标将在此元素上悬停并滚动。
     * @param options - 滚动选项
     * @param options.direction - 滚动方向：'up' 或 'down'（必填）
     * @param options.propNames - refresh 时用于构造精确 XPath 的属性名
     * @param options.times - 最大滚动次数，默认 10
     * @param options.autoDelta - 是否自动调整 delta，默认 false
     * @param options.delayMs - 每次滚动后的等待时间（ms），默认 1000
     * @param options.scrollToCenter - 是否滚动到视口中心，默认 true
     * @param options.scrollToCenterAdjustTimes - scrollToCenter 最大调整次数，默认 5
     *
     * @example
     * await el.scrollIntoView('/Window/Pane[@Name="list"]', { direction: 'up' });
     * await el.scrollIntoView('/Window/Pane[@Name="list"]', { direction: 'down', times: 20 });
     */
    async scrollIntoView(
        hoverSelector: string,
        options: { direction: 'up' | 'down'; propNames?: string[]; times?: number; autoDelta?: boolean; delayMs?: number; scrollToCenter?: boolean; scrollToCenterAdjustTimes?: number }
    ): Promise<void> {
        const times = options?.times ?? 10;
        const propNames = options?.propNames ?? [];
        const autoDelta = options?.autoDelta ?? false;
        const delayMs = options?.delayMs ?? 1000;
        const scrollToCenter = options?.scrollToCenter ?? true;
        const scrollToCenterAdjustTimes = options?.scrollToCenterAdjustTimes ?? 5;

        // direction 必填
        const delta = options.direction === 'up' ? 120 : -120;

        // 使用带唯一属性的 XPath 作为 wait 条件
        // 不能用 findSelector：当它匹配多个元素时，后端只检查第一个元素的 isOffscreen，
        // 若第一个可见但目标元素在屏幕外，后端会误判为已可见而停止滚动
        const waitXpath = this.buildXpathFromProps(propNames);

        // 第一阶段：滚动到元素部分可见（isOffscreen=false）
        const scrollResult = await this.client.scrollMouse({
            window: this.windowSelector,
            element: hoverSelector,
            delta,
            times,
            autoDelta,
            wait: waitXpath,
            waitMode: 'visible',
            timeout: delayMs * times,
            scrollToCenter,
            scrollToCenterAdjustTimes,
        });

        // 刷新获取最新元素 rect
        await this.refresh(...propNames || []);
        if (this.info.isOffscreen) {
            throw new Error(`Element could not be scrolled into view within ${times} scrolls: ${this.findSelector}`);
        }
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
    async hover(options?: { duration?: number; humanize?: boolean }): Promise<void> {
        this.logger.logOperation('悬停在元素上', this.info);

        const result = await this.client.hoverMouse({
            window: this.windowSelector,
            element: this.findSelector,
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
    async dragTo(target: Element | { x: number; y: number }, options?: { duration?: number }): Promise<void> {
        this.logger.logOperation('拖拽元素', this.info);

        if ('x' in target && 'y' in target) {
            // 坐标目标 — 需要构造一个临时元素用于后端查找
            // 后端 drag 需要源元素和目标元素 XPath，
            // 对于坐标目标，直接使用源元素坐标 → 目标坐标
            throw new ActionFailedError('dragTo', '坐标拖拽暂不支持，请使用元素作为目标', undefined);
        }

        const result = await this.client.dragMouse({
            window: this.windowSelector,
            sourceElement: this.findSelector,
            targetElement: target.findSelector,
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
        if (!this.autoWaitConfig.enabled) return;

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
