// sdk/nodejs/src/element.ts
// Element 类 - 表示 UI 自动化中的元素对象

import { HttpClient } from './client';
import { ElementInfo, Rect, ClickOptions, TypeOptions, WaitOptions, AutoWaitConfig, DEFAULTS } from './types';
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
        // 根据属性名返回对应的值
        switch (name.toLowerCase()) {
            case 'name':
                return this.info.name || '';
            case 'controltype':
                return this.info.controlType || '';
            case 'automationid':
                return this.info.automationId || '';
            case 'classname':
                return this.info.className || '';
            case 'frameworkid':
                return this.info.frameworkId || '';
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
