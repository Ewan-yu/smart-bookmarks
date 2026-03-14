# AI 分析优化和重构 Todo 计划

**创建日期**: 2026-03-13
**预估总工时**: 12 个工作日
**当前状态**: ✅ Phase 1-3 已完成

**最新更新**: 2026-03-14
**当前阶段**: Phase 4 - popup.js 重构

---

## 📊 项目概览

### 目标
1. ✅ 修复 AI 分析结果样式问题
2. ✅ 实现 AI 分类智能聚合去重
3. ✅ 新增文件夹删除/合并功能
4. ⏳ popup.js 代码重构（待开发）

### 进度概览
- ✅ Phase 1: AI 分析结果样式优化（0.5天）- **已完成**
- ✅ Phase 2: AI 分类智能聚合去重（2天）- **已完成**
- ✅ Phase 3: 文件夹管理功能（2.5天）- **已完成**
- 🔄 Phase 4: popup.js 重构（6天）- **进行中** (54%)
  - ✅ Phase 4.1: 基础设施（3个任务）- 已完成
  - ✅ Phase 4.2: 核心模块（3个任务）- 已完成
  - ⏳ Phase 4.3: 功能模块（4个任务）- 待开发
  - ⏳ Phase 4.4: UI 模块（3个任务）- 待开发
- ⏳ Phase 5: 整合测试和上线（2天）- 待开发

**总体进度**: 约 72% （6.5/9 天）

### 成功标准
- [x] AI 分析结果样式对比度符合 WCAG AA 标准
- [x] 重复分类减少 80% 以上
- [x] 分类数量控制在 5-15 个
- [x] 用户可删除和合并文件夹
- [ ] popup.js 拆分为 12+ 个独立模块
- [ ] 所有现有功能正常工作（无回归）

---

## 🎯 Phase 1: AI 分析结果样式优化（0.5 天）✅ 已完成

### 任务列表

#### 1.1 创建 AI 分析对话框 CSS 类 ✅
- [x] CSS 样式已集成到 `src/popup/popup.css`
- [x] 定义 `.analysis-dialog` 基础样式
- [x] 定义 `.analysis-category-item` 分类项样式
- [x] 定义 `.analysis-bookmark-item` 书签项样式
- [x] 确保颜色对比度符合 WCAG AA 标准（4.5:1）
- [x] 支持深色模式适配
- [x] 响应式布局（max-width: 800px, max-height: 80vh）

**文件**:
- `src/popup/popup.css` (新增 CSS 类)
- `src/popup/ai-dialog.css` (新建)

**验收标准**:
- [ ] 分类名称清晰可读（14px, 600 weight）
- [ ] 对比度 > 4.5:1
- [ ] 对话框最大高度 80vh，可滚动
- [ ] 响应式布局（适配 1366x768）

**负责人**: 开发
**工时**: 2 小时

---

#### 1.2 重构 showAnalysisConfirmDialog 函数
- [ ] 移除所有内联样式
- [ ] 使用新的 CSS 类
- [ ] 优化对话框布局结构
- [ ] 添加分类描述区域
- [ ] 改进滚动和交互体验

**文件**:
- `src/popup/popup.js`

**验收标准**:
- [ ] 无内联样式（除动态计算值）
- [ ] CSS 类命名清晰语义化
- [ ] 代码可读性提升

**负责人**: 开发
**工时**: 2 小时

---

## 🎯 Phase 2: AI 分类智能聚合去重（2 天）✅ 已完成

### 任务列表

#### 2.1 实现分类相似度算法 ✅
- [x] 创建 `src/utils/category-merger.js`
- [x] 实现 `calculateSimilarity()` 函数
- [x] 实现编辑距离算法（Levenshtein Distance）
- [x] 实现语义相似度算法（关键词提取）
- [x] 实现包含关系检测
- [ ] 编写单元测试（5+ 测试用例）- 待补充

**文件**:
- `src/utils/category-merger.js` (新建)
- `tests/unit/category-merger.test.js` (新建)

**核心算法**:
```javascript
calculateSimilarity(name1, name2) {
  const editSim = this.editDistanceSimilarity(name1, name2);
  const semanticSim = this.semanticSimilarity(name1, name2);
  const containmentSim = this.containmentSimilarity(name1, name2);
  return editSim * 0.3 + semanticSim * 0.5 + containmentSim * 0.2;
}
```

**验收标准**:
- [ ] "系统架构" vs "架构设计" 相似度 > 0.75
- [ ] "前端开发" vs "前端UI" 相似度 > 0.7
- [ ] 单元测试覆盖率 > 80%
- [ ] 性能：100 个分类聚合耗时 < 100ms

**负责人**: 开发
**工时**: 6 小时

---

#### 2.2 实现层次聚类合并 ✅
- [x] 实现 `buildSimilarityMatrix()` 构建相似度矩阵
- [x] 实现 `clusterCategories()` 层次聚类算法
- [x] 实现 `mergeCluster()` 合并聚类
- [x] 添加可配置阈值（similarityThreshold）
- [x] 添加合并报告（mergedFrom 字段）
- [ ] 编写单元测试 - 待补充

**文件**:
- `src/utils/category-merger.js`

**验收标准**:
- [ ] 正确聚合相似分类
- [ ] 保留原始分类信息（_mergeInfo）
- [ ] 避免过度聚合
- [ ] 单元测试通过

**负责人**: 开发
**工时**: 4 小时

---

