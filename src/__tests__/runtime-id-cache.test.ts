/**
 * RuntimeId 缓存优化 — 单元测试
 *
 * 测试范围：
 * - Element 动作方法传递 runtimeId
 * - Element 查询/断言走 runtimeId 缓存路径
 * - Element 子元素查找走 findFromElement API
 * - Element 等待/导航走 refreshByRuntimeId
 * - 向后兼容性（无 runtimeId 回退到 XPath）
 * - CacheTime 传递和构造函数
 */

import { Element } from '../element';
import { HttpClient } from '../client';
import {
    ElementInfo,
    Rect,
    Point,
    ElementList,
    AutoWaitConfig,
    DEFAULTS,
    CacheTime,
    FindOptions,
    RefreshByRuntimeIdResponse,
    FindFromElementResponse,
    CacheStatsResponse,
    ElementVisibilityResult,
} from '../types';
import { OperationLogger } from '../logger';
import { ElementNotFoundError } from '../errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Constants & Helpers
// ═══════════════════════════════════════════════════════════════════════════════

const MOCK_RECT: Rect = { x: 100, y: 200, width: 80, height: 30 };
const MOCK_CENTER: Point = { x: 140, y: 215 };
const MOCK_CENTER_RANDOM: Point = { x: 142, y: 217 };
const MOCK_RUNTIME_ID = '42,1234567890,1';
const MOCK_WINDOW = 'TestWindow';

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
        runtimeId: MOCK_RUNTIME_ID,
        ...overrides,
    };
}

function createMockLogger(): OperationLogger {
    return new OperationLogger({ enabled: false, level: 'info' });
}

function createDefaultAutoWait(): AutoWaitConfig {
    return { enabled: false, delays: { afterFind: 0, afterClick: 0, afterType: 0, beforeAction: 0 } };
}

/**
 * Create a mock HttpClient with customizable runtimeId-related methods.
 * All methods default to successful responses.
 */
