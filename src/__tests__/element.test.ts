/**
 * Element 类新增方法单元测试
 *
 * 测试 Phase 1 新增的所有方法（无需后端改动）：
 * - 别名：dblclick, text, boundingBox, locator
 * - 导航：parentElement, children, childCount, nextSiblingElement, previousSiblingElement
 * - 属性：getAttribute 扩展
 * - 输入：fill
 * - 等待：waitFor
 * - 滚动：scrollIntoView
 */

import { Element } from '../element';
import { HttpClient } from '../client';
import { ElementInfo, Rect, Point, ElementList } from '../types';
import { OperationLogger } from '../logger';
import { AutoWaitConfig, DEFAULTS } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Mock HttpClient
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_RECT: Rect = { x: 100, y: 200, width: 80, height: 30 };
const MOCK_CENTER: Point = { x: 140, y: 215 };
const MOCK_CENTER_RANDOM: Point = { x: 142, y: 217 };

function makeMockElementInfo(overrides: Partial<ElementInfo> = {}): ElementInfo {
    return {
        rect: MOCK_RECT,
        center: MOCK_CENTER,
        centerRandom: MOCK_CENTER_RANDOM,
        controlType: 'Button',
        name: 'Test Button',
        automationId: 'btn-test',
        className: 'Button',
        frameworkId: 'Win32',
        helpText: 'Click to test',
        localizedControlType: '按钮',
        isEnabled: true,
        isOffscreen: false,
        isPassword: false,
        acceleratorKey: '',
        accessKey: '',
        itemType: '',
        itemStatus: '',
        processId: 12345,
        ...overrides,
    };
}

function mockResponse(found: boolean, info?: ElementInfo, listSelector?: string) {
    if (!found) {
        return { found: false, listSelector: '', error: 'Element not found', element: null };
    }
    const base = info || makeMockElementInfo();
    const es = listSelector || '//Button';
    return {
        found: true,
        listSelector: es,
        error: null as string | null,
        rect: base.rect,
        center: base.center,
        centerRandom: base.centerRandom,
        controlType: base.controlType,
        name: base.name,
        automationId: base.automationId,
        className: base.className,
        frameworkId: base.frameworkId,
        helpText: base.helpText,
        localizedControlType: base.localizedControlType,
        isEnabled: base.isEnabled,
        isOffscreen: base.isOffscreen,
        isPassword: base.isPassword,
        acceleratorKey: base.acceleratorKey,
        accessKey: base.accessKey,
        itemType: base.itemType,
        itemStatus: base.itemStatus,
        processId: base.processId,
        element: {
            listSelector: es,
            rect: base.rect,
            center: base.center,
            centerRandom: base.centerRandom,
            controlType: base.controlType,
            name: base.name,
            automationId: base.automationId,
            className: base.className,
            frameworkId: base.frameworkId,
            helpText: base.helpText,
            localizedControlType: base.localizedControlType,
            isEnabled: base.isEnabled,
            isOffscreen: base.isOffscreen,
            isPassword: base.isPassword,
            acceleratorKey: base.acceleratorKey,
            accessKey: base.accessKey,
            itemType: base.itemType,
            itemStatus: base.itemStatus,
            processId: base.processId,
            isCheckable: base.isCheckable,
            isChecked: base.isChecked,
            isClickable: base.isClickable,
            isScrollable: base.isScrollable,
            isSelected: base.isSelected,
        },
    };
}

function mockAllResponse(found: boolean, elements: ElementInfo[] = [], listSelector?: string) {
    const elsWithSelector = elements.map((info) => ({
        listSelector: listSelector || '/*',
        info: { ...info },  // client.findAll() 返回 { listSelector, info } 结构
    }));

    return {
        found,
        elements: elsWithSelector,
        total: elements.length,
        error: null as string | null,
    };
}

function createMockClient(findFn: (params: any) => Promise<any>, findAllFn: (params: any) => Promise<any>): HttpClient {
    const mock = {
        find: jest.fn(findFn),
        findAll: jest.fn(findAllFn),
        clickMouse: jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null }),
        moveMouse: jest.fn().mockResolvedValue({ success: true, startPoint: { x: 0, y: 0 }, endPoint: { x: 0, y: 0 }, durationMs: 0, error: null }),
        scrollMouse: jest.fn().mockResolvedValue({ success: true, scrolled: 1, targetFound: true, error: null }),
        typeText: jest.fn().mockResolvedValue({ success: true, charsTyped: 1, durationMs: 0, error: null }),
        startIdleMotion: jest.fn().mockResolvedValue(undefined),
        stopIdleMotion: jest.fn().mockResolvedValue({ success: true, durationMs: 0, error: null }),
        activateWindow: jest.fn().mockResolvedValue({ success: true }),
        focusElement: jest.fn().mockResolvedValue({ success: true }),
        executeKey: jest.fn().mockResolvedValue({ success: true }),
        shortcut: jest.fn().mockResolvedValue({ success: true }),
        listWindows: jest.fn().mockResolvedValue([]),
        health: jest.fn().mockResolvedValue({ status: 'ok', version: '0.1.0', service: 'test' }),
        handleError: jest.fn().mockImplementation((error: unknown, endpoint?: string) => { throw error; }),
    };
    return mock as unknown as HttpClient;
}