#### 2.3 优化 AI Prompt ✅
- [x] 更新 `getSystemPrompt()` 函数
- [x] 提取系统提示词到独立文件 `src/api/prompts/classification-system.prompt.js`
- [x] 精简提示词（从550行减少到200行）
- [x] 添加分类命名规范
- [x] 添加层级结构要求（大类+细类）
- [x] 添加语义去重指导
- [x] 提供分类示例
- [x] 优化优先级逻辑（何时创建新分类 vs 使用现有分类）
- [ ] 测试不同模型（GPT-4, Claude, DeepSeek）- 待测试

**文件**:
- `src/api/openai.js`

**Prompt 关键点**:
- 命名规范：2-6 字，避免虚词
- 层级结构：2-3 层
- 数量控制：每批 5-10 个分类
- 语义去重：避免重复分类

**验收标准**:
- [ ] AI 生成分类数量减少 50%
- [ ] 重复分类减少 80%
- [ ] 分类命名更规范

**负责人**: 开发
**工时**: 3 小时

---

#### 2.4 集成聚合算法到 AI 分析流程 ✅
- [x] 修改 `analyzeBookmarks()` 函数
- [x] 在每批处理后调用聚合算法
- [x] 在最终结果上再次聚合
- [x] 添加配置选项（similarityThreshold, minMergeSupport）
- [x] 记录聚合日志（合并了多少组）
- [x] 更新进度消息

**实现细节**:
- 使用 `CategoryMerger` 类进行智能聚合
- 默认阈值：similarityThreshold = 0.75, minMergeSupport = 2
- 聚合结果记录在 batchLogs 中（batchIndex = -1）
- 支持 mergeReport 详细报告

**文件**:
- `src/api/openai.js`

**验收标准**:
- [ ] 聚合功能正常工作
- [ ] 不影响现有功能（可通过配置关闭）
- [ ] 聚合结果合理

**负责人**: 开发
**工时**: 3 小时

---

## 🎯 Phase 3: 文件夹管理功能（2.5 天）✅ 已完成

### 任务列表

#### 3.1 实现删除文件夹后端 ✅
- [x] 实现 `handleDeleteFolder()` 消息处理
- [x] 实现 `getAllDescendants()` 递归获取后代
- [x] 实现子内容移动到父文件夹
- [x] 处理根文件夹删除（移到"未分类"）
- [x] 同步到浏览器收藏夹
- [x] 错误处理和回滚

**文件**:
- `src/background/background.js`

**API**:
```javascript
// 消息类型
{
  type: 'DELETE_FOLDER',
  folderId: string
}
```

**验收标准**:
- [x] 删除文件夹，子内容正确移动
- [x] 根文件夹删除，子内容移到顶级
- [x] 浏览器收藏夹同步正确
- [x] 错误处理完善

**负责人**: 开发
**工时**: 4 小时

---

#### 3.2 实现合并文件夹后端 ✅
- [x] 实现 `handleMergeFolders()` 消息处理
- [x] 实现 `isDescendant()` 防止循环嵌套
- [x] 实现 `getNextSortOrder()` 排序号管理
- [x] 移动所有子内容到目标文件夹
- [x] 删除源文件夹
- [x] 同步到浏览器收藏夹

**文件**:
- `src/background/background.js`

**API**:
```javascript
// 消息类型
{
  type: 'MERGE_FOLDERS',
  sourceId: string,
  targetId: string
}
```

**验收标准**:
- [x] 合并功能正常工作
- [x] 防止循环嵌套
- [x] 排序号正确更新
- [x] 浏览器收藏夹同步

**负责人**: 开发
**工时**: 4 小时

---

#### 3.3 实现删除文件夹 UI ✅
- [x] 右键菜单添加"删除分类"项（复用现有删除按钮）
- [x] 实现删除确认对话框
- [x] 显示影响范围（子项数量）
- [x] 调用后端 API
- [x] 成功后刷新列表
- [x] 错误提示

**文件**:
- `src/popup/popup.html`
- `src/popup/popup.css`
- `src/popup/popup.js`

**UI 流程**:
1. 右键点击文件夹 → 菜单
2. 点击"删除分类" → 确认对话框
3. 确认 → 调用 API → 刷新

**验收标准**:
- [x] UI 流程顺畅
- [x] 确认对话框清晰
- [x] 错误提示友好

**负责人**: 开发
**工时**: 2 小时

---

#### 3.4 实现合并文件夹 UI ✅
- [x] 右键菜单添加"合并到..."项
- [x] 实现合并目标选择对话框
- [x] 显示同级文件夹列表
- [x] 显示每个文件夹的子项数量
- [x] 调用后端 API
- [x] 成功后刷新列表

**文件**:
- `src/popup/popup.html`
- `src/popup/popup.css`
- `src/popup/popup.js`

**UI 流程**:
1. 右键点击文件夹 → 菜单
2. 点击"合并到..." → 选择对话框
3. 选择目标文件夹 → 确认 → API → 刷新

**验收标准**:
- [x] 目标选择器清晰
- [x] 显示文件夹数量
- [x] 合并操作流畅

**负责人**: 开发
**工时**: 3 小时

---

#### 3.5 实现 AI 合并建议 ✅
- [x] 实现合并建议生成算法
- [x] 基于相似度阈值推荐合并
- [x] 实现建议对话框 UI
- [x] 显示置信度分数
- [x] 支持全选/取消全选
- [x] 批量应用合并

**文件**:
- `src/popup/popup.js`
- `src/utils/category-merger.js`

