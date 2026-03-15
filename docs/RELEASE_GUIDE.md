# Smart Bookmarks 发布指南

本文档说明如何使用发布准备脚本和相关工具来发布 Smart Bookmarks 浏览器扩展。

---

## 前置准备

### 1. 环境要求

- Node.js 16+
- npm 或 yarn
- Git
- Chrome/Edge 浏览器（用于测试）

### 2. 安装依赖

```bash
npm install
```

### 3. 检查清单

在发布前，请确保完成以下检查：

- [ ] 阅读 `docs/RELEASE_CHECKLIST.md` 中的所有检查项
- [ ] 完成 `docs/TODO.md` 中的所有 P0 和 P1 级别任务
- [ ] 在 Chrome 和 Edge 上进行完整测试
- [ ] 准备好商店素材（图标、截图、描述）
- [ ] 更新 `CHANGELOG.md`

---

## 发布流程

### 阶段 1: 准备发布

#### 1.1 运行发布准备脚本

```bash
# 指定新版本号（推荐）
node scripts/release-prepare.js 2.0.0

# 或者自动递增版本号
node scripts/release-prepare.js --major  # 主版本号升级
node scripts/release-prepare.js --minor  # 次版本号升级
node scripts/release-prepare.js --patch  # 修订号升级
```

脚本会自动完成以下操作：

1. 更新 `manifest.json` 和 `package.json` 中的版本号
2. 运行 `npm run build` 构建 CSS
3. 运行测试（如果配置）
4. 创建发布包（ZIP 文件）
5. 创建 Git 标签
6. 生成发布说明模板

#### 1.2 模拟运行（可选）

如果不确定，可以先模拟运行：

```bash
node scripts/release-prepare.js 2.0.0 --dry-run
```

#### 1.3 跳过某些步骤

如果需要跳过某些步骤：

```bash
# 跳过构建
node scripts/release-prepare.js 2.0.0 --skip-build

# 跳过测试
node scripts/release-prepare.js 2.0.0 --skip-tests

# 不创建 Git 标签
node scripts/release-prepare.js 2.0.0 --no-tag
```

### 阶段 2: 验证发布包

#### 2.1 检查发布包

发布包位于 `dist/` 目录：

```
dist/
  ├── smart-bookmarks-v2.0.0.zip    # 发布包
  └── RELEASE_NOTES_v2.0.0.md       # 发布说明模板
```

#### 2.2 本地测试

1. 解压发布包
2. 在浏览器中加载解压后的扩展
3. 完整测试所有功能

### 阶段 3: 提交代码

```bash
# 添加所有更改
git add .

# 提交
git commit -m "chore: release v2.0.0"

# 推送代码
git push origin main

# 推送标签
git push origin v2.0.0
```

### 阶段 4: 发布到商店

#### 4.1 Chrome Web Store

1. 访问 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. 点击"新建项目"
3. 上传 ZIP 文件
4. 填写商店信息：
   - 名称: Smart Bookmarks - 智能收藏夹管理
   - 简短描述: 智能管理浏览器收藏夹，支持AI分类、失效检测、快速搜索
   - 详细描述: 使用 `docs/RELEASE_NOTES_v2.0.0.md` 中的内容
   - 分类: 生产力工具
   - 语言: 中文（简体）
5. 上传素材：
   - 图标: 128x128 PNG
   - 宣传图片: 1280x800 或 640x400 PNG
   - 截图: 最多 5 张，1280x800 或 640x400 PNG
6. 隐私政策: 根据实际情况填写
7. 提交审核

#### 4.2 Edge Add-ons

1. 访问 [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/extension)
2. 点击"新建扩展"
3. 上传 ZIP 文件
4. 填写商店信息（同 Chrome）
5. 提交审核

### 阶段 5: 创建 GitHub Release

1. 访问项目的 GitHub Releases 页面
2. 点击"Draft a new release"
3. 填写信息：
   - Tag: 选择刚推送的标签（如 `v2.0.0`）
   - Title: `v2.0.0 - 智能收藏夹管理`
   - Description: 复制 `CHANGELOG.md` 中对应版本的内容
4. 上传 ZIP 文件作为附件
5. 点击"Publish release"

### 阶段 6: 公告发布

在以下渠道发布公告：

- 项目 README 更新
- 社交媒体（如适用）
- 技术博客（如适用）

---

## 发布后监控

### 1. 用户反馈

- 监控 Chrome Web Store 评论
- 监控 Edge Add-ons 评论
- 监控 GitHub Issues
- 监控社交媒体反馈

### 2. 错误监控

- 检查控制台错误报告
- 分析用户反馈的问题
- 准备紧急修复版本

### 3. 使用统计

- 关注安装量
- 关注用户评分
- 关注活跃用户数

---

## 紧急修复流程

如果发现严重问题需要紧急修复：

### 1. 快速修复

```bash
# 创建修复分支
git checkout -b hotfix/v2.0.1

# 修复问题
# ... 编辑代码 ...

# 测试修复
npm run build
# 在浏览器中测试

# 提交修复
git add .
git commit -m "fix: 修复XXX严重问题"

# 运行发布脚本
node scripts/release-prepare.js --patch

# 推送修复
git push origin hotfix/v2.0.1
git push origin v2.0.1
```

### 2. 更新商店

1. 上传新的 ZIP 文件
2. 申请加急审核（如可能）
3. 发布公告说明问题和修复

---

## 版本号规则

遵循 [语义化版本](https://semver.org/lang/zh-CN/)：

- **主版本号 (Major)**: 如 `1.0.0` → `2.0.0`
  - 不兼容的 API 变更
  - 重大架构重构
  - 功能移除

- **次版本号 (Minor)**: 如 `1.0.0` → `1.1.0`
  - 向下兼容的功能新增
  - 新功能
  - 功能增强

- **修订号 (Patch)**: 如 `1.0.0` → `1.0.1`
  - 向下兼容的 Bug 修复
  - 小改进
  - 文档更新

---

## 常见问题

### Q: 脚本执行失败怎么办？

A: 检查以下几点：

1. Node.js 版本是否满足要求
2. 是否安装了所有依赖（`npm install`）
3. 是否有 Git 仓库
4. 是否有写入权限

### Q: 如何回滚发布？

A:

1. 从商店下架扩展
2. 发布紧急修复版本
3. 通知用户更新
4. 分析问题根因

### Q: 商店审核不通过怎么办？

A:

1. 仔细阅读审核反馈
2. 修改相应问题
3. 重新提交
4. 如果认为审核有误，可以申诉

### Q: 如何处理多个浏览器的发布？

A:

1. 确保扩展在所有目标浏览器上测试通过
2. 为每个浏览器创建单独的发布包（如需）
3. 分别提交到各个商店
4. 注意不同商店的审核要求可能不同

---

## 联系方式

如有问题或建议，请联系：

- 项目负责人: [姓名]
- 技术负责人: [姓名]
- GitHub Issues: [项目地址]/issues

---

*最后更新: 2026-03-15*