function createMockLogger(): OperationLogger {
    return new OperationLogger({ enabled: false, level: 'info' });
}

function createDefaultAutoWait(): AutoWaitConfig {
    return { enabled: false, delays: { afterFind: 0, afterClick: 0, afterType: 0, beforeAction: 0 } };
}

function createTestElement(
    client: HttpClient,
    xpath = '//Button',
    windowSelector = 'Window',
    listSelector = '//Button',
    info?: ElementInfo,
) {
    return new Element(
        client,
        xpath,
        windowSelector,
        listSelector,
        info || makeMockElementInfo(),
        createDefaultAutoWait(),
        createMockLogger(),
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：别名方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('Element aliases', () => {
    test('dblclick() is primary, doubleClick() delegates to dblclick()', async () => {
        const dblClickMock = jest.spyOn(Element.prototype, 'dblclick').mockResolvedValue();
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.doubleClick();
        expect(dblClickMock).toHaveBeenCalled();
    });

    test('text() returns same value as getText()', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.text()).toBe('Test Button');
        expect(await el.text()).toBe(await el.getText());
    });

    test('boundingBox() returns same value as getRect()', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo()),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const rect = await el.boundingBox();
        expect(rect).toEqual(MOCK_RECT);
        expect(rect).toEqual(await el.getRect());
    });

    test('locator() delegates to find()', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ controlType: 'Edit' })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const child = await el.locator('Edit');
        expect(child).toBeInstanceOf(Element);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：导航方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('Element navigation', () => {
    test('parentElement() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, listSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const parent = await el.parentElement();
        expect(parent).toBeNull();
    });

    test('parentElement() returns Element when found', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ controlType: 'Pane' }), '//Pane'),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const parent = await el.parentElement();
        expect(parent).toBeInstanceOf(Element);
        expect(parent!.listSelector).toBe('//Pane');
    });

    test('nextSiblingElement() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, listSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const sibling = await el.nextSiblingElement();
        expect(sibling).toBeNull();
    });

    test('previousSiblingElement() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, listSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const sibling = await el.previousSiblingElement();
        expect(sibling).toBeNull();
    });

    test('childCount() returns correct count', async () => {
        const child1 = makeMockElementInfo({ controlType: 'Text', name: 'Child 1' });
        const child2 = makeMockElementInfo({ controlType: 'Button', name: 'Child 2' });
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(true, [child1, child2]),
        );
        const el = createTestElement(client);
        const count = await el.childCount();
        expect(count).toBe(2);
    });

    test('childCount() returns 0 when no children', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const count = await el.childCount();
        expect(count).toBe(0);
    });

    test('children() returns ElementList with position method', async () => {
        const child1 = makeMockElementInfo({ controlType: 'Text', name: 'Child 1' });

        // findAll returns the list, find for position()
        const client = createMockClient(
            async (params: any) => {
                if (params.element?.includes('[position()=')) {
                    return mockResponse(true, child1, '/*[position()=1]');
                }
                return mockResponse(true);
            },
            async () => mockAllResponse(true, [child1, child1]),
        );
        const el = createTestElement(client);
        const children = await el.children();
        expect(children.length).toBe(2);
        expect(typeof (children as ElementList).position).toBe('function');

        const first = await (children as ElementList).position(1);
        expect(first).toBeInstanceOf(Element);
    });

    test('children(xpath) filters with given xpath', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(true, [makeMockElementInfo({ controlType: 'Button' })]),
        );
        const el = createTestElement(client);
        const children = await el.children('Button');
        expect(children.length).toBe(1);
        // Verify the findAll was called with the filtered xpath
        // listSelector is //Button, children xpath appends /*//Button
        expect(client.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ element: '//Button/*//Button' }),
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：getAttributes 扩展
// ═══════════════════════════════════════════════════════════════════════════════