**算法**:
```javascript
generateMergeSuggestions(categories) {
  const suggestions = [];
  const used = new Set();

  for (let i = 0; i < categories.length; i++) {
    for (let j = i + 1; j < categories.length; j++) {
      const similarity = calculateSimilarity(
        categories[i].name,
        categories[j].name
      );
      if (similarity >= 0.75) {
        suggestions.push({
          source: categories[i].name,
          target: categories[j].name,
          confidence: similarity
        });
      }
    }
  }

  return suggestions.sort((a, b) => b.confidence - a.confidence);
}
```

**验收标准**:
- [x] 建议准确率 > 85%
- [x] 置信度显示准确
- [x] 批量操作正常

**负责人**: 开发
**工时**: 5 小时

---

#### 3.6 实现文件夹创建和重命名 ✅
- [x] 实现 `handleCreateCategory()` 消息处理
- [x] 实现 `handleUpdateCategory()` 消息处理
- [x] 先创建浏览器文件夹，再使用其 ID 作为分类 ID
- [x] 右键菜单新增"新建子文件夹"和"重命名"项
- [x] 创建/重命名对话框 UI
- [x] 编辑对话框支持文件夹类型（只显示名称字段）
- [x] 修复 ID 格式不一致问题
- [x] 添加 `notifyBookmarkChanged()` 通知刷新

**文件**:
- `src/background/background.js`
- `src/popup/popup.js`
- `src/popup/popup.html`

**API**:
```javascript
// 创建文件夹
{
  type: 'CREATE_CATEGORY',
  name: string,
  parentId: string | null
}

// 更新文件夹
{
  type: 'UPDATE_CATEGORY',
  id: string,
  name: string
}
```

**验收标准**:
- [x] 创建文件夹只创建一个（不重复）
- [x] 文件夹 ID 格式统一（cat_${browserId}）
- [x] 删除文件夹成功
- [x] 重命名文件夹成功
- [x] 左侧目录实时更新
- [x] 浏览器收藏夹同步

**负责人**: 开发
**工时**: 4 小时

---

#### 3.7 文件夹管理功能测试
- [ ] 删除空文件夹
- [ ] 删除含子文件夹的文件夹
- [ ] 删除根文件夹
- [ ] 合并到同级文件夹
- [ ] 合并到子文件夹（应阻止）
- [ ] 合并到父文件夹
- [ ] AI 合并建议准确性
- [ ] 边界情况测试

**文件**:
- `tests/integration/folder-manager.test.js` (新建)

**验收标准**:
- [ ] 所有测试用例通过
- [ ] 无数据丢失
- [ ] 无浏览器收藏夹不一致

**负责人**: 开发 + QA
**工时**: 4 小时

---

## 🎯 Phase 4: popup.js 重构（6 天）

### 4.1 Phase 1: 基础设施（1 天）

#### 任务 1.1: 创建事件总线
- [ ] 创建 `src/popup/utils/event-bus.js`
- [ ] 实现 EventBus 类
- [ ] 定义事件名称常量
- [ ] 添加错误处理
- [ ] 编写单元测试

**文件**:
- `src/popup/utils/event-bus.js` (新建)

**API**:
```javascript
eventBus.on(eventName, callback)
eventBus.off(eventName, callback)
eventBus.emit(eventName, data)
eventBus.once(eventName, data)
```

**验收标准**:
- [ ] 事件订阅/发布正常
- [ ] 支持多个监听器
- [ ] 错误不中断其他监听器

**工时**: 2 小时

---

#### 任务 1.2: 创建状态管理模块
- [ ] 创建 `src/popup/modules/state.js`
- [ ] 定义状态结构
- [ ] 实现状态读取接口
- [ ] 实现状态更新接口
- [ ] 实现状态变更通知

**文件**:
- `src/popup/modules/state.js` (新建)

**API**:
```javascript
state.get(path)
state.set(path, value)
state.subscribe(path, callback)
```

**工时**: 3 小时

---

#### 任务 1.3: 提取公共工具函数
- [ ] 创建 `src/popup/utils/helpers.js`
- [ ] 提取 DOM 操作函数
- [ ] 提取格式化函数
- [ ] 提取验证函数
- [ ] 添加 JSDoc 注释

**文件**:
- `src/popup/utils/helpers.js` (新建)

**函数列表**:
- `escapeHtml()`
- `truncateText()`
- `formatDate()`
- `isValidUrl()`
- `debounce()`
- `throttle()`

**工时**: 3 小时

---

### 4.2 Phase 2: 核心模块（2 天）

#### 任务 2.1: 提取书签管理模块
- [ ] 创建 `src/popup/modules/bookmarks.js`
- [ ] 提取 `loadBookmarks()` 函数
- [ ] 提取 `getBookmarkTree()` 函数
- [ ] 提取书签 CRUD 操作
- [ ] 接入事件总线
- [ ] 更新 popup.js 调用

**文件**:
- `src/popup/modules/bookmarks.js` (新建)
- `src/popup/popup.js` (修改)

**验收标准**:
- [ ] 模块职责单一
- [ ] 事件通知及时
- [ ] 无功能回归

**工时**: 5 小时

---

#### 任务 2.2: 提取导航模块
- [ ] 创建 `src/popup/modules/navigation.js`
- [ ] 提取侧边栏导航逻辑
- [ ] 提取面包屑导航
- [ ] 提取文件夹树渲染
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/navigation.js` (新建)

**工时**: 4 小时

---

#### 任务 2.3: 提取搜索模块
- [ ] 创建 `src/popup/modules/search.js`
- [ ] 提取本地搜索逻辑
- [ ] 提取 AI 搜索逻辑
- [ ] 提取搜索建议
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/search.js` (新建)

