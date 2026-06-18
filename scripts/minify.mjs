// scripts/minify.mjs
// 发布前压缩 dist 下所有 .js 文件（terser minify，不混淆，最小化体积）
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { minify } from 'terser';

const distDir = join(process.cwd(), 'dist');

function walkJs(dir) {
    const results = [];
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            results.push(...walkJs(full));
        } else if (entry.endsWith('.js') && !entry.includes('.test.')) {
            results.push(full);
        }
    }
    return results;
}

const files = walkJs(distDir);
console.log(`[minify] processing ${files.length} js files...`);

let totalBefore = 0;
let totalAfter = 0;

for (const file of files) {
    const code = readFileSync(file, 'utf8');
    const before = code.length;
    const result = await minify(code, {
        compress: {
            dead_code: true,
            drop_console: false,
            keep_fargs: true,
            passes: 2,
        },
        mangle: false,       // 不混淆标识符，保留可读性
        format: {
            comments: false,
        },
    });
    if (result.code) {
        writeFileSync(file, result.code);
        const after = result.code.length;
        totalBefore += before;
        totalAfter += after;
        const kb = Math.round(after / 1024 * 10) / 10;
        const ratio = Math.round((1 - after / before) * 100);
        console.log(`  ${file.replace(distDir, '.')} → ${kb}KB (-${ratio}%)`);
    }
}

const totalKbBefore = Math.round(totalBefore / 1024 * 10) / 10;
const totalKbAfter = Math.round(totalAfter / 1024 * 10) / 10;
const totalRatio = Math.round((1 - totalAfter / totalBefore) * 100);
console.log(`[minify] total: ${totalKbBefore}KB → ${totalKbAfter}KB (-${totalRatio}%)`);