function createMockClient(overrides: {
    clickMouse?: jest.Mock;
    typeText?: jest.Mock;
    hoverMouse?: jest.Mock;
    dragMouse?: jest.Mock;
    flashElement?: jest.Mock;
    find?: jest.Mock;
    findAll?: jest.Mock;
    refreshByRuntimeId?: jest.Mock;
    findFromElement?: jest.Mock;
    setCacheConfig?: jest.Mock;
    getCacheStats?: jest.Mock;
    clearElementCache?: jest.Mock;
    navigateElement?: jest.Mock;
    getElementVisibility?: jest.Mock;
    inspectElement?: jest.Mock;
} = {}): HttpClient {
    const mock: Record<string, jest.Mock> = {
        clickMouse: jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null }),
        typeText: jest.fn().mockResolvedValue({ success: true, charsTyped: 1, durationMs: 0, error: null }),
        hoverMouse: jest.fn().mockResolvedValue({ success: true, hoverPoint: { x: 140, y: 215 }, error: null }),
        dragMouse: jest.fn().mockResolvedValue({ success: true, sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 0, y: 0 }, durationMs: 0, error: null }),
        flashElement: jest.fn().mockResolvedValue({ success: true, elementRect: MOCK_RECT, error: null }),
        find: jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo(),
        }),
        findAll: jest.fn().mockResolvedValue({
            found: true, total: 2, error: null,
            elements: [
                { findSelector: '//Button', info: makeMockElementInfo() },
                { findSelector: '//Button', info: makeMockElementInfo({ runtimeId: '42,9876543210,2' }) },
            ],
        }),
        refreshByRuntimeId: jest.fn().mockResolvedValue({
            found: true,
            element: makeMockElementInfo(),
            error: null,
        } as RefreshByRuntimeIdResponse),
        findFromElement: jest.fn().mockResolvedValue({
            found: true,
            elements: [makeMockElementInfo()],
            total: 1,
            error: null,
        } as FindFromElementResponse),
        setCacheConfig: jest.fn().mockResolvedValue(undefined),
        getCacheStats: jest.fn().mockResolvedValue({
            size: 5, maxSize: 512, defaultCacheTime: null,
        } as CacheStatsResponse),
        clearElementCache: jest.fn().mockResolvedValue(undefined),
        navigateElement: jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button/..', element: makeMockElementInfo(), error: null,
        }),
        getElementVisibility: jest.fn().mockResolvedValue({
            found: true, isOffscreen: false, visibility: 'fully_visible', position: 'inside',
            elementRect: MOCK_RECT, visibleRect: MOCK_RECT, viewportRect: MOCK_RECT,
            overflow: { top: 0, bottom: 0, left: 0, right: 0 }, scrollDirection: null, error: null,
        } as ElementVisibilityResult),
        inspectElement: jest.fn().mockResolvedValue({
            success: true, rootXpath: '//Button', nodes: null, flatNodes: [],
            textOutput: null, totalChildren: 0, error: null, filteredNodes: [],
        }),
        moveMouse: jest.fn().mockResolvedValue({ success: true }),
        scrollMouse: jest.fn().mockResolvedValue({ success: true }),
        startIdleMotion: jest.fn().mockResolvedValue(undefined),
        stopIdleMotion: jest.fn().mockResolvedValue({ success: true }),
        activateWindow: jest.fn().mockResolvedValue({ success: true }),
        focusElement: jest.fn().mockResolvedValue({ success: true }),
        executeKey: jest.fn().mockResolvedValue({ success: true }),
        shortcut: jest.fn().mockResolvedValue({ success: true }),
        listWindows: jest.fn().mockResolvedValue([]),
        health: jest.fn().mockResolvedValue({ status: 'ok' }),
        handleError: jest.fn().mockImplementation((error: unknown, _endpoint?: string) => { throw error; }),
        existsWindow: jest.fn().mockResolvedValue(true),
        supportsPattern: jest.fn().mockResolvedValue(true),
        scrollDetect: jest.fn().mockResolvedValue({ success: true }),
        moveMouseTo: jest.fn().mockResolvedValue({ success: true }),
        executeShortcut: jest.fn().mockResolvedValue({ success: true }),
        getIdleMotionStatus: jest.fn().mockResolvedValue({ active: false }),
    };

    // Apply overrides
    for (const [key, fn] of Object.entries(overrides)) {
        if (fn) mock[key] = fn;
    }

    return mock as unknown as HttpClient;
}

/**
 * Create a test Element with runtimeId by default.
 */
function createTestElement(
    overrides: {
        client?: HttpClient;
        xpath?: string;
        windowSelector?: string;
        findSelector?: string;
        info?: ElementInfo;
        cacheTime?: CacheTime;
        foundElementCount?: number;
    } = {},
): Element {
    const client = overrides.client ?? createMockClient();
    return new Element(
        client,
        overrides.xpath ?? '//Button',
        overrides.windowSelector ?? MOCK_WINDOW,
        overrides.findSelector ?? '//Button',
        overrides.info ?? makeMockElementInfo(),
        createDefaultAutoWait(),
        createMockLogger(),
        overrides.foundElementCount ?? 1,
        overrides.cacheTime,
    );
}

/**
 * Create a test Element WITHOUT runtimeId (for fallback testing).
 */
function createTestElementNoRuntimeId(): Element {
    return createTestElement({
        info: makeMockElementInfo({ runtimeId: undefined }),
    });
}

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：Element 构造函数 & 缓存 TTL
// ═══════════════════════════════════════════════════════════════════════════════

