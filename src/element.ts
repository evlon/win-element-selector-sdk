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
    readonly elementSelector: string;
    readonly info: ElementInfo;

    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;

    /**
     * XPath 字符串（可读取），同时也可作为函数调用进行属性级重新查询。
     *
     * @example
     * const el = await flow.find('//Button');
     * console.log(el.xpath);           // 读取 XPath 字符串
     * const refined = await el.xpath("name"); // 用 name 属性重新查询
     */
    xpath: string & ((...propNames: string[]) => Promise<Element>);

    constructor(
        private client: HttpClient,
        xpathStr: string,
        windowSelector: string,
        elementSelector: string,
        info: ElementInfo,
        autoWaitConfig: AutoWaitConfig,
        logger: OperationLogger
    ) {
        this.windowSelector = windowSelector;
        this.elementSelector = elementSelector;
        // 防御性清理：确保 elementSelector 不泄漏到 info 中（旧版后端可能仍返回）
        delete (info as any).elementSelector;
        this.info = info;
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;

        // xpath 既是字符串又是函数
        const xpathFn = async (...propNames: string[]): Promise<Element> => {
            return this.xpathOf(...propNames);
        };
        Object.defineProperty(xpathFn, 'toString', {
            value: () => xpathStr,
            configurable: true,
        });
        Object.defineProperty(xpathFn, 'valueOf', {
            value: () => xpathStr,
            configurable: true,
        });
        this.xpath = xpathFn as string & ((...propNames: string[]) => Promise<Element>);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // XPath 精炼（内部实现）
    // ═══════════════════════════════════════════════════════════════════════════

    /** 基于指定属性构造 XPath，重新查询当前元素。
     *  不传任何参数时自动从 automationId → name → className → ... 中选取有值的属性重新查询。 */
    private async xpathOf(...propNames: string[]): Promise<Element> {
        const refined = this.buildXpathFromProps(propNames);
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: refined,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(refined, this.windowSelector);
        }

        return new Element(
            this.client,
            refined,
            this.windowSelector,
            response.element!.elementSelector || refined,
            response.element,
            this.autoWaitConfig,
            this.logger
        );
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 查询方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 获取元素文本
     */
    async getText(): Promise<string> {
        return this.info.name || '';
    }

    /**
     * 获取元素文本内容（getText 的别名，与 Playwright/CDP 命名一致）
     */
    async textContent(): Promise<string> {
        return this.getText();
    }

    /**
     * 检查元素是否可用
     */
    async isEnabled(): Promise<boolean> {
        // 重新获取最新状态
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        
        if (!response.found || !response.element) {
            return false;
        }
        
        // 更新内部信息
        Object.assign(this.info, response.element);
        return !response.element.isOffscreen;
    }

    /**
     * 检查元素是否可见
     */
    async isVisible(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        
        if (!response.found || !response.element) {
            return false;
        }
        
        // 更新内部信息
        Object.assign(this.info, response.element);
        
        // 检查可见性：isOffscreen 或 rect 无效
        return !response.element.isOffscreen && 
               response.element.rect.width > 0 && 
               response.element.rect.height > 0;
    }

    /**
     * 检查元素是否在屏幕外
     */
    async isOffscreen(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        
        if (!response.found || !response.element) {
            return true;
        }
        
        return response.element.isOffscreen;
    }

    /**
     * 获取元素属性
     */
    async getAttribute(name: string): Promise<string> {
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
     * 获取元素位置和尺寸
     */
    async getRect(): Promise<Rect> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });

        if (!response.found || !response.element) {
            throw new ElementNotFoundError(this.elementSelector, this.windowSelector);
        }

        return response.element.rect;
    }

    /**
     * 获取元素位置和尺寸（getRect 的别名，与 Playwright/CDP 命名一致）
     */
    async boundingBox(): Promise<Rect> {
        return this.getRect();
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
            element: this.elementSelector,
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
    async doubleClick(): Promise<void> {
        // 目前后端没有单独的双击 API，通过两次点击模拟
        await this.click();
        await delay(100);
        await this.click();
    }

    /**
     * 双击元素（doubleClick 的别名，Playwright 风格命名）
     */
    async dblclick(): Promise<void> {
        return this.doubleClick();
    }

    /**
     * 右键点击元素
     */
    async rightClick(): Promise<void> {
        this.logger.logOperation('右键点击元素', this.info);

        const result = await this.client.clickMouse({
            window: this.windowSelector,
            element: this.elementSelector,
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
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(this.elementSelector, this.windowSelector);
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
     * 在当前元素下查找子元素
     */
    async find(xpath: string): Promise<Element> {
        // 构建完整的 XPath（相对于当前元素）
        const fullXPath = xpath.startsWith('/') 
            ? xpath 
            : `${this.elementSelector}//${xpath}`;
        
        const response = await this.client.getElement({
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
            response.elementSelector || fullXPath,
            response.element,
            this.autoWaitConfig,
            this.logger
        );
    }

    /**
     * 在当前元素下查找所有匹配的子元素
     */
    async findAll(xpath: string): Promise<Element[]> {
        // TODO: 需要后端支持 findAll API
        // 目前先返回单个元素数组
        const element = await this.find(xpath);
        return [element];
    }

    /**
     * 在当前元素下查找子元素（find 的别名，与 Playwright 命名一致）
     *
     * Web CDP: element.querySelector(xpath)
     * Windows: 拼接相对 XPath
     */
    async locator(xpath: string): Promise<Element> {
        return this.find(xpath);
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
        const directChildrenXpath = `${this.elementSelector}/*`;
        const fullXpath = xpath
            ? `${directChildrenXpath}//${xpath}`
            : directChildrenXpath;

        const response = await this.client.getAllElements({
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
            const resp = await this.client.getElement({
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
                resp.elementSelector || pXpath,
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
        const response = await this.client.getAllElements({
            window: this.windowSelector,
            element: `${this.elementSelector}/*`,
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
    async parentElement(): Promise<Element | null> {
        const parentXpath = `${this.elementSelector}/..`;
        try {
            const response = await this.client.getElement({
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
                response.elementSelector || parentXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger
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
    async nextSiblingElement(): Promise<Element | null> {
        const siblingXpath = `${this.elementSelector}/following-sibling::*[1]`;
        try {
            const response = await this.client.getElement({
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
                response.elementSelector || siblingXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger
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
    async previousSiblingElement(): Promise<Element | null> {
        const siblingXpath = `${this.elementSelector}/preceding-sibling::*[1]`;
        try {
            const response = await this.client.getElement({
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
                response.elementSelector || siblingXpath,
                response.element!,
                this.autoWaitConfig,
                this.logger
            );
        } catch {
            return null;
        }
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

    /** 在 elementSelector 的最后一个节点上追加谓词。
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
     *  不传 props 时自动从 info 中选取有值的属性。 */
    private buildXpathFromProps(propNames: string[]): string {
        const autoProps = propNames.length === 0
            ? this.selectAutoProps()
            : propNames;

        const preds: string[] = [];
        for (const prop of autoProps) {
            const attr = this.mapPropToAttr(prop);
            const value = this.getPropValue(prop);
            if (value) {
                preds.push(`@${attr}='${this.escapeXpath(value)}'`);
            }
        }

        return this.appendPredicates(this.elementSelector, preds);
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
            const response = await this.client.getElement({
                window: this.windowSelector,
                element: this.elementSelector,
            });

            if (!response.found) {
                return; // 元素已消失
            }
            
            await delay(interval);
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${this.elementSelector}`);
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
                const response = await this.client.getElement({
                    window: this.windowSelector,
                    element: this.elementSelector,
                });
                if (response.found && response.element) {
                    return new Element(
                        this.client,
                        this.elementSelector,
                        this.windowSelector,
                        response.elementSelector || this.elementSelector,
                        response.element!,
                        this.autoWaitConfig,
                        this.logger
                    );
                }
            } catch { /* keep polling */ }
            await delay(interval);
        }

        throw new Error(`Element did not appear within ${timeout}ms: ${this.elementSelector}`);
    }

    /**
     * 滚动使当前元素可见。
     * 通过在元素上悬停并滚动鼠标滚轮，直到元素进入视口。
     *
     * @param times - 最大滚动次数，默认 10
     *
     * @example
     * await el.scrollIntoView();
     */
    async scrollIntoView(times: number = 10): Promise<void> {
        // 检查元素当前可见性，如果已可见则无需滚动
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (response.found && response.element && !response.element.isOffscreen) {
            return;
        }

        // 滚动直到元素可见
        for (let i = 0; i < times; i++) {
            const resp = await this.client.getElement({
                window: this.windowSelector,
                element: this.elementSelector,
            });
            if (resp.found && resp.element && !resp.element.isOffscreen) {
                return;
            }
            // 在元素上悬停并滚动
            await this.client.scrollMouse({
                element: this.elementSelector,
                delta: -120, // 向下滚动（负值）
                times: 1,
                autoDelta: false,
            });
            await delay(150);
        }

        // 最终检查
        const finalResp = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (finalResp.found && finalResp.element && finalResp.element.isOffscreen) {
            throw new Error(`Element could not be scrolled into view within ${times} scrolls: ${this.elementSelector}`);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 控件状态方法（需要后端提供 UIA Pattern 信息）
    // ═══════════════════════════════════════════════════════════════════════════

    /** 元素是否支持 Toggle（checkbox / radio / toggle button）。
     *  依赖后端在 ElementInfo 中返回 isCheckable。 */
    async isCheckable(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (!response.found || !response.element) return false;
        return response.element.isCheckable ?? false;
    }

    /** 元素是否处于勾选状态。
     *  依赖后端在 ElementInfo 中返回 isChecked。 */
    async isChecked(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (!response.found || !response.element) return false;
        return response.element.isChecked ?? false;
    }

    /** 元素是否可点击（支持 InvokePattern 或属于可点击的 ControlType）。
     *  依赖后端在 ElementInfo 中返回 isClickable。 */
    async isClickable(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (!response.found || !response.element) return false;
        return response.element.isClickable ?? true;
    }

    /** 元素是否可滚动（支持 ScrollPattern）。
     *  依赖后端在 ElementInfo 中返回 isScrollable。 */
    async isScrollable(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (!response.found || !response.element) return false;
        return response.element.isScrollable ?? false;
    }

    /** 元素是否处于选中状态（list item / tab / tree item 等）。
     *  依赖后端在 ElementInfo 中返回 isSelected。 */
    async isSelected(): Promise<boolean> {
        const response = await this.client.getElement({
            window: this.windowSelector,
            element: this.elementSelector,
        });
        if (!response.found || !response.element) return false;
        return response.element.isSelected ?? false;
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
            element: this.elementSelector,
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
            sourceElement: this.elementSelector,
            targetElement: target.elementSelector,
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
     * 自定义 JSON 序列化，使 console.log 能正确显示 xpath 字符串
     */
    toJSON() {
        return {
            window: this.windowSelector,
            elementSelector: this.elementSelector,
            element: this.elementSelector,
            info: this.info,
        };
    }
}
