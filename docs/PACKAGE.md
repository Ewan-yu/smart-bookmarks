# Chrome 插件打包指南

## 📦 三种打包格式说明

### 1. 文件夹（开发模式）
```
smart-bookmarks/
├── manifest.json
├── src/
├── icons/
└── ...
```
- **用途**：开发和测试
- **使用方式**：`chrome://extensions/` → 开发者模式 → 加载已解压的扩展目录
- **优点**：实时修改，无需重新打包
- **缺点**：无法发布到商店

### 2. ZIP 文件（发布格式）
```
smart-bookmarks.zip
```
- **用途**：发布到 Chrome Web Store
- **使用方式**：上传到 Chrome Web Store Developer Dashboard
- **优点**：标准格式，商店要求
- **缺点**：用户无法直接安装

### 3. CRX 文件（已弃用）
```
smart-bookmarks.crx
```
- **状态**：❌ Chrome 2022 年已弃用，不再支持
- **历史用途**：用户可以直接安装
- **替代方案**：通过 Chrome Web Store 安装

## 🚀 快速打包

### Windows 用户

**方法 1：PowerShell（推荐）**
```powershell
# 在项目根目录执行
npm run package:ps1
```

**方法 2：Git Bash**
```bash
npm run package:sh
```

**方法 3：Node.js（需要安装依赖）**
```bash
npm install archiver unzipper
npm run package
```

### Linux/macOS 用户

```bash
# 方法 1：使用 shell 脚本（推荐）
npm run package:sh

# 方法 2：使用 Node.js
npm install archiver unzipper
npm run package
```

## 📋 打包步骤详解

### 1. 准备工作
```bash
# 1. 确保代码已提交
git add .
git commit -m "feat: 准备发布版本"

# 2. 构建项目（如果未构建）
npm run build
```

### 2. 运行打包脚本
```bash
# Windows PowerShell
npm run package:ps1

# Windows Git Bash / Linux / macOS
npm run package:sh
```

### 3. 验证打包结果
打包完成后，会在 `dist/` 目录生成 `smart-bookmarks.zip`

**验证文件结构**：
```bash
# 解压查看
unzip -l dist/smart-bookmarks.zip

# 或者解压到临时目录测试
unzip dist/smart-bookmarks.zip -d /tmp/test
```

**应该包含的文件**：
```
smart-bookmarks.zip
├── manifest.json          ← 必需
├── icons/
│   ├── icon16.png        ← 必需
│   ├── icon48.png        ← 必需
│   └── icon128.png       ← 必需
├── src/
│   ├── popup/
│   ├── background/
│   ├── options/
│   └── ...
└── assets/（如果有）
```

**不应包含的文件**：
```
❌ node_modules/
❌ .git/
❌ tests/
❌ *.md
❌ scripts/
❌ package.json
```

## 🧪 测试打包结果

### 1. 本地测试

**解压包文件**：
```bash
# 创建临时目录
mkdir test-package

# 解压
unzip dist/smart-bookmarks.zip -d test-package/

# 在浏览器中加载测试
# chrome://extensions/ → 开发者模式 → 加载已解压的扩展目录
# 选择 test-package 目录
```

**测试检查项**：
- [ ] 插件可以正常加载
- [ ] 所有功能正常工作
- [ ] 图标显示正常
- [ ] 设置页面可以打开
- [ ] 快捷键可以使用

### 2. 文件大小检查

```bash
# 查看 ZIP 文件大小
ls -lh dist/smart-bookmarks.zip

# 或
du -h dist/smart-bookmarks.zip
```

**Chrome Web Store 限制**：
- ✅ 小于 64MB：推荐
- ⚠️ 64-128MB：可接受，但建议优化
- ❌ 大于 128MB：可能会被拒绝

## 📤 上传到 Chrome Web Store

### 1. 准备素材

在打包前，确保以下素材已准备：

**必需素材**：
- [ ] 图标：128x128px（PNG 格式）
- [ ] 小图标：48x48px、16x16px
- [ ] 截图：至少 1 张，最多 5 张（1280x800px 或 640x400px）

**可选素材**：
- [ ] 宣传图：1280x800px（用于商店展示）
- [ ] 详细说明（Markdown 格式）

### 2. 上传步骤

```bash
# 1. 打包
npm run package:ps1    # Windows
npm run package:sh     # Linux/macOS

# 2. 下载 ZIP 文件
# 文件位置: dist/smart-bookmarks.zip

# 3. 访问 Chrome Web Store Developer Dashboard
# https://chrome.google.com/webstore/devconsole

# 4. 点击"新建项目"

# 5. 上传 ZIP 文件

# 6. 填写商店信息
# - 名称
# - 简介描述
# - 详细说明
# - 分类
# - 语言
```

### 3. 填写商店列表信息

