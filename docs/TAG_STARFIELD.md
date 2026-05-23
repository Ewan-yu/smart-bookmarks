# 标签星空视图（Tag Starfield）

> 实施日期：2026-05-23
> 状态：已完成

## 概述

将标签视图从平淡的列表/标签云升级为交互式"星空图"——每个标签是一颗星，大小由关联书签数量决定，配合搜索、排序、入场动画和彩蛋，让 660+ 标签的浏览变得有趣。

## 架构

完全独立模块，不影响现有主体程序。

### 文件清单

| 文件 | 类型 | 说明 |
|---|---|---|
| `src/popup/modules/tag-view.js` | 新增 | 标签视图模块（~300 行） |
| `src/popup/tag-view.css` | 新增 | 标签视图独立样式（~280 行） |
| `src/popup/popup.html` | 修改 | 添加 `<link rel="stylesheet" href="tag-view.css">` |
| `src/popup/popup.js` | 修改 | 导入 TagView、初始化、替换旧 renderTagsView() |
| `src/popup/popup.css` | 修改 | 删除旧的 `.tags-grid`/`.tag-chip` 样式 |

### 模块接口

```javascript
import { TagView } from './modules/tag-view.js';

const tagView = new TagView({
  container: elements.bookmarkList,
  breadcrumbs: elements.breadcrumb,
  folderStats: elements.folderStats,
  createBookmarkRow,
  navManager
});

// 渲染
tagView.render(state.bookmarks);

// 清理
tagView.destroy();
```

## 功能清单

### 可变字号（5 档）

| 档位 | 条件 | 字号 | 颜色 | 视觉效果 |
|---|---|---|---|---|
| size-xs | 1 个书签 | 12px | 灰蓝 | 最小，低调 |
| size-sm | 2-4 个 | 13px | 蓝色 | 小标签 |
| size-md | 5-14 个 | 15px | 靛蓝 | 中等，有微阴影 |
| size-lg | 15-49 个 | 18px | 深靛蓝 | 大标签，明显阴影 |
| size-xl | 50+ 个 | 22px | 深靛蓝+渐变 | 巨星，带微光 ✨ |

### 搜索过滤

- 顶部搜索框，`placeholder="搜索 660 个标签…"`
- debounce 100ms 实时过滤
- 过滤后显示 "显示 X / 660 个标签"
- 无匹配时显示空状态

### 排序切换

三个按钮，一键切换：
- **按数量**（默认）— 书签数量降序
- **按字母** — 中文拼音排序
- **最近使用** — 按书签添加时间排序

### 统计栏

顶部显示：`660 标签 · 最常用: XXX (42次) · 覆盖 XX 篇书签`

### 入场动画

- 标签逐个淡入（opacity 0→1 + translateY 8px→0）
- 间隔 15ms，最大总时长 1500ms
- 使用 CSS animation + JS animation-delay

### 交互

- **单击标签** → 查看该标签下所有书签（复用 createBookmarkRow）
- **面包屑** → `标签视图 › 具体标签名`，点击返回星空
- **搜索框清除** → 一键清空，重新显示全部

### 彩蛋

1. **微光动效** — 50+ 巨星标签 hover 时 ✨ 闪烁 + 阴影脉动
2. **星座连线** — 连续快速点击 5 个不同标签（3 秒内），标签间出现连线动画，2.5 秒后消失

## CSS 变量依赖

tag-view.css 引用 popup.css 的 `:root` 变量（均有 fallback）：

- `--c-primary` / `--c-primary-rgb` / `--c-secondary` / `--c-text` / `--c-text-sub` / `--c-muted`
- `--c-surface` / `--c-surface-low` / `--c-surface-high` / `--c-border`
- `--radius-*` / `--shadow-*` / `--duration-*` / `--ease-out-quart`

## 与旧代码的对比

| 项目 | 旧实现 | 新实现 |
|---|---|---|
| 位置 | popup.js 内联函数 | 独立模块 tag-view.js |
| 样式 | popup.css 中 .tag-chip | 独立 tag-view.css |
| 标签数量 | 无适配 | 5 档可变字号适配 |
| 搜索 | 无 | 有（debounce 100ms） |
| 排序 | 仅按数量 | 数量/字母/最近 |
| 动画 | 无 | 入场动画 + 微光 + 星座 |
| 代码量 | ~50 行 | ~580 行（JS+CSS） |

## 扩展方向

- [ ] 标签颜色自定义（按分类或用户偏好）
- [ ] 标签分组（按首字母或语义聚类）
- [ ] 多选标签过滤（Shift+点击取交集/并集）
- [ ] 标签使用趋势图（最近 30 天）
- [ ] 标签合并/重命名操作
