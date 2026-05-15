/**
 * 编码测试脚本
 */

import { buildWindowSelector } from '../src/utils';

console.log('=== 编码测试 ===\n');

// 测试1: 直接输出中文
console.log('1. 直接输出中文:');
console.log('   元宝:', '元宝');
console.log('   新建对话:', '新建对话');
console.log();

// 测试2: buildWindowSelector
console.log('2. buildWindowSelector 输出:');
const selector = buildWindowSelector({
    title: '元宝',
    className: 'Tauri Window',
    processName: 'yuanbao'
});
console.log('   结果:', selector);
console.log('   UTF-8 字节:', Buffer.from(selector, 'utf-8'));
console.log();

// 测试3: encodeURIComponent
console.log('3. encodeURIComponent 测试:');
const encoded = encodeURIComponent(selector);
console.log('   编码后:', encoded);
console.log('   解码后:', decodeURIComponent(encoded));
console.log();

// 测试4: JSON.stringify
console.log('4. JSON.stringify 测试:');
const json = JSON.stringify({ selector });
console.log('   JSON:', json);
console.log('   解析后:', JSON.parse(json));
console.log();
