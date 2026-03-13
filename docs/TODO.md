# Smart Bookmarks - TODO 清单

> 最后更新: 2026-03-13

---

## 功能完成度评估

| 模块 | 完成度 | 状态 | 备注 |
|------|--------|------|------|
| 数据库模块 | 100% | ✅ 完成 | IndexedDB v2 + 迁移框架 |
| 浏览器收藏同步 | 95% | ⚠️ 基本完成 | SYNC_BOOKMARKS 消息未实现具体逻辑 |
| 失效链接检测 | 100% | ✅ 完成 | HEAD→GET 降级 + uncertain + 断点续检 |
| AI 智能分类 | 100% | ✅ 完成 | 分批分析 + 断点续分析 + 取消 + 进度暂存 + 确认应用 |
| 智能搜索 | 100% | ✅ 完成 | 本地 + AI + 混合 + 高级语法 |
| 数据导出 | 100% | ✅ 完成 | JSON/HTML/CSV/Markdown |
| 网页信息采集 | 100% | ✅ 完成 | content script 采集 + background 写入 DB |
| UI 组件 | 100% | ✅ 完成 | 完整组件库 + 渲染器 |
| Options 设置页 | 100% | ✅ 完成 | API 配置 + 连接测试 |
| 测试与优化 | 0% | ❌ 未开始 | 无测试代码 |

**总体完成度：约 93%**

---

## 待办事项

### P0 - 阻塞发布（必须完成）

- [ ] **浏览器加载测试**：在 Chrome/Edge 上加载扩展，完整走一遍核心流程确认无 JS 报错
- [ ] **SYNC_BOOKMARKS 实现**：`background.js` 中 `handleSyncBookmarks()` 函数体为空，需实现将本地 DB 数据写回浏览器收藏夹 API 的逻辑
- [x] **content script 数据落盘**：~~collector.js 采集了页面信息但 background.js 未处理~~ → `handlePageInfoCollected()` 已完整实现，写入 description/favicon ✅
- [x] **插件图标**：~~icons/ 目录需要补充实际的 16/48/128 尺寸图标~~ → `icon16.png` / `icon48.png` / `icon128.png` 均已存在 ✅
- [x] **分析进度暂存**：~~非取消中断（关机/网络错误）时 catch 块会清除已保存进度~~ → 错误时保留 `completedBatches`，写入 `lastError` 供续分析使用 ✅

### P1 - 重要优化

- [ ] **deleteBookmark 删除 API**：`popup.js` `deleteBookmark()` 的 onConfirm 回调中 `// TODO: 调用删除 API` 尚未实现，点击删除实际无效
- [ ] **handleImport 导入落盘**：`popup.js` `handleImport()` 读取文件后 `// TODO: 导入数据到数据库` 尚未实现，导入功能无效
- [x] **GET_BOOKMARKS tags 字段**：~~`background.js` `handleGetBookmarks()` 返回 `tags: []` 为硬编码~~ → 已修复，从 DB 查询实际标签 ✅
- [ ] **失效链接—一键清理流程**：点击"待清理"分类后的批量删除交互待验证
- [ ] **uncertain 提示优化**：在书签详情面板中显示 uncertain 的具体原因和"手动验证"按钮
- [ ] **检测结果面板刷新**：检测完成后 showBrokenLinksDetails 的详情面板需要支持刷新书签列表
- [ ] **错误边界/兜底**：popup.js 中部分 catch 只 console.error，需加用户可见的 Toast 提示
- [ ] **大量书签性能**：超过 5000 条书签时树形渲染和搜索性能验证
- [ ] **搜索降级策略**：未配置 AI 时 smartSearch 调用 AI 搜索会失败，确认降级到本地搜索的逻辑
- [x] **AI 分类提示词优化**：~~提示词冗长（550行）导致建议不理想~~ → 已精简至200行并提取到独立文件 ✅
- [x] **AI 分类建议质量**：~~盲目使用"已导入"等宽泛分类~~ → 已调整优先级，明确何时创建新分类 ✅
- [x] **书签移动功能**：~~保存后未实际移动书签到对应目录~~ → 已添加 `chrome.bookmarks.move()` 调用 ✅

### P2 - 功能增强

- [ ] **导出功能入口**：确认 popup 界面中导出按钮的位置和交互
- [ ] **单条链接检测**：popup.js 中 checkSingleLink 标注为 TODO，右键菜单"检测此链接"未实现
- [ ] **分类管理 CRUD**：新建/编辑/删除/拖拽排序分类的完整交互
- [ ] **标签管理 CRUD**：标签的重命名/合并/删除功能
- [ ] **定期自动检测**：link-checker.js 中 createCheckTask/cancelCheckTask 已有 Alarm API 代码，但未在 UI 中暴露
- [ ] **深色模式**：CSS 适配，当前设计支持 light/dark/auto 但代码未实现