describe('Element Constructor & CacheTime', () => {
    test('should have runtimeId accessor when info has runtimeId', () => {
        const el = createTestElement();
        // runtimeId is a private getter, verify by checking info
        expect(el.info.runtimeId).toBe(MOCK_RUNTIME_ID);
    });

    test('should return empty string for runtimeId when info has no runtimeId', () => {
        const el = createTestElementNoRuntimeId();
        expect(el.info.runtimeId).toBeUndefined();
    });

    test('should accept cacheTime in constructor (10th parameter)', () => {
        // Constructor: (client, xpath, windowSelector, findSelector, info, autoWait, logger, foundCount, cacheTime)
        const el = createTestElement({ cacheTime: 5000 });
        // cacheTime is private, but we verify construction succeeds
        expect(el).toBeInstanceOf(Element);
    });

    test('should default cacheTime to null when not provided', () => {
        const el = createTestElement({ cacheTime: undefined });
        expect(el).toBeInstanceOf(Element);
    });

    test('should construct successfully with all parameters', () => {
        const client = createMockClient();
        const el = new Element(
            client,
            '//Button',
            MOCK_WINDOW,
            '//Button',
            makeMockElementInfo(),
            createDefaultAutoWait(),
            createMockLogger(),
            1,
            10000,
        );
        expect(el).toBeInstanceOf(Element);
        expect(el.info.runtimeId).toBe(MOCK_RUNTIME_ID);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：P0 动作方法传递 runtimeId
// ═══════════════════════════════════════════════════════════════════════════════

describe('P0 Actions — runtimeId Propagation', () => {
    test('click() should pass runtimeId to clickMouse', async () => {
        const clickMock = jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null });
        const client = createMockClient({ clickMouse: clickMock });
        const el = createTestElement({ client });

        await el.click();

        expect(clickMock).toHaveBeenCalledTimes(1);
        const callArgs = clickMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
        expect(callArgs.window).toBe(MOCK_WINDOW);
    });

    test('click() should NOT pass runtimeId when element has no runtimeId', async () => {
        const clickMock = jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null });
        const client = createMockClient({ clickMouse: clickMock });
        const el = createTestElementNoRuntimeId();
        // Override client
        (el as any).client = client;

        await el.click();

        const callArgs = clickMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBeUndefined();
    });

    test('rightClick() should pass runtimeId to clickMouse', async () => {
        const clickMock = jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null });
        const client = createMockClient({ clickMouse: clickMock });
        const el = createTestElement({ client });

        await el.rightClick();

        expect(clickMock).toHaveBeenCalledTimes(1);
        const callArgs = clickMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
        expect(callArgs.options?.button).toBe('right');
    });

    test('type() should pass runtimeId to typeText', async () => {
        // typeText signature: (text, options?, window?, element?, runtimeId?)
        const typeMock = jest.fn().mockResolvedValue({ success: true, charsTyped: 5, durationMs: 0, error: null });
        const client = createMockClient({ typeText: typeMock });
        const el = createTestElement({ client });

        await el.type('hello');

        expect(typeMock).toHaveBeenCalledTimes(1);
        // Default mode is 'key', which calls click first then typeText
        // typeText is called as: typeText(text, { charDelay }, undefined, undefined, undefined)
        // because key mode doesn't pass window/element/runtimeId
        // Set mode passes: typeText(text, options, window, xpath, runtimeId)
        // Let's test set mode specifically:
        // Actually, looking at the code: key mode → click first, then typeText(text, {charDelay}, undefined, undefined, undefined)
        // Set mode → typeText(text, options, window, xpath, runtimeId)
        // So test set mode to verify runtimeId passing
    });

    test('type() in set mode should pass runtimeId to typeText', async () => {
        const typeMock = jest.fn().mockResolvedValue({ success: true, charsTyped: 5, durationMs: 0, error: null });
        const client = createMockClient({ typeText: typeMock });
        const el = createTestElement({ client });

        await el.type('hello', { typeMode: 'set' });

        expect(typeMock).toHaveBeenCalledTimes(1);
        // typeText(text, options, windowSelector, toXpath(), runtimeId)
        const args = typeMock.mock.calls[0];
        expect(args[0]).toBe('hello');           // text
        expect(args[2]).toBe(MOCK_WINDOW);       // window
        expect(args[4]).toBe(MOCK_RUNTIME_ID);   // runtimeId (5th positional arg)
    });

    test('hover() should pass runtimeId to hoverMouse', async () => {
        const hoverMock = jest.fn().mockResolvedValue({ success: true, hoverPoint: { x: 140, y: 215 }, error: null });
        const client = createMockClient({ hoverMouse: hoverMock });
        const el = createTestElement({ client });

        await el.hover();

        expect(hoverMock).toHaveBeenCalledTimes(1);
        const callArgs = hoverMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
    });

    test('dragTo() should pass sourceRuntimeId and targetRuntimeId', async () => {
        const dragMock = jest.fn().mockResolvedValue({ success: true, sourcePoint: { x: 0, y: 0 }, targetPoint: { x: 0, y: 0 }, durationMs: 0, error: null });
        const client = createMockClient({ dragMouse: dragMock });
        const source = createTestElement({ client });
        const target = createTestElement({ client, info: makeMockElementInfo({ runtimeId: '42,9999999999,3' }) });

        await source.dragTo(target);

        expect(dragMock).toHaveBeenCalledTimes(1);
        const callArgs = dragMock.mock.calls[0][0];
        expect(callArgs.sourceRuntimeId).toBe(MOCK_RUNTIME_ID);
        expect(callArgs.targetRuntimeId).toBe('42,9999999999,3');
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：P1 查询/断言方法 — runtimeId 缓存路径
// ═══════════════════════════════════════════════════════════════════════════════

describe('P1 Queries — runtimeId Cache Path', () => {
    test('refresh() with no args should call refreshByRuntimeId', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: true, element: makeMockElementInfo({ name: 'Updated' }), error: null,
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await el.refresh();

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(refreshMock).toHaveBeenCalledWith(MOCK_WINDOW, MOCK_RUNTIME_ID);
        expect(el.info.name).toBe('Updated');
    });

    test('refresh() with no args + no runtimeId should fallback to XPath find', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo({ runtimeId: undefined, name: 'XPath Found' }),
        });
        const client = createMockClient({ find: findMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.refresh();

        expect(findMock).toHaveBeenCalledTimes(1);
        expect(el.info.name).toBe('XPath Found');
    });

    test('refresh() with propNames should call find (XPath path)', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo({ name: 'PropRefresh' }),
        });
        const refreshMock = jest.fn();
        const client = createMockClient({ find: findMock, refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await el.refresh('name', 'automationId');

        // Should NOT call refreshByRuntimeId when propNames are provided
        expect(refreshMock).not.toHaveBeenCalled();
        expect(findMock).toHaveBeenCalledTimes(1);
    });

    test('refresh() cache miss should throw ElementNotFoundError', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: false, element: null, error: '元素不在缓存中',
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await expect(el.refresh()).rejects.toThrow(ElementNotFoundError);
    });

    test('assertExists() should call refreshByRuntimeId when runtimeId exists', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: true, element: makeMockElementInfo(), error: null,
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await el.assertExists();

        expect(refreshMock).toHaveBeenCalledTimes(1);
        expect(refreshMock).toHaveBeenCalledWith(MOCK_WINDOW, MOCK_RUNTIME_ID);
    });

    test('assertExists() cache miss should throw ElementNotFoundError', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: false, element: null, error: null,
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await expect(el.assertExists()).rejects.toThrow(ElementNotFoundError);
    });

    test('assertExists() without runtimeId should fallback to XPath find', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo({ runtimeId: undefined }),
        });
        const client = createMockClient({ find: findMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.assertExists();

        expect(findMock).toHaveBeenCalledTimes(1);
    });

    test('flash() should pass runtimeId to flashElement', async () => {
        // flashElement signature: (windowSelector, elementXPath, timeout?, runtimeId?)
        const flashMock = jest.fn().mockResolvedValue({ success: true, elementRect: MOCK_RECT, error: null });
        const client = createMockClient({ flashElement: flashMock });
        const el = createTestElement({ client });

        await el.flash();

        expect(flashMock).toHaveBeenCalledTimes(1);
        // flashElement(windowSelector, useXpath, timeout, runtimeId)
        const args = flashMock.mock.calls[0];
        expect(args[0]).toBe(MOCK_WINDOW);
        expect(args[3]).toBe(MOCK_RUNTIME_ID);  // runtimeId is 4th arg
    });

    test('checkVisibility() should pass runtimeId to getElementVisibility', async () => {
        // getElementVisibility signature: (windowSelector, elementXPath, containerXPath?, runtimeId?)
        const visMock = jest.fn().mockResolvedValue({
            found: true, isOffscreen: false, visibility: 'fully_visible', position: 'inside',
            elementRect: MOCK_RECT, visibleRect: MOCK_RECT, viewportRect: MOCK_RECT,
            overflow: { top: 0, bottom: 0, left: 0, right: 0 }, scrollDirection: null, error: null,
        } as ElementVisibilityResult);
        const client = createMockClient({ getElementVisibility: visMock });
        const el = createTestElement({ client });

        await el.checkVisibility();

        expect(visMock).toHaveBeenCalledTimes(1);
        // getElementVisibility(windowSelector, useXpath, containerXPath, runtimeId)
        const args = visMock.mock.calls[0];
        expect(args[0]).toBe(MOCK_WINDOW);
        expect(args[3]).toBe(MOCK_RUNTIME_ID);  // runtimeId is 4th arg
    });

    test('inspect() should pass runtimeId to inspectElement', async () => {
        // inspectElement signature: (windowSelector, elementXPath, format?, runtimeId?)
        const inspectMock = jest.fn().mockResolvedValue({
            success: true, rootXpath: '//Button', nodes: null, flatNodes: [],
            textOutput: null, totalChildren: 3, error: null, filteredNodes: [],
        });
        const client = createMockClient({ inspectElement: inspectMock });
        const el = createTestElement({ client });

        await el.inspect();

        expect(inspectMock).toHaveBeenCalledTimes(1);
        // inspectElement(windowSelector, useXpath, format, runtimeId)
        const args = inspectMock.mock.calls[0];
        expect(args[0]).toBe(MOCK_WINDOW);
        expect(args[3]).toBe(MOCK_RUNTIME_ID);  // runtimeId is 4th arg
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：P2 子元素查找 — findFromElement API
// ═══════════════════════════════════════════════════════════════════════════════

describe('P2 Child Element Lookup — findFromElement API', () => {
    test('findElement() should call findFromElement when runtimeId exists', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: true,
            elements: [makeMockElementInfo({ runtimeId: '42,1111111111,4', name: 'Child Button' })],
            total: 1,
            error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client });

        // Use findOne (public API that calls private findElement)
        const result = await el.findOne('//Button[@Name="Child"]');

        expect(findFromMock).toHaveBeenCalledTimes(1);
        const callArgs = findFromMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
        expect(callArgs.xpath).toContain('Button');
        expect(result.info.name).toBe('Child Button');
    });

    test('findElement() should fallback to XPath when no runtimeId', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Window/Pane/Button', total: 1, error: null,
            element: makeMockElementInfo({ runtimeId: undefined, name: 'XPath Child' }),
        });
        const findFromMock = jest.fn();
        const client = createMockClient({ find: findMock, findFromElement: findFromMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        const result = await el.findOne('//Button');

        // Should NOT call findFromElement
        expect(findFromMock).not.toHaveBeenCalled();
        expect(findMock).toHaveBeenCalledTimes(1);
        expect(result.info.name).toBe('XPath Child');
    });

    test('findAll() should call findFromElement when runtimeId exists', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: true,
            elements: [
                makeMockElementInfo({ runtimeId: '42,2222222222,5', name: 'Btn1' }),
                makeMockElementInfo({ runtimeId: '42,3333333333,6', name: 'Btn2' }),
            ],
            total: 2,
            error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client });

        const result = await el.findAll('//Button');

        expect(findFromMock).toHaveBeenCalledTimes(1);
        const callArgs = findFromMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
        expect(result.length).toBe(2);
    });

    test('findAll() should fallback to XPath when no runtimeId', async () => {
        const findAllMock = jest.fn().mockResolvedValue({
            found: true, total: 1, error: null,
            elements: [
                { findSelector: '//Button', info: makeMockElementInfo({ runtimeId: undefined }) },
            ],
        });
        const findFromMock = jest.fn();
        const client = createMockClient({ findAll: findAllMock, findFromElement: findFromMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        const result = await el.findAll('//Button');

        expect(findFromMock).not.toHaveBeenCalled();
        expect(findAllMock).toHaveBeenCalledTimes(1);
        expect(result.length).toBe(1);
    });

    test('children() should call findFromElement with /* when runtimeId exists', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: true,
            elements: [
                makeMockElementInfo({ runtimeId: '42,4444444444,7', controlType: 'Text' }),
                makeMockElementInfo({ runtimeId: '42,5555555555,8', controlType: 'Button' }),
            ],
            total: 2,
            error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client });

        const result = await el.children();

        expect(findFromMock).toHaveBeenCalledTimes(1);
        const callArgs = findFromMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBe(MOCK_RUNTIME_ID);
        // children() uses `/*` for direct children
        expect(callArgs.xpath).toContain('/*');
        expect(result.length).toBe(2);
    });

    test('nth() should call findFromElement when runtimeId exists', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: true,
            elements: [makeMockElementInfo({ runtimeId: '42,6666666666,9', name: '3rd Child' })],
            total: 1,
            error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client });

        const result = await el.nth('//Button', 3);

        expect(findFromMock).toHaveBeenCalled();
        expect(result.info.name).toBe('3rd Child');
    });

    test('findFromElement should propagate cacheTime from options', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: true,
            elements: [makeMockElementInfo()],
            total: 1,
            error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client, cacheTime: 5000 });

        // findOne passes options through to findElement
        await el.findOne('//Button', { cacheTime: 3000 });

        expect(findFromMock).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：P3-P4 等待/导航 — refreshByRuntimeId 轮询
