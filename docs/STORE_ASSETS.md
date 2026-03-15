# 商店素材准备清单

本文档说明发布 Smart Bookmarks 到 Chrome Web Store 和 Edge Add-ons 需要准备的所有素材。

---

## 必需素材

### 1. 扩展图标

**Chrome Web Store 要求:**
- **128x128** PNG 文件（必需）
- 建议: 16x16, 48x48, 128x128

**Edge Add-ons 要求:**
- **128x128** PNG 文件（必需）
- 建议: 16x16, 32x32, 48x48, 64x64, 128x128

**设计规范:**
- 背景透明或纯色
- 简洁明了，易识别
- 避免过多文字
- 符合品牌色调

**当前状态:**
- [x] `icons/icon16.png` - 已存在
- [x] `icons/icon48.png` - 已存在
- [x] `icons/icon128.png` - 已存在
- [ ] 需要优化设计（建议）

### 2. 宣传图片（Marquee Images）

**Chrome Web Store 要求:**
- **1280x800** 或 **640x400** PNG/JPG（可选但推荐）
- 最大 5MB
- 建议提供: 1 张

**Edge Add-ons 要求:**
- **1280x800** 或 **640x400** PNG/JPG（可选）
- 最大 5MB

**内容建议:**
- 展示主要功能界面
- 包含扩展名称
- 简洁的设计元素
- 突出核心价值

**当前状态:**
- [ ] `assets/marquee-1280x800.png` - 待创建
- [ ] `assets/marquee-640x400.png` - 待创建

### 3. 功能截图（Screenshots）

**Chrome Web Store 要求:**
- **1280x800** 或 **640x400** PNG/JPG（可选但强烈推荐）
- 最多 5 张
- 建议提供: 3-5 张

**Edge Add-ons 要求:**
- **1280x800** 或 **640x400** PNG/JPG（可选）
- 最多 5 张

**截图内容建议:**
1. 主界面 - 书签树和列表视图
2. AI 分析功能 - 分类建议界面
3. 链接检测 - 失效检测结果
4. 搜索功能 - 搜索结果展示
5. 设置页面 - API 配置界面

**当前状态:**
- [ ] `assets/screenshot-1-main.png` - 待创建
- [ ] `assets/screenshot-2-ai.png` - 待创建
- [ ] `assets/screenshot-3-check.png` - 待创建
- [ ] `assets/screenshot-4-search.png` - 待创建
- [ ] `assets/screenshot-5-settings.png` - 待创建

---

## 文本素材

### 1. 扩展名称

**中文:**
```
Smart Bookmarks - 智能收藏夹管理
```

**英文（如需要）:**
```
Smart Bookmarks - AI-Powered Bookmark Manager
```

### 2. 简短描述

**Chrome Web Store 限制:** 最多 132 个字符

```
智能管理浏览器收藏夹，支持AI分类、失效检测、快速搜索
```

**字符数:** 28 个字符 ✅

**英文版本（如需要）:**
```
AI-powered bookmark manager with smart classification, dead link detection, and fast search
```

### 3. 详细描述

**Chrome Web Store 限制:** 最多 16,000 个字符

```
Smart Bookmarks 是一款智能的浏览器收藏夹管理扩展，帮助您轻松管理和组织海量的书签。

核心功能：

🤖 AI 智能分类
- 自动分析收藏内容，智能推荐分类
- 支持自定义分类规则
- 一键应用分类建议
- 检测放错目录的书签

🔍 智能搜索
- 本地全文搜索，快速定位
- AI 语义搜索，理解自然语言
- 支持高级搜索语法
- 实时搜索结果预览

⚠️ 失效检测
- 一键扫描所有书签
- 智能识别失效链接
- 详细的失效原因说明
- 批量清理失效书签

💾 数据管理
- 本地导入导出
- 支持 JSON/HTML/CSV/Markdown 格式
- 浏览器收藏夹双向同步
- 数据安全，隐私可控

🎨 优秀体验
- 简洁现代的界面设计
- 快捷键支持（Ctrl+Shift+B）
- 实时进度显示
- 响应式布局

技术特点：
- 本地数据存储，保护隐私
- 支持 OpenAI 兼容 API
- 无需服务器，完全本地化
- Chrome/Edge 双平台支持

使用场景：
• 开发者管理技术文档和教程链接
• 研究人员整理学术资源
• 产品经理收集行业资讯
• 任何人整理海量收藏夹

安装后即可自动导入浏览器现有收藏夹，立即开始智能管理您的书签！

⚠️ 注意：AI 功能需要配置 OpenAI 兼容的 API（可选）
```