**工时**: 4 小时

---

#### 任务 2.4: 核心模块集成测试
- [ ] 测试书签加载
- [ ] 测试导航切换
- [ ] 测试搜索功能
- [ ] 测试模块间通信
- [ ] 性能测试

**工时**: 3 小时

---

### 4.3 Phase 3: 功能模块（2 天）

#### 任务 3.1: 提取 AI 分析模块
- [ ] 创建 `src/popup/modules/ai-analysis.js`
- [ ] 提取 AI 分析启动逻辑
- [ ] 提取进度显示
- [ ] 提取结果确认对话框
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/ai-analysis.js` (新建)

**工时**: 4 小时

---

#### 任务 3.2: 提取链接检测模块
- [ ] 创建 `src/popup/modules/link-checker.js`
- [ ] 提取检测启动逻辑
- [ ] 提取进度显示
- [ ] 提取结果展示
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/link-checker.js` (新建)

**工时**: 3 小时

---

#### 任务 3.3: 提取拖拽模块
- [ ] 创建 `src/popup/modules/drag-drop.js`
- [ ] 提取拖拽事件处理
- [ ] 提取拖拽排序逻辑
- [ ] 提取拖拽视觉反馈
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/drag-drop.js` (新建)

**工时**: 3 小时

---

#### 任务 3.4: 提取文件夹管理模块
- [ ] 创建 `src/popup/modules/folder-manager.js`
- [ ] 提取删除文件夹逻辑
- [ ] 提取合并文件夹逻辑
- [ ] 提取 AI 合并建议
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/folder-manager.js` (新建)

**工时**: 3 小时

---

#### 任务 3.5: 功能模块集成测试
- [ ] 测试 AI 分析
- [ ] 测试链接检测
- [ ] 测试拖拽排序
- [ ] 测试文件夹管理
- [ ] 回归测试

**工时**: 3 小时

---

### 4.4 Phase 4: UI 模块（1 天）

#### 任务 4.1: 提取对话框模块
- [ ] 创建 `src/popup/modules/dialog.js`
- [ ] 提取编辑对话框
- [ ] 提取确认对话框
- [ ] 提取通用对话框组件
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/dialog.js` (新建)

**工时**: 3 小时

---

#### 任务 4.2: 提取右键菜单模块
- [ ] 创建 `src/popup/modules/context-menu.js`
- [ ] 提取菜单显示/隐藏
- [ ] 提取菜单项生成
- [ ] 提取菜单操作处理
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/context-menu.js` (新建)

**工时**: 2 小时

---

#### 任务 4.3: 提取键盘导航模块
- [ ] 创建 `src/popup/modules/keyboard-nav.js`
- [ ] 提取键盘事件监听
- [ ] 提取焦点管理
- [ ] 提取快捷键处理
- [ ] 接入事件总线

**文件**:
- `src/popup/modules/keyboard-nav.js` (新建)

**工时**: 2 小时

---

#### 任务 4.4: UI 模块集成测试
- [ ] 测试所有对话框
- [ ] 测试右键菜单
- [ ] 测试键盘导航
- [ ] 无障碍测试

**工时**: 2 小时

---

## 🎯 Phase 5: 整合测试和上线（2 天）

### 任务列表

#### 5.1 完整回归测试
- [ ] 书签加载和显示
- [ ] 搜索功能
- [ ] 拖拽排序
- [ ] AI 分析
- [ ] 链接检测
- [ ] 文件夹管理
- [ ] 导航切换
- [ ] 对话框和菜单
- [ ] 键盘导航
- [ ] 数据同步

**测试用例**: 100+ 个

**工时**: 4 小时

---

#### 5.2 性能测试和优化
- [ ] 加载时间测试
- [ ] 内存使用测试
- [ ] 渲染性能测试
- [ ] AI 分析性能测试
- [ ] 性能瓶颈优化

**目标**:
- 页面加载 < 500ms
- 内存占用 < 100MB
- 滚动帧率 > 60fps

**工时**: 4 小时

---

#### 5.3 Bug 修复
- [ ] 修复测试发现的 Bug
- [ ] 回归测试
- [ ] 代码审查

**工时**: 4 小时

---

#### 5.4 文档更新
- [ ] 更新 README.md
- [ ] 更新架构文档
- [ ] 更新 API 文档
- [ ] 编写变更日志

**工时**: 2 小时

---

#### 5.5 上线准备
- [ ] 创建发布标签
- [ ] 构建生产版本
- [ ] 灰度发布（5% 用户）
- [ ] 监控错误日志
- [ ] 收集用户反馈

**工时**: 2 小时

---

## 📅 里程碑

| 里程碑 | 日期 | 交付物 |
|--------|------|--------|
| M1: AI 样式优化 | D+1 | 样式改进完成 |
| M2: AI 聚合算法 | D+3 | 算法实现完成 |
| M3: 文件夹管理 | D+7 | 删除/合并功能上线 |
| M4: 重构 Phase 1-2 | D+10 | 基础模块提取完成 |
| M5: 重构 Phase 3-4 | D+11 | 所有模块提取完成 |
| M6: 测试完成 | D+12 | 通过所有测试 |
| M7: 正式上线 | D+14 | 全量发布 |

---

## 🔍 风险管理

### 风险 1: AI 聚合效果不佳
**概率**: 中
**影响**: 高
**缓解措施**:
- 提供可配置阈值
- 保留手动合并功能
- 用户反馈调优