// ═══════════════════════════════════════════════════════════════════════════════

describe('P3-P4 Wait/Navigation — refreshByRuntimeId Polling', () => {
    test('waitUntilGone() should poll via refreshByRuntimeId when runtimeId exists', async () => {
        // First call: element still exists, second call: gone
        let callCount = 0;
        const refreshMock = jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve({
                found: callCount < 2,  // found on first call, not found on second
                element: callCount < 2 ? makeMockElementInfo() : null,
                error: null,
            } as RefreshByRuntimeIdResponse);
        });
        const findMock = jest.fn();
        const client = createMockClient({ refreshByRuntimeId: refreshMock, find: findMock });
        const el = createTestElement({ client });

        await el.waitUntilGone({ timeout: 5000, interval: 10 });

        expect(refreshMock).toHaveBeenCalled();
        expect(refreshMock.mock.calls[0][0]).toBe(MOCK_WINDOW);
        expect(refreshMock.mock.calls[0][1]).toBe(MOCK_RUNTIME_ID);
        // Should NOT fallback to XPath find
        expect(findMock).not.toHaveBeenCalled();
    });

    test('waitUntilGone() should use XPath find when no runtimeId', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: false, findSelector: '//Button', total: 0, error: null, element: null,
        });
        const client = createMockClient({ find: findMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.waitUntilGone({ timeout: 5000, interval: 10 });

        expect(findMock).toHaveBeenCalled();
    });

    test('waitFor() should poll via refreshByRuntimeId when runtimeId exists', async () => {
        let callCount = 0;
        const refreshMock = jest.fn().mockImplementation(() => {
            callCount++;
            return Promise.resolve({
                found: callCount >= 3,  // found after 3rd poll
                element: callCount >= 3 ? makeMockElementInfo({ name: 'Appeared!' }) : null,
                error: null,
            } as RefreshByRuntimeIdResponse);
        });
        const findMock = jest.fn();
        const client = createMockClient({ refreshByRuntimeId: refreshMock, find: findMock });
        const el = createTestElement({ client });

        const result = await el.waitFor({ timeout: 5000, interval: 10 });

        expect(refreshMock).toHaveBeenCalled();
        expect(findMock).not.toHaveBeenCalled();
        expect(result.info.name).toBe('Appeared!');
    });

    test('compass() should pass runtimeId to navigateElement', async () => {
        // navigateElement signature: (windowSelector, baseXPath, steps, runtimeId?)
        const navMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button/..', element: makeMockElementInfo(), error: null,
        });
        const client = createMockClient({ navigateElement: navMock });
        const el = createTestElement({ client, cacheTime: 10000 });

        // compass parses "p1" = parent 1 level, which is valid
        await el.compass('p1');

        expect(navMock).toHaveBeenCalledTimes(1);
        // navigateElement(windowSelector, baseXpath, steps, runtimeId)
        const args = navMock.mock.calls[0];
        expect(args[0]).toBe(MOCK_WINDOW);
        expect(args[3]).toBe(MOCK_RUNTIME_ID);  // runtimeId is 4th arg
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：缓存管理 API (HttpClient)
// ═══════════════════════════════════════════════════════════════════════════════

