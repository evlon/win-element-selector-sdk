import * as os from 'os';
import { resolveTemplatePath, shouldUseImageAcceleration } from '../image-acceleration';

test('resolveTemplatePath uses temp dir by default', () => {
    const result = resolveTemplatePath('//Button[@Name="发送"]');
    expect(result).toContain(os.tmpdir());
    expect(result).toContain('element-selector-cache');
    expect(result).toMatch(/\.png$/);
});

test('resolveTemplatePath uses custom dir', () => {
    const result = resolveTemplatePath('//Button', '/tmp/templates', undefined);
    expect(result).toContain('templates');
    expect(result.endsWith('.png')).toBe(true);
});

test('resolveTemplatePath uses custom name', () => {
    const result = resolveTemplatePath('//Button', undefined, 'my-btn');
    expect(result.endsWith('my-btn.png')).toBe(true);
});

test('resolveTemplatePath generates consistent hash', () => {
    const r1 = resolveTemplatePath('//Button');
    const r2 = resolveTemplatePath('//Button');
    expect(r1).toBe(r2);
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
