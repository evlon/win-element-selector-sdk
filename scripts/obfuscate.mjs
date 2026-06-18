// scripts/obfuscate.mjs
// 发布前混淆 dist 下所有 .js 文件（排除 .d.ts/.map/test）
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import JavaScriptObfuscator from 'javascript-obfuscator';

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
console.log(`[obfuscate] processing ${files.length} js files...`);

const opts = {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.5,
    deadCodeInjection: false,
    debugProtection: false,
    identifierNamesGenerator: 'hexadecimal',
    renameGlobals: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ['base64'],
    stringArrayThreshold: 0.75,
    transformObjectKeys: true,
    unicodeEscapeSequence: false,
};

for (const file of files) {
    const code = readFileSync(file, 'utf8');
    const result = JavaScriptObfuscator.obfuscate(code, {
        ...opts,
        inputFileName: file,
    });
    writeFileSync(file, result.getObfuscatedCode());
    const kb = Math.round(result.getObfuscatedCode().length / 1024 * 10) / 10;
    console.log(`  ${file.replace(distDir, '.')} → ${kb}KB`);
}

console.log('[obfuscate] done.');
