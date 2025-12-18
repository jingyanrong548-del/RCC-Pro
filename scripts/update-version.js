// =====================================================================
// update-version.js: 构建时自动更新版本号
// 职责: 在构建时自动递增 PATCH 版本号，方便追溯
// 使用: 在 package.json 的 build 脚本中调用
// =====================================================================

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const versionFile = join(rootDir, 'src/js/version.js');

try {
    // 读取当前版本文件
    let content = readFileSync(versionFile, 'utf-8');
    
    // 提取当前版本号
    const majorMatch = content.match(/major:\s*(\d+)/);
    const minorMatch = content.match(/minor:\s*(\d+)/);
    const patchMatch = content.match(/patch:\s*(\d+)/);
    
    if (!majorMatch || !minorMatch || !patchMatch) {
        console.warn('⚠️  无法解析版本号，跳过自动更新');
        process.exit(0);
    }
    
    const major = parseInt(majorMatch[1]);
    const minor = parseInt(minorMatch[1]);
    const patch = parseInt(patchMatch[1]);
    
    // 自动递增 PATCH 版本号
    const newPatch = patch + 1;
    const newVersion = `${major}.${minor}.${newPatch}`;
    
    // 更新文件内容
    content = content.replace(
        /patch:\s*\d+/,
        `patch: ${newPatch}`
    );
    
    // 写入文件
    writeFileSync(versionFile, content, 'utf-8');
    
    console.log(`✅ 版本号已自动更新: v${major}.${minor}.${patch} → v${newVersion}`);
    console.log(`📦 构建版本: v${newVersion}`);
    
} catch (error) {
    console.error('❌ 更新版本号时出错:', error.message);
    // 不阻止构建，只输出警告
    process.exit(0);
}

