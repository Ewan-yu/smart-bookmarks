#!/usr/bin/env node

/**
 * Smart Bookmarks 发布准备脚本
 *
 * 功能:
 * - 自动更新版本号
 * - 生成构建产物
 * - 运行测试（如果存在）
 * - 生成发布包
 * - 创建 Git 标签
 * - 生成发布说明
 *
 * 使用方法:
 * node scripts/release-prepare.js [version] [options]
 *
 * 参数:
 * version - 新版本号（如 2.0.0），不提供则自动递增
 *
 * 选项:
 * --major - 主版本号升级（不兼容的 API 变更）
 * --minor - 次版本号升级（功能新增）
 * --patch - 修订号升级（Bug 修复）
 * --dry-run - 模拟运行，不修改文件
 * --skip-build - 跳过构建步骤
 * --skip-tests - 跳过测试步骤
 * --no-tag - 不创建 Git 标签
 * --help - 显示帮助信息
 *
 * 示例:
 * node scripts/release-prepare.js 2.0.0
 * node scripts/release-prepare.js --minor
 * node scripts/release-prepare.js --patch --dry-run
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '..');

// 需要更新版本号的文件
const VERSION_FILES = [
  'manifest.json',
  'package.json',
];

// 发布包排除的文件和目录
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.gitignore',
  'scripts',
  'docs',
  '*.md',
  '.env*',
  '.*',
  'tests',
  'test',
];

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
  log(`\n${step}. ${message}`, 'cyan');
}

function logSuccess(message) {
  log(`✓ ${message}`, 'green');
}

function logError(message) {
  log(`✗ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠ ${message}`, 'yellow');
}

// 读取 JSON 文件
async function readJSON(filePath) {
  const content = await fs.readFile(path.join(PROJECT_ROOT, filePath), 'utf8');
  return JSON.parse(content);
}

// 写入 JSON 文件
async function writeJSON(filePath, data) {
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(path.join(PROJECT_ROOT, filePath), content + '\n', 'utf8');
}

// 获取当前版本号
async function getCurrentVersion() {
  const manifest = await readJSON('manifest.json');
  return manifest.version;
}

// 解析版本号
function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) {
    throw new Error(`无效的版本号: ${version}`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
    build: match[5] || null,
  };
}

// 构建版本号
function buildVersion(version) {
  let v = `${version.major}.${version.minor}.${version.patch}`;
  if (version.prerelease) {
    v += `-${version.prerelease}`;
  }
  if (version.build) {
    v += `+${version.build}`;
  }
  return v;
}

// 递增版本号
function incrementVersion(version, type) {
  const newVersion = { ...version };

  switch (type) {
    case 'major':
      newVersion.major++;
      newVersion.minor = 0;
      newVersion.patch = 0;
      newVersion.prerelease = null;
      break;
    case 'minor':
      newVersion.minor++;
      newVersion.patch = 0;
      newVersion.prerelease = null;
      break;
    case 'patch':
      newVersion.patch++;
      newVersion.prerelease = null;
      break;
    default:
      throw new Error(`无效的递增类型: ${type}`);
  }

  return newVersion;
}

// 确认操作
async function confirm(message) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/N): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
}

// 更新版本号
async function updateVersion(newVersion, dryRun = false) {
  logStep('1', '更新版本号');

  for (const file of VERSION_FILES) {
    try {
      const data = await readJSON(file);
      const oldVersion = data.version;

      if (dryRun) {
        log(`  [模拟] ${file}: ${oldVersion} → ${newVersion}`, 'yellow');
      } else {
        data.version = newVersion;
        await writeJSON(file, data);
        logSuccess(`${file}: ${oldVersion} → ${newVersion}`);
      }
    } catch (error) {
      logError(`更新 ${file} 失败: ${error.message}`);
    }
  }
}

// 运行构建
async function runBuild(skip = false) {
  if (skip) {
    logStep('2', '构建（已跳过）');
    return;
  }

  logStep('2', '运行构建');

  try {
    log('  运行 npm run build...', 'blue');
    execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    logSuccess('构建完成');
  } catch (error) {
    logError('构建失败');
    throw error;
  }
}

// 运行测试
async function runTests(skip = false) {
  if (skip) {
    logStep('3', '测试（已跳过）');
    return;
  }

  logStep('3', '运行测试');

  // 检查是否有测试脚本
  const packageJson = await readJSON('package.json');
  if (!packageJson.scripts.test) {
    logWarning('未配置测试脚本，跳过测试');
    return;
  }

  try {
    log('  运行 npm test...', 'blue');
    execSync('npm test', { cwd: PROJECT_ROOT, stdio: 'inherit' });
    logSuccess('测试通过');
  } catch (error) {
    logError('测试失败');
    throw error;
  }
}

// 创建发布包
async function createRelease(version) {
  logStep('4', '创建发布包');

  const packageName = `smart-bookmarks-v${version}.zip`;
  const packagePath = path.join(PROJECT_ROOT, 'dist', packageName);

  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(packagePath), { recursive: true });

    // 使用 PowerShell 创建 ZIP（Windows）
    if (process.platform === 'win32') {
      const tempDir = path.join(PROJECT_ROOT, 'dist', 'temp');
      await fs.mkdir(tempDir, { recursive: true });

      // 复制文件到临时目录
      const excludeArgs = EXCLUDE_PATTERNS.map(p => `-Exclude${p}`).join(' ');
      execSync(
        `Copy-Item -Path "${PROJECT_ROOT}\\*" -Destination "${tempDir}" -Recurse -Force ${excludeArgs}`,
        { shell: 'powershell.exe', stdio: 'inherit' }
      );

      // 创建 ZIP
      execSync(
        `Compress-Archive -Path "${tempDir}\\*" -DestinationPath "${packagePath}" -Force`,
        { shell: 'powershell.exe', stdio: 'inherit' }
      );

      // 清理临时目录
      await fs.rm(tempDir, { recursive: true, force: true });
    } else {
      // 使用 zip 命令（Linux/Mac）
      const excludeArgs = EXCLUDE_PATTERNS.map(p => `--exclude '${p}'`).join(' ');
      execSync(
        `cd "${PROJECT_ROOT}" && zip -r "${packagePath}" . ${excludeArgs}`,
        { stdio: 'inherit' }
      );
    }

    logSuccess(`发布包创建成功: ${packageName}`);
    return packagePath;
  } catch (error) {
    logError(`创建发布包失败: ${error.message}`);
    throw error;
  }
}

// 创建 Git 标签
async function createGitTag(version, dryRun = false) {
  logStep('5', '创建 Git 标签');

  const tagName = `v${version}`;

  try {
    if (dryRun) {
      log(`  [模拟] 创建标签: ${tagName}`, 'yellow');
      return;
    }

    // 检查标签是否已存在
    try {
      execSync(`git tag -l "${tagName}"`, { cwd: PROJECT_ROOT, encoding: 'utf8' });
      logWarning(`标签 ${tagName} 已存在，将删除并重新创建`);
      execSync(`git tag -d "${tagName}"`, { cwd: PROJECT_ROOT });
    } catch {
      // 标签不存在，继续
    }

    // 创建标签
    execSync(`git tag -a "${tagName}" -m "Release ${tagName}"`, { cwd: PROJECT_ROOT });
    logSuccess(`标签创建成功: ${tagName}`);
  } catch (error) {
    logError(`创建 Git 标签失败: ${error.message}`);
    throw error;
  }
}

// 生成发布说明
async function generateReleaseNotes(version) {
  logStep('6', '生成发布说明');

  const notesPath = path.join(PROJECT_ROOT, 'dist', `RELEASE_NOTES_v${version}.md`);

  try {
    const currentVersion = await getCurrentVersion();
    const date = new Date().toLocaleDateString('zh-CN');

    const notes = `# Smart Bookmarks v${version} 发布说明

**发布日期**: ${date}
**版本变更**: v${currentVersion} → v${version}

## 重要提示

请在发布前完成以下检查:
- [ ] 在 Chrome 和 Edge 上完整测试
- [ ] 确认所有 P0 和 P1 级别 Bug 已修复
- [ ] 更新商店素材（图标、截图、描述）
- [ ] 准备隐私政策和用户协议
- [ ] 完成 \`docs/RELEASE_CHECKLIST.md\` 中的所有检查项

## 变更内容

详见 \`CHANGELOG.md\`

## 发布包

- 文件名: \`smart-bookmarks-v${version}.zip\`
- 大小: (待确认)
- SHA256: (待确认)

## 商店发布

### Chrome Web Store
- 上传地址: https://chrome.google.com/webstore/devconsole
- 分类: 生产力工具
- 语言: 中文（简体）

### Edge Add-ons
- 上传地址: https://partner.microsoft.com/dashboard/microsoftedge/extension
- 分类: 生产力工具
- 语言: 中文（简体）

## 发布后

- [ ] 创建 GitHub Release
- [ ] 发布公告
- [ ] 监控用户反馈
- [ ] 收集改进建议

---

*此文件由发布脚本自动生成，请根据实际情况修改*
`;

    await fs.writeFile(notesPath, notes, 'utf8');
    logSuccess(`发布说明已生成: ${notesPath}`);
    return notesPath;
  } catch (error) {
    logError(`生成发布说明失败: ${error.message}`);
    throw error;
  }
}

// 主函数
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const skipBuild = args.includes('--skip-build');
  const skipTests = args.includes('--skip-tests');
  const noTag = args.includes('--no-tag');

  // 显示帮助
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Smart Bookmarks 发布准备脚本

使用方法:
  node scripts/release-prepare.js [version] [options]

参数:
  version    新版本号（如 2.0.0），不提供则根据选项自动递增

选项:
  --major    主版本号升级（不兼容的 API 变更）
  --minor    次版本号升级（功能新增）
  --patch    修订号升级（Bug 修复）
  --dry-run  模拟运行，不修改文件
  --skip-build    跳过构建步骤
  --skip-tests    跳过测试步骤
  --no-tag   不创建 Git 标签
  --help     显示此帮助信息

示例:
  node scripts/release-prepare.js 2.0.0
  node scripts/release-prepare.js --minor
  node scripts/release-prepare.js --patch --dry-run
`);
    return;
  }

  try {
    log('\n🚀 Smart Bookmarks 发布准备脚本\n', 'magenta');

    // 获取当前版本
    const currentVersion = await getCurrentVersion();
    log(`当前版本: ${currentVersion}\n`, 'blue');

    // 确定新版本号
    let newVersion;
    if (args.length > 0 && !args[0].startsWith('--')) {
      // 使用提供的版本号
      newVersion = args[0];
    } else {
      // 根据选项自动递增
      let incrementType = null;
      if (args.includes('--major')) incrementType = 'major';
      else if (args.includes('--minor')) incrementType = 'minor';
      else if (args.includes('--patch')) incrementType = 'patch';
      else {
        logError('请提供版本号或指定递增类型（--major/--minor/--patch）');
        process.exit(1);
      }

      const version = parseVersion(currentVersion);
      const incremented = incrementVersion(version, incrementType);
      newVersion = buildVersion(incremented);
    }

    // 验证新版本号
    parseVersion(newVersion); // 如果无效会抛出错误

    log(`新版本: ${newVersion}\n`, 'green');

    if (dryRun) {
      logWarning('模拟运行模式，不会修改任何文件\n');
    }

    // 确认发布
    const confirmed = await confirm(`确认发布版本 ${newVersion}?`);
    if (!confirmed) {
      log('发布已取消', 'yellow');
      return;
    }

    // 执行发布流程
    await updateVersion(newVersion, dryRun);
    await runBuild(skipBuild);
    await runTests(skipTests);
    const packagePath = await createRelease(newVersion);
    if (!noTag) {
      await createGitTag(newVersion, dryRun);
    }
    const notesPath = await generateReleaseNotes(newVersion);

    // 完成
    log('\n✅ 发布准备完成！\n', 'green');
    log('下一步操作:', 'cyan');
    log(`  1. 检查发布包: ${packagePath}`, 'blue');
    log(`  2. 检查发布说明: ${notesPath}`, 'blue');
    log(`  3. 提交代码: git add . && git commit -m "chore: release v${newVersion}"`, 'blue');
    if (!noTag) {
      log(`  4. 推送标签: git push origin v${newVersion}`, 'blue');
    }
    log(`  5. 上传到商店: 使用 ${packagePath}`, 'blue');
    log(`  6. 创建 GitHub Release\n`, 'blue');

  } catch (error) {
    logError(`\n发布准备失败: ${error.message}`);
    process.exit(1);
  }
}

// 运行主函数
main().catch((error) => {
  logError(`未处理的错误: ${error.message}`);
  console.error(error);
  process.exit(1);
});