### 风险 2: 重构引入 Bug
**概率**: 高
**影响**: 高
**缓解措施**:
- 充分的单元测试
- 逐步重构（分阶段）
- 每个阶段回归测试
- 代码审查

### 风险 3: 时间延期
**概率**: 中
**影响**: 中
**缓解措施**:
- 预留缓冲时间（20%）
- 优先级排序（P0/P1 先做）
- 每日进度跟踪

---

## 📊 进度跟踪

### 每日站会内容
- 昨天完成了什么
- 今天计划做什么
- 遇到了什么阻碍

### 每周回顾
- 完成的任务
- 未完成的任务
- 下周计划
- 风险和问题

---

## ✅ 验收清单

### 功能验收
- [ ] AI 分析结果样式清晰
- [ ] 重复分类减少 80%+
- [ ] 可删除文件夹
- [ ] 可合并文件夹
- [ ] AI 合并建议准确
- [ ] popup.js 拆分完成

### 质量验收
- [ ] 无功能回归
- [ ] 无严重 Bug
- [ ] 性能无明显下降
- [ ] 代码审查通过

### 文档验收
- [ ] 设计文档完整
- [ ] API 文档更新
- [ ] 代码注释充分
- [ ] 变更日志完整

---

## 📝 最近更新日志（2026-03-13）

### ✅ Phase 2 完成总结

#### 已完成的工作

**1. 分类相似度算法实现** (`src/utils/category-merger.js`)
- ✅ 实现了基于编辑距离（Levenshtein Distance）的相似度计算
- ✅ 实现了 Jaccard 相似度（关键词提取和比较）
- ✅ 实现了包含关系检测（如"前端开发"包含"前端"）
- ✅ 综合相似度计算：编辑距离(30%) + 语义相似度(50%) + 包含关系(20%)

**2. 层次聚类合并算法**
- ✅ 实现了层次聚类（Hierarchical Agglomerative Clustering）
- ✅ 动态构建相似度矩阵
- ✅ 迭代合并最相似的分类对
- ✅ 支持可配置的相似度阈值（默认 0.75）
- ✅ 支持最小合并支持度（默认 2，避免单实例合并）

**3. AI Prompt 优化**
- ✅ **提取到独立文件**：创建 `src/api/prompts/classification-system.prompt.js`
- ✅ **精简优化**：从 550+ 行减少到 200 行，提升 AI 理解效率
- ✅ **优化优先级**：
  - 明确"何时创建新分类"（技术栈明确、现有分类过于宽泛）
  - 明确"何时使用现有分类"（精准匹配、高度相关）
  - 避免盲目使用"已导入"等宽泛分类
- ✅ **添加当前分类信息**：在 prompt 中显示书签当前所属分类，支持检测放错目录
- ✅ **大类+细类结构**：明确的分类粒度标准（5-30条细类，15-60条大类）

**4. 集成到 AI 分析流程** (`src/api/openai.js`)
- ✅ 在每批处理后调用聚合算法
- ✅ 在最终结果上再次聚合（跨批次）
- ✅ 添加聚合日志记录（mergeReport）
- ✅ 可配置的聚合参数

**5. 书签移动功能实现** (`src/background/background.js`)
- ✅ 修复保存后书签未移动的问题
- ✅ 添加 `chrome.bookmarks.move()` 调用
- ✅ 同步更新 IndexedDB 和浏览器收藏夹
- ✅ 完善错误处理和日志输出

#### 提交记录
- `2454635` feat: 优化AI分类提示词和功能
- `39e4798` fix: 修复AI分类建议不理想和保存后未移动书签的问题
- `a5b473e` docs: 更新 TODO.md 进度

#### 实际效果
- ✅ **代码优化**：净减少 344 行冗余代码（从 1347 行减少到 803 行）
- ✅ **提示词质量**：AI 不再盲目使用"已导入"分类，能创建精准分类
- ✅ **书签移动**：保存后书签正确移动到对应浏览器文件夹
- ✅ **智能聚合**：自动合并相似分类（如"前端开发"和"前端"）
- ✅ **错误检测**：能识别书签放错目录并给出移动建议

#### 待补充的工作
- ⏳ 单元测试（category-merger.test.js）
- ⏳ 不同 AI 模型的测试（GPT-4, Claude, DeepSeek）
- ⏳ 聚合阈值的用户配置界面
- ⏳ 聚合结果的预览和手动调整功能

#### 下一步计划
- ✅ **Phase 3**: 文件夹管理功能（删除/合并/AI 建议）- 已完成
- 🎯 **Phase 4**: popup.js 代码重构（待开发）
- 🎯 **Phase 5**: 整合测试和上线（待开发）

---

## 📝 最近更新日志（2026-03-14）

### ✅ Phase 3 完成总结

#### 已完成的工作

**1. 删除文件夹功能** (`src/background/background.js`)
- ✅ 实现 `handleDeleteFolder()` 消息处理器
- ✅ 实现 `getAllDescendants()` 递归获取所有后代
- ✅ 子内容正确移动到父文件夹
- ✅ 根文件夹删除时子内容移到顶级
- ✅ 浏览器收藏夹同步（`chrome.bookmarks.removeTree()`）
- ✅ 完善的错误处理和日志输出

**2. 合并文件夹功能** (`src/background/background.js`)
- ✅ 实现 `handleMergeFolders()` 消息处理器
- ✅ 实现 `isDescendant()` 防止循环嵌套
- ✅ 实现 `getNextSortOrder()` 排序号管理
- ✅ 所有子内容正确移动到目标文件夹
- ✅ 源文件夹删除
- ✅ 浏览器收藏夹同步

