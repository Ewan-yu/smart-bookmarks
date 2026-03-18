#!/usr/bin/env node

/**
 * Smart Bookmarks 打包脚本
 *
 * 功能：
 * - 构建项目
 * - 打包成 ZIP 文件
 * - 验证打包结果
 *
 * 使用方法:
 * node scripts/package.js
 */

const fs = require('fs').promises;
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'dist');
const PACKAGE_NAME = 'smart-bookmarks.zip';

// 需要打包的文件和目录
const INCLUDE_PATTERNS = [
  'manifest.json',
  'icons/**/*',
  'src/**/*',
  'assets/**/*',
  'LICENSE',
];

// 排除的文件和目录
const EXCLUDE_PATTERNS = [
  'node_modules',
  '.git',
  '.github',
  'docs',
  'scripts',
  '*.md',
  '.env*',
  '.gitignore',
  'package.json',
  'package-lock.json',
  'tailwind.config.js',
  'clear_data.js',
];

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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

// 检查文件是否应该被排除
function shouldExclude(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 检查排除模式
  for (const pattern of EXCLUDE_PATTERNS) {
    const regex = new RegExp('^' + pattern.replace('*', '.*'));
    if (regex.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

// 检查文件是否应该被包含
function shouldInclude(filePath) {
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 先检查是否排除
  if (shouldExclude(normalizedPath)) {
    return false;
  }

  // 检查包含模式
  for (const pattern of INCLUDE_PATTERNS) {
    const regex = new RegExp('^' + pattern.replace('*', '.*'));
    if (regex.test(normalizedPath)) {
      return true;
    }
  }

  return false;
}

// 递归获取所有需要打包的文件
async function getFilesToPackage(dir, baseDir = dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (entry.isDirectory()) {
      const subFiles = await getFilesToPackage(fullPath, baseDir);
      files.push(...subFiles);
    } else if (entry.isFile() && shouldInclude(relativePath)) {
      files.push({
        source: fullPath,
        target: relativePath.replace(/\\/g, '/'),
      });
    }
  }

  return files;
}

// 打包成 ZIP
async function createPackage(files, outputPath) {
  return new Promise((resolve, reject) => {
    const output = require('fs').createWriteStream(outputPath);
    const archive = archiver('zip', {
      zlib: { level: 9 }, // 最高压缩级别
    });

    output.on('close', () => {
      logSuccess(`打包完成: ${outputPath} (${(archive.pointer() / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    });

    archive.on('error', (err) => {
      logError(`打包失败: ${err.message}`);
      reject(err);
    });

    archive.pipe(output);

    // 添加文件到 ZIP
    files.forEach((file) => {
      archive.file(file.source, { name: file.target });
    });

    archive.finalize();
  });
}

// 验证打包结果
async function validatePackage(packagePath) {
  logStep(4, '验证打包结果');

  const stats = await fs.stat(packagePath);
  const sizeMB = stats.size / 1024 / 1024;

  logSuccess(`文件大小: ${sizeMB.toFixed(2)} MB`);

  // Chrome Web Store 限制
  if (sizeMB > 128) {
    logError('⚠️  警告：包大小超过 128MB，Chrome Web Store 可能拒绝上传');
  } else if (sizeMB > 64) {
    log('⚠️  提示：包大小超过 64MB，建议优化', 'yellow');
  } else {
    logSuccess('包大小符合 Chrome Web Store 要求');
  }

  // 检查必需文件
  log('\n检查必需文件:');
  const requiredFiles = ['manifest.json', 'icons/icon128.png'];
  const unzipper = require('unzipper');

  const directory = await fs.createReadStream(packagePath).pipe(unzipper.Extract({ path: OUTPUT_DIR + '/temp' })).promise();

  for (const file of requiredFiles) {
    try {
      await fs.access(path.join(OUTPUT_DIR, 'temp', file));
      logSuccess(`  ✓ ${file}`);
    } catch {
      logError(`  ✗ ${file} (缺失)`);
    }
  }

  // 清理临时文件
  await fs.rm(path.join(OUTPUT_DIR, 'temp'), { recursive: true, force: true });
}

// 主函数
async function main() {
  try {
    log('🚀 Smart Bookmarks 打包脚本\n', 'cyan');

    // 步骤 1: 构建项目
    logStep(1, '构建项目');
    try {
      execSync('npm run build', { cwd: PROJECT_ROOT, stdio: 'inherit' });
      logSuccess('构建完成');
    } catch (error) {
      logError('构建失败');
      process.exit(1);
    }

    // 步骤 2: 创建输出目录
    logStep(2, '创建输出目录');
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    logSuccess(`输出目录: ${OUTPUT_DIR}`);

    // 步骤 3: 收集文件
    logStep(3, '收集文件');
    const files = await getFilesToPackage(PROJECT_ROOT, PROJECT_ROOT);
    logSuccess(`找到 ${files.length} 个文件`);

    // 显示部分文件列表
    console.log('\n部分文件列表:');
    files.slice(0, 10).forEach((file) => {
      console.log(`  - ${file.target}`);
    });
    if (files.length > 10) {
      console.log(`  ... 还有 ${files.length - 10} 个文件`);
    }

    // 步骤 4: 打包
    const packagePath = path.join(OUTPUT_DIR, PACKAGE_NAME);
    log('\n正在打包...');
    await createPackage(files, packagePath);

    // 步骤 5: 验证
    await validatePackage(packagePath);

    log('\n✅ 打包完成！', 'green');
    log(`📦 包文件: ${packagePath}`, 'cyan');
    log(`\n下一步:`, 'yellow');
    log(`1. 在浏览器中测试加载（解压后）`);
    log(`2. 上传到 Chrome Web Store Developer Dashboard`);
    log(`3. 填写商店信息并提交审核`);

  } catch (error) {
    logError(`打包失败: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// 运行
main();
