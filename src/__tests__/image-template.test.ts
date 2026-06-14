/**
 * resolveTemplate 单元测试
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { resolveTemplate } from '../image-template';

describe('resolveTemplate', () => {
    test('resolves base64 string as-is', async () => {
        const b64 = Buffer.from('PNG-MOCK').toString('base64');
        await expect(resolveTemplate(b64)).resolves.toBe(b64);
    });

    test('resolves Buffer to base64', async () => {
        const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        await expect(resolveTemplate(buf)).resolves.toBe(buf.toString('base64'));
    });

    test('resolves file path (Windows-style backslash)', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tmpl-'));
        const file = path.join(tmpDir, 'a.png');
        const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        await fs.writeFile(file, data);

        const result = await resolveTemplate(file);
        expect(result).toBe(data.toString('base64'));

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('resolves file path (forward slash)', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tmpl-'));
        const file = path.join(tmpDir, 'b.png').replace(/\\/g, '/');
        const data = Buffer.from([1, 2, 3]);
        await fs.writeFile(file, data);

        const result = await resolveTemplate(file);
        expect(result).toBe(data.toString('base64'));

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('throws on garbage string', async () => {
        await expect(resolveTemplate('not a path & not base64!!')).rejects.toThrow();
    });

    test('throws on missing file', async () => {
        await expect(resolveTemplate('./does-not-exist.png')).rejects.toThrow();
    });
});