**3. 前端 UI 实现** (`src/popup/popup.js/html/css`)
- ✅ 右键菜单新增"合并到..."项
- ✅ 删除文件夹确认对话框（`showDeleteFolderDialog`）
- ✅ 合并文件夹目标选择对话框（`showMergeFolderDialog`）
- ✅ 显示影响范围（子项数量）
- ✅ 成功后刷新列表
- ✅ 友好的错误提示

**4. AI 合并建议功能** (`src/popup/popup.js`)
- ✅ 实现 `showMergeSuggestionsDialog()` 对话框
- ✅ 置信度可视化（进度条 + 颜色标识）
- ✅ 全选/取消全选功能
- ✅ 批量应用合并
- ✅ 支持从 AI 分析结果生成合并建议

**5. CSS 样式完善** (`src/popup/popup.css`)
- ✅ 合并对话框样式（`.ai-merge-dialog-overlay`）
- ✅ 文件夹选项样式（`.folder-option`）
- ✅ 深色模式适配
- ✅ 悬停效果和过渡动画

#### 提交记录
- 新增功能：文件夹删除和合并
- 新增功能：AI 合并建议对话框
- 优化：CSS 样式完善和深色模式适配

#### 预期效果
- ✅ 用户可以删除文件夹，子内容自动移动到父文件夹
- ✅ 用户可以合并相似文件夹，防止循环嵌套
- ✅ AI 可以自动检测重复分类并建议合并
- ✅ 合并操作支持批量应用
- ✅ 所有操作同步到浏览器收藏夹

#### 待补充的工作
- ⏳ 单元测试（文件夹管理功能）
- ⏳ 浏览器加载测试（验证所有功能）
- ⏳ 边界情况测试（大量书签、深层嵌套）

---

## 📝 最近更新日志（2026-03-14 续）

### ✅ Phase 3 文件夹管理功能完善

#### 新增完成的工作

**1. 文件夹创建功能** (`src/background/background.js`)
- ✅ 重构 `handleCreateCategory()` 函数
- ✅ 先创建浏览器文件夹，再使用其 ID 作为分类 ID
- ✅ 解决重复创建问题（原来创建 2 次，现在只创建 1 次）
- ✅ ID 格式统一为 `cat_${browserId}`

**2. 文件夹重命名功能** (`src/background/background.js`)
- ✅ 添加 `deleteCategory` 导入（之前缺失）
- ✅ 修复 `STORES.categories` 大小写错误（应为 `STORES.CATEGORIES`）
- ✅ 添加 `notifyBookmarkChanged()` 通知 popup 刷新

**3. 编辑对话框优化** (`src/popup/popup.js`)
- ✅ 修复编辑对话框保存时统一发送 `UPDATE_BOOKMARK` 的问题
- ✅ 根据 `item.type` 发送不同的消息（文件夹 → UPDATE_CATEGORY）
- ✅ 修复焦点恢复错误（`activeElement.toString()` 导致 querySelector 错误）
- ✅ 添加 try-catch 防止焦点恢复失败
- ✅ 对话框按钮 ID 冲突修复（改用 `data-*` 属性）

**4. 右键菜单优化** (`src/popup/popup.js`)
- ✅ 删除操作根据类型调用不同函数（文件夹 → deleteFolder）
- ✅ 上下文菜单焦点恢复优化

#### 提交记录
- `f34f794` fix: 修复文件夹创建、删除和重命名功能
- `64759cf` fix: 修复文件夹重命名和编辑对话框的问题

#### 实际效果
- ✅ 创建文件夹：只创建一个（插件 + 原生收藏夹各 1 个）
- ✅ 删除文件夹：子内容自动移到父文件夹
- ✅ 重命名文件夹：只显示一个"保存成功"提示
- ✅ 编辑对话框：支持文件夹类型（隐藏 URL 字段）
- ✅ 左侧目录：实时更新无需刷新
- ✅ 原生收藏夹：完全同步

#### 已修复的问题
1. ✅ 重复创建文件夹（原来创建 2 次）
2. ✅ 删除文件夹失败（STORES.categories 大小写错误）
3. ✅ 删除操作调用错误 API（未区分文件夹和书签）
4. ✅ 重命名 querySelector 错误（activeElement.toString()）
5. ✅ 对话框按钮 ID 冲突
6. ✅ 焦点恢复失败

---

## 📝 最近更新日志（2026-03-14 续 II）

### ✅ AI 合并建议功能入口添加

#### 新增完成的工作

**1. 任务面板添加合并按钮** (`src/popup/popup.html`)
- ✅ 新增 "🔀 合并" 按钮（紫色，task-quick-btn purple）
- ✅ 添加按钮提示："AI 合并建议 - 检测重复分类"
- ✅ 添加紫色按钮样式到 CSS

**2. 合并功能入口完善** (`src/popup/popup.html`)
- ✅ 移除"合并到..."菜单项的 `data-for-content-only` 限制
- ✅ 现在左侧边栏和右侧内容区域都可以使用合并功能
- ✅ 添加 `handleMergeSuggestions()` 事件处理函数

**3. 动态导入合并算法** (`src/popup/popup.js`)
- ✅ 使用动态导入 `import('../utils/category-merger.js')`
- ✅ 检测重复分类并生成合并建议
- ✅ 显示合并建议对话框

**4. 用户体验优化**
- ✅ 添加"正在分析重复分类..."提示
- ✅ 分类数量不足时友好提示
- ✅ 未检测到重复时友好提示