### 4. 隐私政策

**必需内容:**

```
隐私政策

Smart Bookmarks 扩展尊重并保护您的隐私。

数据收集：
- 本扩展不收集任何个人身份信息
- 所有数据存储在您的本地浏览器中
- 不会将数据发送到任何第三方服务器（除您配置的 AI 服务外）

数据使用：
- 您的书签数据仅用于本扩展的功能实现
- AI 分析功能仅在您主动调用时使用您配置的 API
- AI 服务提供商的隐私政策请参考相应服务提供商

权限说明：
- bookmarks：读取和管理您的浏览器收藏夹
- storage：本地存储扩展配置和缓存数据
- tabs：获取当前页面信息用于书签采集
- <all_urls>：检测链接有效性（可选功能）

数据安全：
- 所有数据本地存储，不上传到我们服务器
- 您可以随时导出或删除数据
- 不包含任何追踪代码或广告

第三方服务：
- AI 功能使用您配置的 OpenAI 兼容 API
- 我们不对第三方服务的使用负责

联系我们：
如有任何隐私相关问题，请通过以下方式联系：
[GitHub Issues] 或 [邮箱地址]

最后更新：2026-03-15
```

---

## 分类和标签

### Chrome Web Store

**主要分类:**
- 生产力工具 (Productivity)

**标签:**
- 书签管理
- AI
- 生产力
- 收藏夹

### Edge Add-ons

**主要分类:**
- 生产力工具 (Productivity)

**标签:**
- 书签管理
- AI
- 生产力

---

## 支持语言

**主要语言:**
- 中文（简体）- zh-CN

**其他语言（如需要）:**
- 英语（美国）- en-US
- 日语 - ja
- 韩语 - ko

---

## 创建素材的工具推荐

### 图标设计
- **Figma** - https://www.figma.com/
- **Canva** - https://www.canva.com/
- **Adobe Illustrator** - 专业矢量设计
- **Inkscape** - 免费矢量设计

### 截图工具
- **Chrome DevTools** - 自带截图功能
- **Snipping Tool** - Windows 自带
- **CleanShot X** - Mac 专业截图工具
- **ShareX** - 免费开源截图工具

### 图片优化
- **TinyPNG** - https://tinypng.com/
- **Squoosh** - https://squoosh.app/
- **ImageOptim** - Mac 图片优化工具

---

## 素材检查清单

### 发布前检查

- [ ] 所有图标尺寸齐全（16/48/128）
- [ ] 宣传图片已创建
- [ ] 至少 3 张功能截图
- [ ] 简短描述符合字符限制
- [ ] 详细描述清晰完整
- [ ] 隐私政策已编写
- [ ] 所有素材文件已优化（文件大小合理）
- [ ] 素材在不同背景下都清晰可见
- [ ] 品牌色调统一
- [ ] 无版权问题

### 文件组织

建议将素材放在 `assets/` 目录：

```
assets/
  ├── icons/
  │   ├── icon16.png
  │   ├── icon48.png
  │   └── icon128.png
  ├── marquee/
  │   ├── marquee-1280x800.png
  │   └── marquee-640x400.png
  └── screenshots/
      ├── screenshot-1-main.png
      ├── screenshot-2-ai.png
      ├── screenshot-3-check.png
      ├── screenshot-4-search.png
      └── screenshot-5-settings.png
```

---

## 商店链接

### Chrome Web Store
- 开发者控制台: https://chrome.google.com/webstore/devconsole
- 发布指南: https://developer.chrome.com/docs/webstore/publish/

### Edge Add-ons
- 合作伙伴中心: https://partner.microsoft.com/dashboard/microsoftedge/extension
- 发布指南: https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/

---

*最后更新: 2026-03-15*
