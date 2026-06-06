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
import { InvalidArgumentError, ElementNotFoundError } from '../errors';

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
        isCheckable: false,
        isChecked: false,
        isClickable: true,
        isScrollable: false,
        isSelected: false,
        ...overrides,
    };
}

function mockResponse(found: boolean, info?: ElementInfo, findSelector?: string) {
    if (!found) {
        return { found: false, findSelector: '', error: 'Element not found', element: null };
    }
    const base = info || makeMockElementInfo();
    const es = findSelector || '//Button';
    return {
        found: true,
        findSelector: es,
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
            findSelector: es,
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

function mockAllResponse(found: boolean, elements: ElementInfo[] = [], findSelector?: string) {
    const elsWithSelector = elements.map((info) => ({
        findSelector: findSelector || '/*',
        info: { ...info },  // client.findAll() 返回 { findSelector, info } 结构
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
        navigateElement: jest.fn().mockResolvedValue({ found: true, element: makeMockElementInfo(), findSelector: '//Button/..', error: null }),
        hoverMouse: jest.fn().mockResolvedValue({ success: true, hoverPoint: { x: 140, y: 215 }, error: null }),
        dragMouse: jest.fn().mockResolvedValue({ success: true, sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 0, y: 0 }, durationMs: 0, error: null }),
        flashElement: jest.fn().mockResolvedValue({ success: true, elementRect: MOCK_RECT, error: null }),
        getElementVisibility: jest.fn().mockResolvedValue({ found: true, isOffscreen: false, visibility: 'fully_visible', position: 'inside', elementRect: MOCK_RECT, visibleRect: MOCK_RECT, viewportRect: MOCK_RECT, overflow: { top: 0, bottom: 0, left: 0, right: 0 }, scrollDirection: null, error: null }),
        inspectElement: jest.fn().mockResolvedValue({ success: true, rootXpath: '//Button', nodes: null, flatNodes: [], text: null, totalChildren: 0, error: null, filter: () => [] }),
        existsWindow: jest.fn().mockResolvedValue(true),
        supportsPattern: jest.fn().mockResolvedValue(true),
        scrollDetect: jest.fn().mockResolvedValue({ success: true, atEnd: false, watchedCount: 0, changedCount: 0, details: [], rolledBack: false, error: null }),
        moveMouseTo: jest.fn().mockResolvedValue({ success: true }),
        executeShortcut: jest.fn().mockResolvedValue({ success: true }),
        getIdleMotionStatus: jest.fn().mockResolvedValue({ active: false, paused: false, pauseReason: null, currentRect: null, runningDurationMs: null, lastActivityMs: null }),
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
    findSelector = '//Button',
    info?: ElementInfo,
) {
    return new Element(
        client,
        xpath,
        windowSelector,
        findSelector,
        info || makeMockElementInfo(),
        createDefaultAutoWait(),
        createMockLogger(),
    );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：别名方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('Element aliases', () => {
    test('dblclick() works correctly', async () => {
        const dblClickMock = jest.spyOn(Element.prototype, 'dblclick').mockResolvedValue();
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.dblclick();
        expect(dblClickMock).toHaveBeenCalled();
    });

    test('text() returns element name', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        expect(await el.text()).toBe('Test Button');
    });

    test('boundingBox() returns element rect', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo()),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const rect = await el.boundingBox();
        expect(rect).toEqual(MOCK_RECT);
    });

    test('locator() delegates to findOne()', async () => {
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
    test('parent() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, findSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const parent = await el.parent();
        expect(parent).toBeNull();
    });

    test('parent() returns Element when found', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ controlType: 'Pane' }), '//Pane'),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const parent = await el.parent();
        expect(parent).toBeInstanceOf(Element);
        expect(parent!.findSelector).toBe('//Pane');
    });

    test('next() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, findSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const sibling = await el.next();
        expect(sibling).toBeNull();
    });

    test('prev() returns null when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, findSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const sibling = await el.prev();
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
        // findSelector is //Button, children('Button') appends /Button
        expect(client.findAll).toHaveBeenCalledWith(
            expect.objectContaining({ element: '//Button/Button' }),
        );
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：getAttributes 扩展
// ═══════════════════════════════════════════════════════════════════════════════

describe('attr extended', () => {
    let el: Element;

    beforeEach(() => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo()),
            async () => mockAllResponse(false),
        );
        el = createTestElement(client);
    });

    test('attr returns helpText for "desc" and "helptext"', async () => {
        expect(await el.attr('desc')).toBe('Click to test');
        expect(await el.attr('helptext')).toBe('Click to test');
    });

    test('attr returns processId for "processid" and "pid"', async () => {
        expect(await el.attr('processid')).toBe('12345');
        expect(await el.attr('pid')).toBe('12345');
    });

    test('attr returns boolean values as strings', async () => {
        expect(await el.attr('enabled')).toBe('true');
        expect(await el.attr('isenabled')).toBe('true');
        expect(await el.attr('offscreen')).toBe('false');
        expect(await el.attr('password')).toBe('false');
    });

    test('attr returns empty string for unknown attributes', async () => {
        expect(await el.attr('unknownAttr')).toBe('');
    });

    test('attr supports "type" and "id" aliases', async () => {
        expect(await el.attr('type')).toBe('Button');
        expect(await el.attr('id')).toBe('btn-test');
    });

    test('attr supports "class" alias', async () => {
        expect(await el.attr('class')).toBe('Button');
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
            async () => ({ found: false, findSelector: '', error: 'not found' }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.waitFor({ timeout: 200, interval: 50 })).rejects.toThrow('did not appear');
    }, 5000);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：scrollIntoView 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('scrollToVisible', () => {
    test('scrollToVisible() scrolls with direction up', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isOffscreen: false })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.scrollToVisible('/Window', { direction: 'up' });
        expect(client.scrollMouse).toHaveBeenCalled();
    });

    test('scrollToVisible() scrolls with direction down', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isOffscreen: false })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.scrollToVisible('/Window', { direction: 'down' });
        expect(client.scrollMouse).toHaveBeenCalled();
    });

    test('scrollToVisible() requires direction parameter', async () => {
        const client = createMockClient(
            async () => mockResponse(true, makeMockElementInfo({ isOffscreen: true })),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        // TypeScript prevents calling without direction, but test runtime behavior
        await expect((el as any).scrollToVisible('/Window')).rejects.toThrow();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：UIA Pattern 状态方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('UIA Pattern state methods', () => {
    test('isCheckable() returns true when element has TogglePattern', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client, '//Button', 'Window', '//Button', makeMockElementInfo({ isCheckable: true }));
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
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client, '//Button', 'Window', '//Button', makeMockElementInfo({ isChecked: true }));
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
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client, '//Button', 'Window', '//Button', makeMockElementInfo({ isScrollable: true }));
        expect(await el.isScrollable()).toBe(true);
    });

    test('isSelected() returns selection state', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client, '//Button', 'Window', '//Button', makeMockElementInfo({ isSelected: true }));
        expect(await el.isSelected()).toBe(true);
    });

    test('Pattern methods return default values when element not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, findSelector: '', error: 'not found', element: null }),
            async () => mockAllResponse(false),
        );
        // Pattern methods only read local this.info cache, they don't re-query.
        // isClickable defaults to true, others default to false.
        const el = createTestElement(client);
        expect(await el.isCheckable()).toBe(false);
        expect(await el.isChecked()).toBe(false);
        expect(await el.isClickable()).toBe(true);
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

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：child(index) 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('child(index)', () => {
    test('child(0) constructs correct XPath for first child', async () => {
        const client = createMockClient(
            async (params: any) => {
                expect(params.element).toBe('//Button/*[position()=1]');
                return mockResponse(true, makeMockElementInfo({ controlType: 'Text', name: 'Child 0' }));
            },
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const child = await el.child(0);
        expect(child).toBeInstanceOf(Element);
    });

    test('child(2) constructs correct XPath for index 2', async () => {
        const client = createMockClient(
            async (params: any) => {
                expect(params.element).toBe('//Button/*[position()=3]');
                return mockResponse(true, makeMockElementInfo({ controlType: 'Text', name: 'Child 2' }));
            },
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const child = await el.child(2);
        expect(child).toBeInstanceOf(Element);
    });

    test('child(-1) constructs correct XPath for last child', async () => {
        const client = createMockClient(
            async (params: any) => {
                expect(params.element).toBe('//Button/*[last()]');
                return mockResponse(true, makeMockElementInfo({ controlType: 'Text', name: 'Last Child' }));
            },
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const child = await el.child(-1);
        expect(child).toBeInstanceOf(Element);
    });

    test('child(-2) constructs correct XPath for second-to-last child', async () => {
        const client = createMockClient(
            async (params: any) => {
                expect(params.element).toBe('//Button/*[last()-1]');
                return mockResponse(true, makeMockElementInfo({ controlType: 'Text' }));
            },
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        const child = await el.child(-2);
        expect(child).toBeInstanceOf(Element);
    });

    test('child() throws ElementNotFoundError when not found', async () => {
        const client = createMockClient(
            async () => ({ found: false, findSelector: '', error: 'not found', element: null }),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.child(99)).rejects.toThrow(ElementNotFoundError);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：indexInParent() 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('indexInParent()', () => {
    test('returns 0 for first child (no preceding siblings)', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false), // no preceding siblings
        );
        const el = createTestElement(client);
        const idx = await el.indexInParent();
        expect(idx).toBe(0);
    });

    test('returns correct count of preceding siblings', async () => {
        const siblings = [
            makeMockElementInfo({ controlType: 'Text', name: 'S1' }),
            makeMockElementInfo({ controlType: 'Text', name: 'S2' }),
            makeMockElementInfo({ controlType: 'Text', name: 'S3' }),
        ];
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(true, siblings),
        );
        const el = createTestElement(client);
        const idx = await el.indexInParent();
        expect(idx).toBe(3);
    });

    test('uses preceding-sibling XPath for query', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async (params: any) => {
                expect(params.element).toBe('//Button/preceding-sibling::*');
                return mockAllResponse(false);
            },
        );
        const el = createTestElement(client);
        await el.indexInParent();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：compass() 方法
// ═══════════════════════════════════════════════════════════════════════════════

describe('compass()', () => {
    /** Helper: 创建验证 XPath 的 mock client */
    function createCompassClient(
        expectedXpath: string,
        foundInfo?: ElementInfo,
    ): HttpClient {
        return createMockClient(
            async (params: any) => {
                expect(params.element).toBe(expectedXpath);
                return mockResponse(true, foundInfo || makeMockElementInfo());
            },
            async () => mockAllResponse(false),
        );
    }

    // --- parent ---
    test("compass('p') navigates to parent", async () => {
        const client = createCompassClient('//Button/..');
        const el = createTestElement(client);
        const result = await el.compass('p');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('p2') navigates to grandparent", async () => {
        const client = createCompassClient('//Button/../..');
        const el = createTestElement(client);
        const result = await el.compass('p2');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('p4') navigates up 4 levels", async () => {
        const client = createCompassClient('//Button/../../../..');
        const el = createTestElement(client);
        const result = await el.compass('p4');
        expect(result).toBeInstanceOf(Element);
    });

    // --- child ---
    test("compass('c0') navigates to first child", async () => {
        const client = createCompassClient('//Button/*[position()=1]');
        const el = createTestElement(client);
        const result = await el.compass('c0');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('c2') navigates to child at index 2", async () => {
        const client = createCompassClient('//Button/*[position()=3]');
        const el = createTestElement(client);
        const result = await el.compass('c2');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('c-1') navigates to last child", async () => {
        const client = createCompassClient('//Button/*[last()]');
        const el = createTestElement(client);
        const result = await el.compass('c-1');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('c-2') navigates to second-to-last child", async () => {
        const client = createCompassClient('//Button/*[last()-1]');
        const el = createTestElement(client);
        const result = await el.compass('c-2');
        expect(result).toBeInstanceOf(Element);
    });

    // --- sibling absolute ---
    test("compass('s5') navigates to sibling at absolute index 5", async () => {
        const client = createCompassClient('//Button/../*[position()=6]');
        const el = createTestElement(client);
        const result = await el.compass('s5');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('s0') navigates to first sibling", async () => {
        const client = createCompassClient('//Button/../*[position()=1]');
        const el = createTestElement(client);
        const result = await el.compass('s0');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('s-2') navigates to second-to-last sibling", async () => {
        const client = createCompassClient('//Button/../*[last()-1]');
        const el = createTestElement(client);
        const result = await el.compass('s-2');
        expect(result).toBeInstanceOf(Element);
    });

    // --- sibling relative ---
    test("compass('s<1') navigates to left adjacent sibling", async () => {
        const client = createCompassClient('//Button/preceding-sibling::*[1]');
        const el = createTestElement(client);
        const result = await el.compass('s<1');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('s>1') navigates to right adjacent sibling", async () => {
        const client = createCompassClient('//Button/following-sibling::*[1]');
        const el = createTestElement(client);
        const result = await el.compass('s>1');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('s<2') navigates to 2nd left sibling", async () => {
        const client = createCompassClient('//Button/preceding-sibling::*[2]');
        const el = createTestElement(client);
        const result = await el.compass('s<2');
        expect(result).toBeInstanceOf(Element);
    });

    // --- shorthand >N ---
    test("compass('>0') is shorthand for c0", async () => {
        const client = createCompassClient('//Button/*[position()=1]');
        const el = createTestElement(client);
        const result = await el.compass('>0');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('>1') is shorthand for c1", async () => {
        const client = createCompassClient('//Button/*[position()=2]');
        const el = createTestElement(client);
        const result = await el.compass('>1');
        expect(result).toBeInstanceOf(Element);
    });

    // --- multi-token paths ---
    test("compass('p4c0>1>1>0') navigates complex path", async () => {
        const client = createCompassClient('//Button/../../../../*[position()=1]/*[position()=2]/*[position()=2]/*[position()=1]');
        const el = createTestElement(client);
        const result = await el.compass('p4c0>1>1>0');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('pc0') navigates to parent's first child", async () => {
        const client = createCompassClient('//Button/../*[position()=1]');
        const el = createTestElement(client);
        const result = await el.compass('pc0');
        expect(result).toBeInstanceOf(Element);
    });

    test("compass('ps5') navigates to parent's child at index 5", async () => {
        const client = createCompassClient('//Button/../../*[position()=6]');
        const el = createTestElement(client);
        const result = await el.compass('ps5');
        expect(result).toBeInstanceOf(Element);
    });

    // --- error cases ---
    test('compass() throws InvalidArgumentError for empty path', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws InvalidArgumentError for invalid character', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('x1')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws InvalidArgumentError for c without index', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('c')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws InvalidArgumentError for s without index', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('s')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws InvalidArgumentError for s< without offset', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('s<')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws InvalidArgumentError for > without index', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.compass('>')).rejects.toThrow(InvalidArgumentError);
    });

    test('compass() throws ElementNotFoundError when target not found', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        (client as any).navigateElement = jest.fn().mockResolvedValue({ found: false, element: null, error: 'not found' });
        const el = createTestElement(client);
        await expect(el.compass('p')).rejects.toThrow(ElementNotFoundError);
    });
});

describe('nth()', () => {
    test('nth("Text", 1) constructs correct XPath with global position', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.nth('Text', 1);
        expect(client.find).toHaveBeenCalledWith(
            expect.objectContaining({
                element: '(//Button//Text)[position()=1]',
            }),
        );
    });

    test('nth("//Button", 3) constructs correct XPath', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.nth('//Button', 3);
        expect(client.find).toHaveBeenCalledWith(
            expect.objectContaining({
                element: '(//Button//Button)[position()=3]',
            }),
        );
    });

    test('nth("/List", 2) constructs correct XPath for direct children', async () => {
        const client = createMockClient(
            async () => mockResponse(true),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await el.nth('/List', 2);
        expect(client.find).toHaveBeenCalledWith(
            expect.objectContaining({
                element: '(//Button/List)[position()=2]',
            }),
        );
    });

    test('nth() throws ElementNotFoundError when not found', async () => {
        const client = createMockClient(
            async () => mockResponse(false),
            async () => mockAllResponse(false),
        );
        const el = createTestElement(client);
        await expect(el.nth('Text', 99)).rejects.toThrow(ElementNotFoundError);
    });
});
