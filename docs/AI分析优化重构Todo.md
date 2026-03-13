# AI 分析优化和重构 Todo 计划

**创建日期**: 2026-03-13
**预估总工时**: 12 个工作日
**当前状态**: 🚀 进行中（Phase 2 已完成）

**最新更新**: 2026-03-13
**当前阶段**: Phase 3 - 文件夹管理功能

---

## 📊 项目概览

### 目标
1. ✅ 修复 AI 分析结果样式问题
2. ✅ 实现 AI 分类智能聚合去重
3. ⏳ 新增文件夹删除/合并功能（待开发）
4. ⏳ popup.js 代码重构（待开发）

### 进度概览
- ✅ Phase 1: AI 分析结果样式优化（0.5天）- 已完成
- ✅ Phase 2: AI 分类智能聚合去重（2天）- **已完成**
- ⏳ Phase 3: 文件夹管理功能（2.5天）- 待开发
- ⏳ Phase 4: popup.js 重构（6天）- 待开发
- ⏳ Phase 5: 整合测试和上线（2天）- 待开发

**总体进度**: 约 30% （2.5/8.5 天）

### 成功标准
- [ ] AI 分析结果样式对比度符合 WCAG AA 标准
- [ ] 重复分类减少 80% 以上
- [ ] 分类数量控制在 5-15 个
- [ ] 用户可删除和合并文件夹
- [ ] popup.js 拆分为 12+ 个独立模块
- [ ] 所有现有功能正常工作（无回归）

---

## 🎯 Phase 1: AI 分析结果样式优化（0.5 天）

### 任务列表

#### 1.1 创建 AI 分析对话框 CSS 类
- [ ] 创建独立 CSS 文件 `src/popup/ai-dialog.css`
- [ ] 定义 `.analysis-dialog` 基础样式
- [ ] 定义 `.analysis-category-item` 分类项样式
- [ ] 定义 `.analysis-bookmark-item` 书签项样式
- [ ] 确保颜色对比度符合 WCAG AA 标准（4.5:1）
- [ ] 测试不同浏览器缩放级别（100%, 125%, 150%）

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

## 🎯 Phase 3: 文件夹管理功能（2.5 天）

### 任务列表

#### 3.1 实现删除文件夹后端
- [ ] 实现 `handleDeleteFolder()` 消息处理
- [ ] 实现 `getAllDescendants()` 递归获取后代
- [ ] 实现子内容移动到父文件夹
- [ ] 处理根文件夹删除（移到"未分类"）
- [ ] 同步到浏览器收藏夹
- [ ] 错误处理和回滚

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
- [ ] 删除文件夹，子内容正确移动
- [ ] 根文件夹删除，子内容移到顶级
- [ ] 浏览器收藏夹同步正确
- [ ] 错误处理完善

**负责人**: 开发
**工时**: 4 小时

---

#### 3.2 实现合并文件夹后端
- [ ] 实现 `handleMergeFolders()` 消息处理
- [ ] 实现 `isDescendant()` 防止循环嵌套
- [ ] 实现 `getNextSortOrder()` 排序号管理
- [ ] 移动所有子内容到目标文件夹
- [ ] 删除源文件夹
- [ ] 同步到浏览器收藏夹

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
- [ ] 合并功能正常工作
- [ ] 防止循环嵌套
- [ ] 排序号正确更新
- [ ] 浏览器收藏夹同步

**负责人**: 开发
**工时**: 4 小时

---

#### 3.3 实现删除文件夹 UI
- [ ] 右键菜单添加"删除分类"项
- [ ] 实现删除确认对话框
- [ ] 显示影响范围（子项数量）
- [ ] 调用后端 API
- [ ] 成功后刷新列表
- [ ] 错误提示

**文件**:
- `src/popup/popup.html`
- `src/popup/popup.css`
- `src/popup/popup.js`

**UI 流程**:
1. 右键点击文件夹 → 菜单
2. 点击"删除分类" → 确认对话框
3. 确认 → 调用 API → 刷新

**验收标准**:
- [ ] UI 流程顺畅
- [ ] 确认对话框清晰
- [ ] 错误提示友好

**负责人**: 开发
**工时**: 2 小时

---

#### 3.4 实现合并文件夹 UI
- [ ] 右键菜单添加"合并到..."项
- [ ] 实现合并目标选择对话框
- [ ] 显示同级文件夹列表
- [ ] 显示每个文件夹的子项数量
- [ ] 调用后端 API
- [ ] 成功后刷新列表

**文件**:
- `src/popup/popup.html`
- `src/popup/popup.css`
- `src/popup/popup.js`

**UI 流程**:
1. 右键点击文件夹 → 菜单
2. 点击"合并到..." → 选择对话框
3. 选择目标文件夹 → 确认 → API → 刷新

**验收标准**:
- [ ] 目标选择器清晰
- [ ] 显示文件夹数量
- [ ] 合并操作流畅

**负责人**: 开发
**工时**: 3 小时

---

#### 3.5 实现 AI 合并建议
- [ ] 实现合并建议生成算法
- [ ] 基于相似度阈值推荐合并
- [ ] 实现建议对话框 UI
- [ ] 显示置信度分数
- [ ] 支持全选/取消全选
- [ ] 批量应用合并

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
- [ ] 建议准确率 > 85%
- [ ] 置信度显示准确
- [ ] 批量操作正常

**负责人**: 开发
**工时**: 5 小时

---

#### 3.6 文件夹管理功能测试
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
- 🎯 **Phase 3**: 文件夹管理功能（删除/合并/AI 建议）
- 🎯 **Phase 4**: popup.js 代码重构
- 🎯 **Phase 5**: 整合测试和上线

---

**最后更新**: 2026-03-13
**维护者**: Smart Bookmarks Team