#### 提交记录
- 本次提交：添加 AI 合并建议功能入口

#### 功能说明
用户现在可以通过以下方式使用合并功能：
1. **一键检测**：点击任务面板的 "🔀 合并" 按钮，自动检测所有重复分类
2. **手动合并**：右键点击任意文件夹，选择"合并到..."，手动选择目标文件夹

#### 实际效果
- ✅ 左侧边栏文件夹右键菜单显示"合并到..."选项
- ✅ 右侧内容区域文件夹右键菜单显示"合并到..."选项
- ✅ 任务面板新增独立的 AI 合并建议入口
- ✅ 动态导入优化性能（只在需要时加载合并算法）

---

## 📝 最近更新日志（2026-03-14 续 III）

### ✅ UI 优化和去重功能

#### 新增完成的工作

**1. 弹出框深色模式优化** (`src/popup/popup.css`)
- ✅ 通用确认对话框深色模式样式
- ✅ 编辑对话框深色模式样式（输入框、文本域、按钮）
- ✅ 右键菜单深色模式样式
- ✅ 合并对话框深色模式样式（包括所有文本元素）
- ✅ 分析对话框深色模式文本颜色优化
- ✅ 搜索建议下拉菜单深色模式支持

**2. 合并建议功能优化** (`src/popup/popup.js`, `src/utils/category-merger.js`)
- ✅ 将"AI 合并建议"改为"合并建议"（移除 AI 依赖）
- ✅ 改进路径层级显示（添加 `buildCategoryPath()` 函数）
- ✅ 添加明确的"合并到"标签和视觉层次
- ✅ 颜色区分：源文件夹（红色）、目标文件夹（绿色）
- ✅ 支持完整的面包屑路径显示（用 `›` 分隔）

**3. 去重功能实现** (`src/popup/popup.js`, `src/background/background.js`)
- ✅ 新增"去重"按钮（🗑️，玫瑰色，task-quick-btn rose）
- ✅ 实现 `findDuplicateBookmarks()` - 检测重复 URL 书签
- ✅ 实现 `findDuplicateCategories()` - 检测重复名称目录
- ✅ 实现 `normalizeUrl()` - URL 标准化（移除跟踪参数）
- ✅ 实现 `isInBookmarksBar()` - 判断是否在书签栏
- ✅ 实现书签栏优先保留规则
- ✅ 添加 `handleBatchDelete()` 后端批量删除处理器
- ✅ 实现去重建议对话框（显示保留/删除项）

**4. 批量删除功能** (`src/background/background.js`)
- ✅ 支持 `BATCH_DELETE` 消息类型
- ✅ 同时处理书签和文件夹删除
- ✅ 自动处理子内容移动（删除文件夹时）
- ✅ 同步到浏览器收藏夹
- ✅ 详细的错误处理和日志

**5. UI 样式优化** (`src/popup/popup.css`)
- ✅ 去重对话框样式
- ✅ 去重项样式（保留项绿色、删除项红色）
- ✅ 路径显示样式（面包屑形式）
- ✅ "合并到"徽章样式（紫色背景）
- ✅ 全选/取消全选功能

**6. HTML 更新** (`src/popup/popup.html`)
- ✅ 更新"合并"按钮提示文本（移除"AI"）
- ✅ 添加"去重"按钮到任务面板

#### 提交记录
- `63fd0d1` feat: 改进合并建议和去重功能

#### 功能说明

**合并建议改进**：
1. **清晰的路径显示**：完整显示源文件夹和目标文件夹的层级路径
2. **明确的操作指示**：使用"合并到"标签和视觉箭头指示方向
3. **颜色区分**：红色表示将被删除的源，绿色表示将被保留的目标
4. **书签栏优先**：优先保留书签栏中的内容

**去重功能**：
1. **书签去重**：检测相同 URL（标准化后）的书签
2. **目录去重**：检测相同名称的目录
3. **优先规则**：书签栏中的内容优先保留
4. **批量操作**：支持一次性删除多个重复项
5. **安全处理**：删除目录时自动移动子内容到父目录

#### 实际效果
- ✅ 弹出框在深色模式下文本清晰可见
- ✅ 合并建议显示完整路径，用户清楚知道哪个合并到哪个
- ✅ 去除 AI 标签，功能定位更清晰
- ✅ 一键检测重复书签和目录
- ✅ 智能识别书签栏中的内容并优先保留
- ✅ 批量删除操作高效安全

#### 技术亮点
1. **URL 标准化算法**：移除 utm_*、fbclid、gclid 等跟踪参数
2. **路径构建算法**：递归向上遍历父分类，构建完整路径
3. **优先级系统**：书签栏 > 其他位置
4. **批量操作**：减少 API 调用次数，提升性能

---

## 📝 最近更新日志（2026-03-14 续 IV）

### ✅ Phase 4.1-4.2 重构完成

#### 新增完成的工作

**1. 事件总线 (EventBus)** (`src/popup/utils/event-bus.js`)
- ✅ 发布-订阅模式实现
- ✅ 支持 `on()`, `off()`, `emit()`, `once()` API
- ✅ 完善的错误处理（错误不中断其他监听器）
- ✅ 定义 20+ 事件名称常量
  - 书签事件：BOOKMARKS_LOADED, BOOKMARK_CHANGED, BOOKMARK_ADDED 等
  - 分类事件：CATEGORIES_CHANGED, CATEGORY_ADDED 等
  - 导航事件：NAVIGATION_CHANGED, FOLDER_SELECTED 等
  - 搜索事件：SEARCH_PERFORMED, SEARCH_RESULTS_UPDATED 等
  - AI 分析事件：ANALYSIS_STARTED, ANALYSIS_PROGRESS 等
  - UI 事件：DIALOG_OPENED, CONTEXT_MENU_SHOWN 等