describe('getAttribute extended', () => {
    let el: Element;

    beforeEach(() => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo()),
            async () => mockAllResponse(false),
        );
        el = createTestElement(client);
    });

    test('getAttribute returns helpText for "desc" and "helptext"', async () => {
        expect(await el.getAttribute('desc')).toBe('Click to test');
        expect(await el.getAttribute('helptext')).toBe('Click to test');
    });

    test('getAttribute returns processId for "processid" and "pid"', async () => {
        expect(await el.getAttribute('processid')).toBe('12345');
        expect(await el.getAttribute('pid')).toBe('12345');
    });

    test('getAttribute returns boolean values as strings', async () => {
        expect(await el.getAttribute('enabled')).toBe('true');
        expect(await el.getAttribute('isenabled')).toBe('true');
        expect(await el.getAttribute('offscreen')).toBe('false');
        expect(await el.getAttribute('password')).toBe('false');
    });

    test('getAttribute returns empty string for unknown attributes', async () => {
        expect(await el.getAttribute('unknownAttr')).toBe('');
    });

    test('getAttribute supports "type" and "id" aliases', async () => {
        expect(await el.getAttribute('type')).toBe('Button');
        expect(await el.getAttribute('id')).toBe('btn-test');
    });

    test('getAttribute supports "class" alias', async () => {
        expect(await el.getAttribute('class')).toBe('Button');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：fill 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('fill', () => {
    test('fill() calls clear() then type()', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const typeSpy = jest.spyOn(el, 'type').mockResolvedValue();
        const clearSpy = jest.spyOn(el, 'clear').mockResolvedValue();

        await el.fill('Hello World');

        expect(clearSpy).toHaveBeenCalled();
        expect(typeSpy).toHaveBeenCalledWith('Hello World', undefined);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：waitFor 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('waitFor', () => {
    test('waitFor() returns element when found immediately', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const result = await el.waitFor({ timeout: 1000 });
        expect(result).toBeInstanceOf(Element);
    });

    test('waitFor() throws on timeout', async () => {
        const client = createMockClient(
            async () => ({ found: false, listSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.waitFor({ timeout: 200, interval: 50 })).rejects.toThrow('did not appear');
    }, 5000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：scrollIntoView 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('scrollIntoView', () => {
    test('scrollIntoView() returns immediately when element is already visible', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isOffscreen: false })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.scrollIntoView('/Window');
        // scrollMouse should not be called since element is already visible
        expect(client.scrollMouse).not.toHaveBeenCalled();
    });

    test('scrollIntoView() scrolls when element is offscreen', async () => {
        let callCount = 0;
        const client = createMockClient(
            async () => {
                callCount++;
                // After 5 calls (detectScrollDirection uses ~3 extra for prev/next), element becomes visible
                if (callCount >= 6) {
                    return mockResponse(true, makeMockElementInfo({ isOffscreen: false }));
                }
                return mockResponse(true, makeMockElementInfo({ isOffscreen: true }));
            },
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.scrollIntoView('/Window');
        expect(client.scrollMouse).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：UIA Pattern 状态方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('UIA Pattern state methods', () => {
    test('isCheckable() returns true when element has TogglePattern', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isCheckable: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isCheckable()).toBe(true);
    });

    test('isCheckable() returns false when element does not have TogglePattern', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isCheckable: false })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isCheckable()).toBe(false);
    });

    test('isChecked() returns toggle state', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isChecked: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isChecked()).toBe(true);
    });

    test('isChecked() returns false when not checked', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isChecked: false })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isChecked()).toBe(false);
    });

    test('isClickable() returns correct value', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isClickable: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isClickable()).toBe(true);
    });

    test('isScrollable() returns correct value', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isScrollable: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isScrollable()).toBe(true);
    });

    test('isSelected() returns selection state', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isSelected: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isSelected()).toBe(true);
    });

    test('Pattern methods return false when element not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, listSelector: '', error: 'not found', element: null }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isCheckable()).toBe(false);
        expect(await el.isChecked()).toBe(false);
        expect(await el.isClickable()).toBe(false);
        expect(await el.isScrollable()).toBe(false);
        expect(await el.isSelected()).toBe(false);
    });

    test('Pattern methods default when fields are undefined', async () => {
        const info = makeMockElementInfo();
        // Explicitly set to undefined to test fallback
        const client = createMockClient(
            async () => mockResponse(true, info),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.isCheckable()).toBe(false);
        expect(await el.isChecked()).toBe(false);
        expect(await el.isClickable()).toBe(true); // isClickable defaults to true
        expect(await el.isScrollable()).toBe(false);
        expect(await el.isSelected()).toBe(false);
    });
});
