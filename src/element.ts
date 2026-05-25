// sdk/nodejs/src/element.ts
// Element 类 - 表示 UI 自动化中的元素对象

import { HttpClient } from './client';
import { ElementInfo, Rect, ClickOptions, TypeOptions, WaitOptions, AutoWaitConfig } from './types';
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
    // 只读属性
    readonly xpath: string;
    readonly windowSelector: string;
    readonly info: ElementInfo;
    
    private autoWaitConfig: AutoWaitConfig;
    private logger: OperationLogger;

    constructor(
        private client: HttpClient,
        xpath: string,
        windowSelector: string,
        info: ElementInfo,
        autoWaitConfig: AutoWaitConfig,
        logger: OperationLogger
    ) {
        this.xpath = xpath;
        this.windowSelector = windowSelector;
        this.info = info;
        this.autoWaitConfig = autoWaitConfig;
        this.logger = logger;
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
            windowSelector: this.windowSelector,
            xpath: this.xpath,
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
            windowSelector: this.windowSelector,
            xpath: this.xpath,
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
            windowSelector: this.windowSelector,
            xpath: this.xpath,
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
            windowSelector: this.windowSelector,
            xpath: this.xpath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(this.xpath, this.windowSelector);
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
        
        const result = await this.client.clickMouse({
            window: this.windowSelector,  // 直接发送字符串，不需要解析
            xpath: this.xpath,
            options: {
                humanize: options?.humanize ?? true,
                randomRange: options?.randomRange ?? 0.55,
                pauseBefore: options?.pauseBefore ?? 150,
                pauseAfter: options?.pauseAfter ?? 200,
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
        
        // 自动等待
        await this.maybeAutoWait('afterClick');
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
            xpath: this.xpath,
            options: {
                button: 'right',
                humanize: true,
                randomRange: 0.55,
                pauseBefore: 150,
                pauseAfter: 200,
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
        
        // 先点击元素获得焦点
        await this.click({ pauseAfter: 100 });
        
        // 然后输入文本
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
        await this.click({ pauseAfter: 0 });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 断言方法
    // ═══════════════════════════════════════════════════════════════════════════

    /**
     * 断言元素存在
     */
    async assertExists(): Promise<void> {
        const response = await this.client.getElement({
            windowSelector: this.windowSelector,
            xpath: this.xpath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(this.xpath, this.windowSelector);
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
            : `${this.xpath}//${xpath}`;
        
        const response = await this.client.getElement({
            windowSelector: this.windowSelector,
            xpath: fullXPath,
        });
        
        if (!response.found || !response.element) {
            throw new ElementNotFoundError(fullXPath, this.windowSelector);
        }
        
        return new Element(
            this.client, 
            fullXPath, 
            this.windowSelector, 
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
                windowSelector: this.windowSelector,
                xpath: this.xpath,
            });
            
            if (!response.found) {
                return; // 元素已消失
            }
            
            await delay(interval);
        }
        
        throw new Error(`Element did not disappear within ${timeout}ms: ${this.xpath}`);
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
}