### P3 - 质量与发布

- [ ] **单元测试**：核心模块（link-checker / local-search / openai）的单元测试
- [ ] **E2E 测试**：Puppeteer/Playwright 扩展测试
- [ ] **错误监控**：关键路径的错误上报/日志记录机制
- [ ] **性能优化**：虚拟滚动在真实大数据集下的表现
- [ ] **用户文档**：README 补充截图和使用演示
- [ ] **隐私说明**：明确数据存储策略和 API 调用范围
- [ ] **Chrome Web Store 发布准备**：描述、截图、隐私政策

### P4 - 后续规划

- [ ] Firefox 兼容（manifest v2 适配）
- [ ] 快捷键增强（Ctrl+D 快速添加收藏等）
- [ ] 浏览器历史整合
- [ ] 统计分析面板
- [ ] 多设备同步（WebDAV/云存储）

---

## 已知问题

| # | 问题 | 优先级 | 状态 |
|---|------|--------|------|
| 1 | `SYNC_BOOKMARKS` 消息处理体为空（TODO） | P0 | 待修复 |
| 2 | ~~`PAGE_INFO_COLLECTED` 消息未在 background 处理~~ | P0 | ✅ 已修复（`handlePageInfoCollected` 已实现） |
| 3 | `checkSingleLink()` 函数体为 TODO | P2 | 待实现 |
| 4 | `deleteBookmark()` onConfirm 未调用删除 API | P1 | 待修复 |
| 5 | `handleImport()` 未将解析数据写入数据库 | P1 | 待修复 |
| 6 | ~~`handleGetBookmarks()` 返回 `tags: []` 硬编码空数组~~ | P1 | ✅ 已修复（从 DB 查询实际标签） |
| 7 | Git remote 凭据认证需手动指定用户名 | - | 已 workaround |
| 8 | 分析因非取消原因中断（关机/网络）后进度丢失 | P1 | ✅ 已修复（错误时保留 `completedBatches` + `lastError`）|
| 9 | AI 分类建议不理想（盲目使用"已导入"等宽泛分类） | P1 | ✅ 已修复（优化提示词优先级） |
| 10 | 点击保存后书签未实际移动到对应目录 | P1 | ✅ 已修复（添加 `chrome.bookmarks.move()` 调用）|

---

## 建议优先执行顺序

```
Week 1: P0（浏览器加载测试 → 发现并修复 JS 错误）
         ✅ 图标已就绪；✅ content script 数据落盘已完成
Week 2: P0（SYNC_BOOKMARKS 实现）+ P1（deleteBookmark / handleImport / tags 查询修复）
Week 3: P1（uncertain 优化 + 错误提示 + 性能验证）
Week 4: P2（checkSingleLink + 分类/标签 CRUD + 导出入口）
Week 5: P3（单元测试 + 文档 + 发布准备）
```

---

## 最近更新（2026-03-13）

### AI 分类优化重构

#### 问题分析
1. **分类建议不理想**：AI 盲目将所有书签归入"已导入"等宽泛分类，而非创建具体技术分类（如 React、Vue）
2. **保存后未移动**：点击保存只更新了 IndexedDB，未调用浏览器 API 实际移动书签
3. **提示词过长**：550+ 行的中文提示词包含大量冗余示例，影响 AI 理解

#### 优化方案
1. **提示词重构**：
   - 精简至 200 行，保留核心规则
   - 提取到独立文件 `src/api/prompts/classification-system.prompt.js`
   - 调整优先级逻辑：明确"何时创建新分类"与"何时使用现有分类"
   - 添加当前分类信息，支持检测放错目录的情况

2. **书签移动功能**：
   - 添加 `chrome.bookmarks.move()` 调用
   - 同步更新 IndexedDB 和浏览器收藏夹
   - 统一处理新旧分类的浏览器文件夹 ID

3. **质量提升**：
   - 强化分类建议输出要求，确保同时返回 categories 和 tags
   - 添加分类错误检测和移动建议
   - 完善日志输出，便于调试

#### 提交记录
- `2454635` feat: 优化AI分类提示词和功能
- `39e4798` fix: 修复AI分类建议不理想和保存后未移动书签的问题

#### 预期效果
- ✅ AI 建议 React 书签 → "React"分类（而非"已导入"）
- ✅ 点击保存后书签实际移动到对应浏览器文件夹
- ✅ 检测放错目录并给出移动建议（如 GitLab 在"容器化"下）
- ✅ 同时返回分类建议和标签建议

---

*创建日期: 2026-02-28 | 最后检查: 2026-03-13*