**基本信息**：
- **名称**：Smart Bookmarks - 智能收藏夹管理
- **简介**：智能管理浏览器收藏夹，支持AI分类、失效检测、快速搜索（132字符以内）
- **详细说明**：
  ```markdown
  ## 功能特性

  - 🤖 **AI 智能分类**：自动分析并分类书签
  - 🔍 **快速搜索**：支持语义搜索和关键词搜索
  - 🔗 **失效检测**：自动检测失效链接
  - 📁 **智能管理**：去重、合并、批量操作
  - 🎯 **快捷键**：Ctrl+Shift+B 快速打开

  ## 使用场景

  - 适合书签数量较多的用户
  - 需要定期整理失效链接
  - 希望通过 AI 自动分类管理
  ```

**分类**：
- 主要分类：生产力工具
- 次要分类：工具

**语言**：中文（简体）

**隐私权和权限**：
- 说明权限使用：
  - `bookmarks`：读取和管理书签
  - `storage`：存储配置和分类数据
  - `tabs`：采集页面信息
  - `<all_urls>`：检测书签链接有效性

### 4. 提交审核

- 点击"提交审核"
- 等待审核（通常 1-3 个工作日）
- 审核通过后会收到邮件通知

## 🔧 常见问题

### Q1: 打包后文件太大怎么办？

**解决方案**：

1. **检查是否包含了不必要的文件**
   ```bash
   # 查看 ZIP 内容
   unzip -l dist/smart-bookmarks.zip | grep node_modules
   ```

2. **排除大文件**
   - 修改 `scripts/package.sh` 或 `scripts/package.ps1`
   - 添加排除模式

3. **优化图片**
   - 压缩 PNG 图片
   - 使用 TinyPNG 等工具
   - 考虑使用 WebP 格式

### Q2: 打包后插件无法加载？

**检查项**：

1. **manifest.json 是否在根目录**
   ```bash
   unzip -l dist/smart-bookmarks.zip | grep manifest.json
   # 应该显示: manifest.json
   # 而不是: src/manifest.json
   ```

2. **文件路径是否正确**
   - 检查 manifest.json 中的路径引用
   - 确保所有引用的文件都包含在 ZIP 中

3. **图标文件是否存在**
   ```bash
   unzip -l dist/smart-bookmarks.zip | grep icons
   # 应该看到 icons/icon16.png, icon48.png, icon128.png
   ```

### Q3: 如何更新已发布的插件？

```bash
# 1. 修改代码

# 2. 更新版本号
npm run release:patch   # 修订版本（1.0.0 -> 1.0.1）
npm run release:minor   # 次版本（1.0.0 -> 1.1.0）
npm run release:major   # 主版本（1.0.0 -> 2.0.0）

# 3. 重新打包
npm run package:ps1

# 4. 上传新的 ZIP 文件到 Chrome Web Store

# 5. 填写更新说明

# 6. 提交审核
```

### Q4: 能否创建 .crx 文件供用户直接安装？

**答案**：不能直接实现，但可以通过以下方式：

**方案 1：引导用户通过商店安装**
```markdown
## 安装方法

### 方式 1：通过 Chrome Web Store 安装（推荐）
1. 访问 [Chrome Web Store](https://chrome.google.com/webstore/detail/xxx)
2. 点击"添加到 Chrome"

### 方式 2：开发模式安装（仅用于测试）
1. 下载源代码
2. 解压到本地
3. 打开 chrome://extensions/
4. 开启"开发者模式"
5. 点击"加载已解压的扩展"
6. 选择解压后的目录
```

**方案 2：提供未打包的源代码**
- 在 GitHub Releases 中提供源代码 ZIP
- 用户下载后以开发者模式加载

## 📊 版本管理

### 语义化版本号
```
主版本号.次版本号.修订号
例如：1.2.3
```

**版本号规则**：
- **主版本号**：不兼容的 API 变更
- **次版本号**：向下兼容的功能新增
- **修订号**：向下兼容的 Bug 修复

**更新版本号**：
```bash
npm run release:patch   # Bug 修复
npm run release:minor   # 新功能
npm run release:major   # 重大变更
```

## 🎯 发布检查清单

### 打包前
- [ ] 代码已测试，无严重 Bug
- [ ] 版本号已更新
- [ ] manifest.json 信息完整
- [ ] 图标素材齐全
- [ ] 隐私政策已准备（如需要）

### 打包时
- [ ] 构建成功（`npm run build`）
- [ ] 打包成功（`npm run package`）
- [ ] ZIP 文件大小合理（< 64MB）
- [ ] ZIP 包含必需文件
- [ ] ZIP 不包含多余文件

### 打包后
- [ ] 本地测试通过
- [ ] 所有功能正常
- [ ] 图标显示正常
- [ ] 在不同浏览器版本测试

### 发布前
- [ ] 准备商店素材
- [ ] 撰写详细说明
- [ ] 准备截图
- [ ] 填写权限说明

### 发布后
- [ ] 监控审核状态
- [ ] 回应用户评论
- [ ] 修复 Bug 并更新
- [ ] 定期发布新版本

## 📚 参考资源

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Extension Publishing Best Practices](https://developer.chrome.com/docs/webstore/program-policies/)
- [Manifest V3 文档](https://developer.chrome.com/docs/extensions/mv3/)
