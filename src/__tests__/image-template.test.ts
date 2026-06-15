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
        const result = await resolveTemplate(b64);
        expect(result.base64).toBe(b64);
        expect(result.meta).toBeNull();
    });

    test('resolves Buffer to base64', async () => {
        const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
        const result = await resolveTemplate(buf);
        expect(result.base64).toBe(buf.toString('base64'));
        expect(result.meta).toBeNull();
    });

    test('resolves file path with meta', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tmpl-'));
        const file = path.join(tmpDir, 'a.png');
        const data = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
        await fs.writeFile(file, data);

        const result = await resolveTemplate(file);
        expect(result.base64).toBe(data.toString('base64'));
        expect(result.meta).toBeNull(); // 无 .meta.json 文件

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('resolves file path and loads meta.json', async () => {
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tmpl-'));
        const file = path.join(tmpDir, 'b.png');
        const data = Buffer.from([1, 2, 3]);
        await fs.writeFile(file, data);

        // 写 meta.json
        const meta = { version: 1, dpi: 192, screenWidth: 3840, screenHeight: 2400, templateWidth: 50, templateHeight: 30 };
        await fs.writeFile(`${file}.meta.json`, JSON.stringify(meta));

        const result = await resolveTemplate(file);
        expect(result.base64).toBe(data.toString('base64'));
        expect(result.meta).not.toBeNull();
        expect(result.meta!.dpi).toBe(192);

        await fs.rm(tmpDir, { recursive: true, force: true });
    });

    test('throws on garbage string', async () => {
        await expect(resolveTemplate('not a path & not base64!!')).rejects.toThrow();
    });

    test('throws on missing file', async () => {
        await expect(resolveTemplate('./does-not-exist.png')).rejects.toThrow();
    });
});
