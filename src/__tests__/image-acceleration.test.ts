import { resolveTemplatePath, shouldUseImageAcceleration } from '../image-acceleration';

test('resolveTemplatePath generates path from xpath', () => {
    const result = resolveTemplatePath('//Button[@Name="发送"]', undefined, undefined);
    expect(result).toMatch(/images\/.*\.png$/);
});

test('resolveTemplatePath uses custom dir', () => {
    const result = resolveTemplatePath('//Button', '/tmp/templates', undefined);
    expect(result).toMatch(/^\/tmp\/templates\//);
});

test('resolveTemplatePath uses custom name', () => {
    const result = resolveTemplatePath('//Button', undefined, 'my-btn');
    expect(result).toMatch(/my-btn\.png$/);
});

test('shouldUseImageAcceleration respects mode', () => {
    expect(shouldUseImageAcceleration('first', { enabled: true })).toBe(true);
    expect(shouldUseImageAcceleration('one', { enabled: true })).toBe(true);
    expect(shouldUseImageAcceleration('all', { enabled: true })).toBe(false);
});

test('shouldUseImageAcceleration disabled', () => {
    expect(shouldUseImageAcceleration('first', { enabled: false })).toBe(false);
    expect(shouldUseImageAcceleration('first', undefined)).toBe(false);
});