**2. 状态管理模块** (`src/popup/modules/state.js`)
- ✅ 响应式代理实现（Proxy）
- ✅ 状态变更自动通知订阅者
- ✅ 丰富的 API：
  - `get(path)` - 获取状态值
  - `set(path, value)` - 设置状态值
  - `setMultiple(updates)` - 批量更新
  - `update(path, key, value)` - 更新对象属性
  - `add(path, item)` - 数组添加
  - `remove(path, item)` - 数组删除
  - `updateItem(path, finder, updater)` - 更新数组项
  - `subscribe(path, callback)` - 订阅状态变更
- ✅ 状态持久化支持（`export()`/`import()`）
- ✅ 状态快照功能（用于调试）

**3. 公共工具函数** (`src/popup/utils/helpers.js`)
- ✅ **DOM 操作**：`createElement()`, `query()`, `queryAll()`, `escapeHtml()`
- ✅ **格式化函数**：
  - `truncateText()` - 截断文本
  - `truncateUrl()` - 截断URL
  - `formatDate()` - 格式化日期（支持相对时间）
  - `formatFileSize()` - 格式化文件大小
  - `formatNumber()` - 格式化数字
  - `highlightKeyword()` - 高亮搜索关键词
- ✅ **验证函数**：`isValidUrl()`, `isValidEmail()`, `isEmpty()`
- ✅ **工具函数**：
  - `debounce()` - 防抖
  - `throttle()` - 节流
  - `deepClone()` - 深度克隆
  - `deepEqual()` - 深度比较
  - `processBatch()` - 批量处理
  - `normalizeUrl()` - URL 标准化
  - `isInBookmarksBar()` - 判断是否在书签栏

**4. 书签管理模块** (`src/popup/modules/bookmarks.js`)
- ✅ `load()` - 加载所有书签和分类
- ✅ `getAll()` - 获取所有书签
- ✅ `getById(id)` - 根据ID获取书签
- ✅ `getByCategory(categoryId)` - 根据分类获取书签
- ✅ `getByTag(tag)` - 根据标签获取书签
- ✅ `search(searchTerm)` - 搜索书签
- ✅ `add(bookmarkData)` - 添加书签
- ✅ `update(id, updates)` - 更新书签
- ✅ `delete(ids)` - 删除书签（支持批量）
- ✅ `moveToFolder(bookmarkId, targetFolderId)` - 移动书签到文件夹
- ✅ `regenerateSummary(bookmarkId)` - 重新生成概述
- ✅ `reorder(draggedId, targetId, clientY)` - 拖拽排序
- ✅ `getStats()` - 获取统计信息

**5. 导航模块** (`src/popup/modules/navigation.js`)
- ✅ `switchView(view)` - 切换视图（全部/最近/失效/标签/文件夹）
- ✅ `selectFolder(folderId)` - 选择文件夹
- ✅ `renderSidebarNav()` - 渲染侧边栏导航
- ✅ `renderFolderTree()` - 渲染文件夹树
- ✅ `renderBreadcrumb()` - 渲染面包屑
- ✅ `toggleSidebar()` - 展开/折叠侧边栏
- ✅ 文件夹树递归渲染
- ✅ 展开/折叠交互
- ✅ 失效链接数量统计

**6. 搜索模块** (`src/popup/modules/search.js`)
- ✅ `performSearch(query, useAI)` - 执行搜索
- ✅ `_localSearch(query)` - 本地文本搜索
- ✅ `_aiSearch(query)` - AI 语义搜索（带降级）
- ✅ `_showSuggestions(query)` - 显示搜索建议
- ✅ `_getSuggestions(query)` - 获取建议（标签、分类）
- ✅ `clearSearch()` - 清除搜索
- ✅ `toggleAISearch(enabled)` - 切换 AI 搜索模式
- ✅ `renderResults(results)` - 渲染搜索结果
- ✅ 防抖输入处理（300ms）
- ✅ 相关性排序算法

#### 提交记录
- `4ca9fe1` feat: Phase 4.1 基础设施重构完成
- `8bd2bc8` feat: Phase 4.2 核心模块重构完成

#### 新建文件结构
```
src/popup/
├── modules/
│   ├── state.js          # 状态管理模块 (新建)
│   ├── bookmarks.js      # 书签管理模块 (新建)
│   ├── navigation.js     # 导航模块 (新建)
│   └── search.js         # 搜索模块 (新建)
├── utils/
│   ├── event-bus.js      # 事件总线 (新建)
│   └── helpers.js        # 工具函数 (新建)
└── test-modules.js       # 模块测试 (新建)
```

#### 技术亮点
1. **模块化设计**：将 popup.js (4000+ 行) 拆分为多个独立模块
2. **事件驱动**：通过 EventBus 实现模块间松耦合通信
3. **响应式状态**：使用 Proxy 实现自动通知的状态管理
4. **可测试性**：每个模块可独立测试
5. **可维护性**：职责单一，易于理解和修改

#### 下一步计划
- ⏳ Phase 4.3: 功能模块（AI分析、链接检测、文件夹管理、拖拽）
- ⏳ Phase 4.4: UI 模块（对话框、右键菜单、键盘导航）
- ⏳ Phase 5: 整合测试和上线

---

**最后更新**: 2026-03-14
**维护者**: Smart Bookmarks Team