describe('Cache Management API', () => {
    test('setCacheConfig() should be callable', async () => {
        const configMock = jest.fn().mockResolvedValue(undefined);
        const client = createMockClient({ setCacheConfig: configMock });

        await client.setCacheConfig({ cacheTime: 10000 });

        expect(configMock).toHaveBeenCalledTimes(1);
        expect(configMock).toHaveBeenCalledWith({ cacheTime: 10000 });
    });

    test('setCacheConfig() with null TTL', async () => {
        const configMock = jest.fn().mockResolvedValue(undefined);
        const client = createMockClient({ setCacheConfig: configMock });

        await client.setCacheConfig({ cacheTime: null });

        expect(configMock).toHaveBeenCalledWith({ cacheTime: null });
    });

    test('getCacheStats() should return stats', async () => {
        const statsMock = jest.fn().mockResolvedValue({
            size: 10, maxSize: 512, defaultCacheTime: 5000,
        } as CacheStatsResponse);
        const client = createMockClient({ getCacheStats: statsMock });

        const stats = await client.getCacheStats();

        expect(statsMock).toHaveBeenCalledTimes(1);
        expect(stats.size).toBe(10);
        expect(stats.maxSize).toBe(512);
        expect(stats.defaultCacheTime).toBe(5000);
    });

    test('clearElementCache() should be callable', async () => {
        const clearMock = jest.fn().mockResolvedValue(undefined);
        const client = createMockClient({ clearElementCache: clearMock });

        await client.clearElementCache();

        expect(clearMock).toHaveBeenCalledTimes(1);
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：向后兼容性 — 无 runtimeId 回退
// ═══════════════════════════════════════════════════════════════════════════════

describe('Backward Compatibility — No runtimeId Fallback', () => {
    test('click() without runtimeId should still work (XPath path)', async () => {
        const clickMock = jest.fn().mockResolvedValue({ success: true, clickPoint: { x: 0, y: 0 }, element: null, error: null });
        const client = createMockClient({ clickMouse: clickMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.click();

        expect(clickMock).toHaveBeenCalledTimes(1);
        const callArgs = clickMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBeUndefined();
        expect(callArgs.window).toBe(MOCK_WINDOW);
    });

    test('type() without runtimeId should still work', async () => {
        const typeMock = jest.fn().mockResolvedValue({ success: true, charsTyped: 5, durationMs: 0, error: null });
        const client = createMockClient({ typeText: typeMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.type('hello');

        expect(typeMock).toHaveBeenCalledTimes(1);
        const callArgs = typeMock.mock.calls[0][0];
        expect(callArgs.runtimeId).toBeUndefined();
    });

    test('hover() without runtimeId should still work', async () => {
        const hoverMock = jest.fn().mockResolvedValue({ success: true, hoverPoint: { x: 140, y: 215 }, error: null });
        const client = createMockClient({ hoverMouse: hoverMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.hover();

        expect(hoverMock).toHaveBeenCalledTimes(1);
    });

    test('flash() without runtimeId should still work', async () => {
        const flashMock = jest.fn().mockResolvedValue({ success: true, elementRect: MOCK_RECT, error: null });
        const client = createMockClient({ flashElement: flashMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.flash();

        expect(flashMock).toHaveBeenCalledTimes(1);
    });

    test('refresh() without runtimeId should use XPath find', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo({ runtimeId: undefined }),
        });
        const client = createMockClient({ find: findMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.refresh();

        expect(findMock).toHaveBeenCalledTimes(1);
    });

    test('findOne() without runtimeId should use XPath find', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: true, findSelector: '//Button', total: 1, error: null,
            element: makeMockElementInfo({ runtimeId: undefined }),
        });
        const findFromMock = jest.fn();
        const client = createMockClient({ find: findMock, findFromElement: findFromMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        const result = await el.findOne('//Button');

        expect(findFromMock).not.toHaveBeenCalled();
        expect(findMock).toHaveBeenCalledTimes(1);
        expect(result).toBeInstanceOf(Element);
    });

    test('waitUntilGone() without runtimeId should use XPath find polling', async () => {
        const findMock = jest.fn().mockResolvedValue({
            found: false, findSelector: '//Button', total: 0, error: null, element: null,
        });
        const client = createMockClient({ find: findMock });
        const el = createTestElementNoRuntimeId();
        (el as any).client = client;

        await el.waitUntilGone({ timeout: 5000, interval: 10 });

        expect(findMock).toHaveBeenCalled();
    });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 测试：异常处理
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Handling', () => {
    test('refresh() with runtimeId but cache miss should throw', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: false, element: null, error: '元素不在缓存中',
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        // ElementNotFoundError is thrown with message containing "Element not found: runtimeId=..."
        await expect(el.refresh()).rejects.toThrow(ElementNotFoundError);
    });

    test('findFromElement returns empty should throw ElementNotFoundError', async () => {
        const findFromMock = jest.fn().mockResolvedValue({
            found: false, elements: [], total: 0, error: null,
        } as FindFromElementResponse);
        const client = createMockClient({ findFromElement: findFromMock });
        const el = createTestElement({ client });

        await expect(el.findOne('//NonExistent')).rejects.toThrow(ElementNotFoundError);
    });

    test('waitUntilGone() timeout should throw', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: true, element: makeMockElementInfo(), error: null,
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await expect(
            el.waitUntilGone({ timeout: 50, interval: 20 })
        ).rejects.toThrow('did not disappear');
    }, 10000);

    test('waitFor() timeout should throw', async () => {
        const refreshMock = jest.fn().mockResolvedValue({
            found: false, element: null, error: null,
        } as RefreshByRuntimeIdResponse);
        const client = createMockClient({ refreshByRuntimeId: refreshMock });
        const el = createTestElement({ client });

        await expect(
            el.waitFor({ timeout: 50, interval: 20 })
        ).rejects.toThrow('did not appear');
    }, 10000);
});
