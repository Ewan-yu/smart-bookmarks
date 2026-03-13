# AI 分析和目录管理功能优化设计文档

**版本**: v1.0
**日期**: 2026-03-13
**作者**: Smart Bookmarks Team
**状态**: 设计中

---

## 一、背景与问题分析

### 1.1 当前问题

#### 问题 1：AI 分析结果样式显示不清楚
**现象**：
- 分类文字描述看不清楚
- 分类对比度不够
- 文字层级不明显

**根因分析**：
- 对话框使用内联样式，缺乏统一的样式系统
- 颜色对比度不符合 WCAG AA 标准（4.5:1）
- 字体大小固定，未考虑用户浏览器缩放
- 滚动区域没有清晰的视觉边界

#### 问题 2：AI 推荐分类不稳定且重复
**现象**：
- 每次分析生成的分类不一致
- 出现语义重复的分类：
  - 系统架构、架构设计、软件架构
  - 前端UI、前端开发
- 分类数量过多（30+ 个），超出用户管理能力

**根因分析**：
1. **批处理问题**：
   - 将书签分批（每批10个）送 AI 分析
   - AI 无法感知全局上下文，每批独立生成分类
   - 不同批次可能生成相似但名称不同的分类

2. **Prompt 指导不足**：
   - 系统提示词虽然要求"优先复用已有分类"
   - 但没有明确的分类聚合和去重规则
   - 缺少分类命名规范和层级结构指导

3. **后处理缺失**：
   - 仅通过 name.toLowerCase() 做简单去重
   - 没有语义相似度聚合
   - 没有分类层级生成（父分类-子分类）

#### 问题 3：缺少目录管理功能
**现状**：
- 无法删除分类文件夹
- 无法合并相似分类
- 删除分类时无法处理子内容的去向

**用户需求**：
1. **删除分类**：删除时子内容上升层级到父文件夹
2. **合并分类**：将多个分类合并为一个
3. **AI 辅助合并**：智能识别重复分类并建议合并

#### 问题 4：popup.js 代码过长（约 3500 行）
**问题**：
- 单文件包含所有业务逻辑
- 功能耦合严重（导航、搜索、拖拽、AI 分析、对话框等混在一起）
- 难以维护和扩展
- 缺少清晰的模块边界

**影响**：
- 新功能开发困难
- Bug 修复容易引入副作用
- 代码审查成本高
- 测试覆盖困难

---

## 二、优化方案设计

### 2.1 AI 分析结果 UI 优化

#### 2.1.1 样式改进

**文件**: `src/popup/popup.css`

**改进点**：
1. **创建独立 CSS 类**，移除内联样式
2. **提升对比度**：
   - 主文本：`#1e293b`（对比度 > 12:1）
   - 次要文本：`#64748b`（对比度 > 7:1）
   - 辅助文本：`#94a3b8`（对比度 > 4.5:1）

3. **字体系统**：
   - 标题：16px / 600
   - 分类名：14px / 600
   - 描述：13px / 400
   - URL：12px / 400

4. **布局改进**：
   - 固定高度对话框（max-height: 80vh）
   - 可滚动内容区域（overflow-y: auto）
   - 清晰的分隔线和间距
   - 进度条可视化

**新增 CSS 类**：
```css
/* AI 分析结果对话框 */
.analysis-dialog {
  max-width: 800px;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}

.analysis-dialog-header {
  padding: 20px 24px;
  border-bottom: 1px solid #e2e8f0;
}

.analysis-dialog-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px 24px;
}

.analysis-category-item {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 12px;
  background: #ffffff;
  transition: all 0.2s;
}

.analysis-category-item:hover {
  border-color: #cbd5e1;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
}

.analysis-category-header {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  gap: 12px;
}

.analysis-category-name {
  font-size: 14px;
  font-weight: 600;
  color: #1e293b;
  flex: 1;
  min-width: 0;
}

.analysis-category-count {
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  white-space: nowrap;
}

.analysis-category-badge {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  font-weight: 500;
  white-space: nowrap;
}

.analysis-category-badge.new {
  background: #dbeafe;
  color: #1d4ed8;
}

.analysis-category-badge.existing {
  background: #f1f5f9;
  color: #64748b;
}

.analysis-bookmark-list {
  padding: 0 16px 12px;
  display: grid;
  gap: 8px;
}

.analysis-bookmark-item {
  padding: 8px 12px;
  background: #f8fafc;
  border-radius: 6px;
  min-width: 0;
}

.analysis-bookmark-title {
  font-size: 13px;
  font-weight: 500;
  color: #334155;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.analysis-bookmark-url {
  font-size: 12px;
  color: #94a3b8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  margin-top: 2px;
}
```

#### 2.1.2 交互改进

**文件**: `src/popup/popup.js`

**改进点**：
1. 添加"全选/取消全选"复选框
2. 支持单个分类启用/禁用
3. 添加分类合并建议（AI 自动检测重复）
4. 支持手动编辑分类名称
5. 显示分类置信度分数（0-1）

**新增 UI 元素**：
- 分类复选框（启用/禁用）
- 置信度指示器（进度条或星星）
- 合并建议提示（"建议与 [系统架构] 合并"）
- 批量操作工具栏

---

### 2.2 AI 分类聚合和去重策略

#### 2.2.1 两阶段分析方案

**核心思想**：
1. **第一阶段**：粗粒度分类（父分类）
   - 每批 10 个书签 → 生成 5-8 个父分类
   - Prompt 强调："生成高层次分类，避免细分"

2. **第二阶段**：细粒度分类（子分类）
   - 在父分类下再分析一次 → 生成子分类
   - 只对书签数 > 20 的父分类进行细分

#### 2.2.2 分类聚合算法

**文件**: `src/utils/category-merger.js`（新建）

**算法流程**：

```javascript
/**
 * 分类聚合器
 */
class CategoryMerger {
  constructor(options = {}) {
    this.similarityThreshold = options.similarityThreshold || 0.75;
    this.minMergeSupport = options.minMergeSupport || 2;
  }

  /**
   * 聚合相似分类
   * @param {Array} categories - AI 生成的分类列表
   * @returns {Array} 聚合后的分类列表
   */
  mergeCategories(categories) {
    // 1. 构建相似度矩阵
    const similarityMatrix = this.buildSimilarityMatrix(categories);

    // 2. 聚类相似分类
    const clusters = this.clusterCategories(categories, similarityMatrix);

    // 3. 合并每个聚类为一个分类
    const mergedCategories = clusters.map(cluster =>
      this.mergeCluster(cluster, categories)
    );

    // 4. 过滤小分类（bookmarkIds < 2）
    return mergedCategories.filter(cat => cat.bookmarkIds.length >= 2);
  }

  /**
   * 构建分类相似度矩阵
   */
  buildSimilarityMatrix(categories) {
    const n = categories.length;
    const matrix = Array(n).fill(null).map(() => Array(n).fill(0));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        matrix[i][j] = this.calculateSimilarity(
          categories[i].name,
          categories[j].name
        );
        matrix[j][i] = matrix[i][j];
      }
    }

    return matrix;
  }

  /**
   * 计算两个分类名称的相似度
   * 组合多种相似度算法
   */
  calculateSimilarity(name1, name2) {
    // 1. 字符串相似度（Levenshtein Distance）
    const editSim = this.editDistanceSimilarity(name1, name2);

    // 2. 语义相似度（关键词提取）
    const semanticSim = this.semanticSimilarity(name1, name2);

    // 3. 包含关系（一个词是另一个的子串）
    const containmentSim = this.containmentSimilarity(name1, name2);

    // 加权组合
    return editSim * 0.3 + semanticSim * 0.5 + containmentSim * 0.2;
  }

  /**
   * 字符串编辑距离相似度
   */
  editDistanceSimilarity(str1, str2) {
    const distance = this.levenshteinDistance(str1, str2);
    const maxLen = Math.max(str1.length, str2.length);
    return 1 - (distance / maxLen);
  }

  /**
   * 语义相似度（基于关键词）
   */
  semanticSimilarity(name1, name2) {
    const keywords1 = this.extractKeywords(name1);
    const keywords2 = this.extractKeywords(name2);

    // Jaccard 相似度
    const intersection = keywords1.filter(k => keywords2.includes(k));
    const union = [...new Set([...keywords1, ...keywords2])];

    return union.length > 0 ? intersection.length / union.length : 0;
  }

  /**
   * 提取关键词（分词）
   */
  extractKeywords(text) {
    // 简单分词：按空格、常见分隔符拆分
    const segments = text.split(/[\s\-、，,\/]+/);
    // 过滤停用词
    const stopWords = ['的', '和', '与', '及', '或', '等', 'for', 'and', 'or'];
    return segments.filter(s => s.length > 0 && !stopWords.includes(s));
  }

  /**
   * 包含关系相似度
   */
  containmentSimilarity(name1, name2) {
    const n1 = name1.toLowerCase();
    const n2 = name2.toLowerCase();

    if (n1.includes(n2) || n2.includes(n1)) {
      return 0.9;
    }
    return 0;
  }

  /**
   * Levenshtein 距离算法
   */
  levenshteinDistance(str1, str2) {
    const m = str1.length;
    const n = str2.length;
    const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1];
        } else {
          dp[i][j] = Math.min(
            dp[i - 1][j] + 1,
            dp[i][j - 1] + 1,
            dp[i - 1][j - 1] + 1
          );
        }
      }
    }

    return dp[m][n];
  }

  /**
   * 层次聚类合并相似分类
   */
  clusterCategories(categories, similarityMatrix) {
    const n = categories.length;
    const clusters = Array.from({ length: n }, (_, i) => [i]);
    const merged = Array(n).fill(false);

    let changed = true;
    while (changed) {
      changed = false;
      for (let i = 0; i < n; i++) {
        if (merged[i]) continue;
        for (let j = i + 1; j < n; j++) {
          if (merged[j]) continue;
          if (similarityMatrix[i][j] >= this.similarityThreshold) {
            // 合并聚类 i 和 j
            const clusterI = clusters.find(c => c.includes(i));
            const clusterJ = clusters.find(c => c.includes(j));
            if (clusterI !== clusterJ) {
              clusterI.push(...clusterJ);
              const index = clusters.indexOf(clusterJ);
              clusters.splice(index, 1);
              merged[j] = true;
              changed = true;
            }
          }
        }
      }
    }

    return clusters;
  }

  /**
   * 合并聚类为一个分类
   */
  mergeCluster(clusterIndices, categories) {
    const clusterCategories = clusterIndices.map(i => categories[i]);

    // 选择最短的名字作为最终名称（通常最精确）
    const names = clusterCategories.map(c => c.name);
    const finalName = names.reduce((a, b) => a.length <= b.length ? a : b);

    // 合并所有 bookmarkIds
    const allBookmarkIds = clusterCategories.flatMap(c => c.bookmarkIds);
    const uniqueBookmarkIds = [...new Set(allBookmarkIds)];

    // 平均置信度
    const avgConfidence = clusterCategories.reduce(
      (sum, c) => sum + (c.confidence || 0.5),
      0
    ) / clusterCategories.length;

    // 生成合并报告
    const mergedFrom = names.filter(n => n !== finalName);

    return {
      name: finalName,
      confidence: avgConfidence,
      bookmarkIds: uniqueBookmarkIds,
      isNew: clusterCategories.some(c => c.isNew),
      mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
      _mergeInfo: {
        originalCount: clusterCategories.length,
        originalNames: names
      }
    };
  }
}

export default CategoryMerger;
```

#### 2.2.3 优化后的 Prompt

**文件**: `src/api/openai.js`

**改进点**：
1. 强调分类命名规范
2. 要求生成层级结构
3. 限制分类数量
4. 提供分类示例

**新增系统 Prompt**：

```javascript
function getSystemPrompt() {
  return `你是专业的收藏夹分类助手。根据标题、URL特征和页面摘要将收藏分类。

## 分类原则

### 1. 命名规范
- 使用简洁的中文名称（2-6字）
- 避免使用"的"、"和"、"与"等虚词
- 优先使用行业标准术语
- 例如："后端开发"（而非"后端的开发技术"）

### 2. 层级结构
- 生成 2-3 层分类结构
- 第一层：领域分类（如"前端开发"、"后端开发"）
- 第二层：技术分类（如"React"、"Vue"）
- 第三层：主题分类（如"组件库"、"状态管理"）

### 3. 数量控制
- 每批书签生成 5-10 个第一层分类
- 每个分类至少包含 2 条收藏
- 避免过度细分

### 4. 优先复用
- 优先使用已有分类名称
- 已有分类：${existingCategories.join('、')}

### 5. 语义去重
- 避免生成语义重复的分类
- 例如：有了"系统架构"就不要再生成"架构设计"
- 例如：有了"前端开发"就不要再生成"前端UI"

## 输出格式

严格返回 JSON，不要添加任何解释：

\`\`\`json
{
  "categories": [
    {
      "name": "分类名称",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "subcategories": [
        {
          "name": "子分类名称",
          "bookmarkIds": ["id1"]
        }
      ]
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
\`\`\`

## 注意事项
- bookmarkIds 必须使用输入中 [ID:xxx] 的 xxx 值
- 一条收藏可属于多个分类
- confidence 范围 0-1，表示分类置信度
`;
}
```

#### 2.2.4 实施流程

**文件**: `src/api/openai.js`

**修改 `analyzeBookmarks` 函数**：

```javascript
export async function analyzeBookmarks(
  config,
  bookmarks,
  existingCategories = [],
  options = {}
) {
  // ... 现有代码 ...

  // 新增：聚合去重
  const categoryMerger = new CategoryMerger({
    similarityThreshold: 0.75,
    minMergeSupport: 2
  });

  // 每批处理后立即聚合
  for (let i = startBatchIndex; i < batches.length; i++) {
    // ... API 调用 ...

    // 新增：聚合当前批次结果
    const mergedCategories = categoryMerger.mergeCategories(
      validatedParsed.categories
    );

    mergeBatch(mergedCategories, validatedParsed.tags);
  }

  // 最终再聚合一次全局结果
  const finalCategories = categoryMerger.mergeCategories(
    Array.from(allCategories.values())
  );

  return {
    categories: finalCategories,
    tags: allTags,
    summary,
    batchLogs
  };
}
```

---

### 2.3 目录删除和合并功能

#### 2.3.1 功能设计

**新增功能**：
1. **删除分类**：
   - 右键菜单 → "删除分类"
   - 弹出确认对话框，显示影响范围
   - 子书签自动移动到父文件夹
   - 如果是根分类，子书签移动到"未分类"

2. **合并分类**：
   - 右键菜单 → "合并到..."
   - 显示目标分类选择器
   - 合并后源分类删除，内容归入目标分类

3. **AI 辅助合并**：
   - 分析完成后，自动检测重复分类
   - 显示合并建议对话框
   - 用户一键确认或手动调整

#### 2.3.2 UI 设计

**右键菜单新增项**：

```html
<!-- 文件夹右键菜单 -->
<div class="ctx-menu">
  <button class="ctx-item" data-action="openFolder">打开文件夹</button>
  <div class="ctx-separator"></div>
  <button class="ctx-item" data-action="mergeFolder">合并到...</button>
  <button class="ctx-item danger" data-action="deleteFolder">删除分类</button>
  <div class="ctx-separator"></div>
  <button class="ctx-item" data-action="aiMergeSuggestions">AI 合并建议</button>
</div>
```

**合并对话框 UI**：

```javascript
/**
 * 显示合并分类对话框
 */
function showMergeFolderDialog(sourceFolder) {
  // 获取所有同级文件夹作为目标
  const siblings = state.bookmarks.filter(bm =>
    bm.type === 'folder' &&
    bm.parentId === sourceFolder.parentId &&
    bm.id !== sourceFolder.id
  );

  const dialog = document.createElement('div');
  dialog.className = 'dialog-overlay merge-dialog-overlay';

  dialog.innerHTML = `
    <div class="dialog merge-dialog">
      <div class="dialog-header">
        <h2>合并分类</h2>
        <button class="dialog-close" id="dialogClose">×</button>
      </div>
      <div class="dialog-body">
        <p style="margin-bottom: 16px;">
          将 <strong>${escapeHtml(sourceFolder.title)}</strong> 合并到：
        </p>
        <div class="folder-list" style="max-height: 300px; overflow-y: auto;">
          ${siblings.map(folder => `
            <label class="folder-option">
              <input type="radio" name="targetFolder" value="${folder.id}">
              <span class="folder-icon">📁</span>
              <span class="folder-name">${escapeHtml(folder.title)}</span>
              <span class="folder-count">(${folder.childCount || 0} 项)</span>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" id="dialogCancel">取消</button>
        <button class="btn btn-primary" id="dialogConfirm">合并</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // 事件处理...
}
```

**AI 合并建议对话框**：

```javascript
/**
 * 显示 AI 合并建议对话框
 */
function showAIMergeSuggestions(mergeSuggestions) {
  // mergeSuggestions 格式：
  // [
  //   { source: '系统架构', target: '架构设计', confidence: 0.92 },
  //   { source: '前端UI', target: '前端开发', confidence: 0.89 }
  // ]

  const dialog = document.createElement('div');
  dialog.className = 'dialog-overlay ai-merge-dialog-overlay';

  dialog.innerHTML = `
    <div class="dialog ai-merge-dialog">
      <div class="dialog-header">
        <h2>🤖 AI 合并建议</h2>
        <button class="dialog-close" id="dialogClose">×</button>
      </div>
      <div class="dialog-body">
        <p style="margin-bottom: 16px;">
          检测到 ${mergeSuggestions.length} 组重复分类，建议合并：
        </p>
        <div class="merge-suggestions-list">
          ${mergeSuggestions.map((suggestion, index) => `
            <label class="merge-suggestion-item">
              <input type="checkbox" checked data-index="${index}">
              <div class="suggestion-content">
                <div class="suggestion-source">
                  <span class="source-name">${escapeHtml(suggestion.source)}</span>
                  <span class="merge-arrow">→</span>
                  <span class="target-name">${escapeHtml(suggestion.target)}</span>
                </div>
                <div class="suggestion-confidence">
                  置信度：${Math.round(suggestion.confidence * 100)}%
                </div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" id="dialogCancel">取消</button>
        <button class="btn btn-primary" id="dialogConfirm">
          应用选中合并 (${mergeSuggestions.length})
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // 事件处理...
}
```

#### 2.3.3 后端实现

**文件**: `src/background/background.js`

**新增消息处理器**：

```javascript
/**
 * 删除分类文件夹
 */
async function handleDeleteFolder(request, sendResponse) {
  try {
    const { folderId } = request;

    await initDatabase();

    // 1. 获取文件夹信息
    const folder = await db.getBookmark(folderId);
    if (!folder || folder.type !== 'folder') {
      sendResponse({ error: '文件夹不存在' });
      return;
    }

    // 2. 获取所有子书签和子文件夹
    const allChildren = await getAllDescendants(folderId);

    // 3. 确定目标父文件夹
    const targetParentId = folder.parentId || null;

    // 4. 移动所有子内容到父文件夹
    for (const child of allChildren) {
      await db.updateBookmark(child.id, {
        parentId: targetParentId,
        sortOrder: getNextSortOrder(targetParentId)
      });
    }

    // 5. 删除文件夹
    await db.deleteBookmark(folderId);

    // 6. 同步到浏览器收藏夹
    await syncToBrowser();

    sendResponse({ success: true });
  } catch (error) {
    console.error('Delete folder failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 合并文件夹
 */
async function handleMergeFolders(request, sendResponse) {
  try {
    const { sourceId, targetId } = request;

    await initDatabase();

    // 1. 验证源和目标都是文件夹
    const [source, target] = await Promise.all([
      db.getBookmark(sourceId),
      db.getBookmark(targetId)
    ]);

    if (!source || source.type !== 'folder') {
      sendResponse({ error: '源文件夹不存在' });
      return;
    }
    if (!target || target.type !== 'folder') {
      sendResponse({ error: '目标文件夹不存在' });
      return;
    }

    // 2. 检查是否会造成循环嵌套
    if (await isDescendant(targetId, sourceId)) {
      sendResponse({ error: '不能将文件夹合并到其子文件夹' });
      return;
    }

    // 3. 获取源文件夹的所有子内容
    const allChildren = await getAllDescendants(sourceId);

    // 4. 移动所有子内容到目标文件夹
    for (const child of allChildren) {
      await db.updateBookmark(child.id, {
        parentId: targetId,
        sortOrder: getNextSortOrder(targetId)
      });
    }

    // 5. 删除源文件夹
    await db.deleteBookmark(sourceId);

    // 6. 同步到浏览器收藏夹
    await syncToBrowser();

    sendResponse({
      success: true,
      movedCount: allChildren.length
    });
  } catch (error) {
    console.error('Merge folders failed:', error);
    sendResponse({ error: error.message });
  }
}

/**
 * 获取所有后代（递归）
 */
async function getAllDescendants(folderId) {
  const children = await db.getBookmarksByParent(folderId);
  const allDescendants = [...children];

  for (const child of children) {
    if (child.type === 'folder') {
      const subChildren = await getAllDescendants(child.id);
      allDescendants.push(...subChildren);
    }
  }

  return allDescendants;
}

/**
 * 检查是否是后代（防止循环嵌套）
 */
async function isDescendant(ancestorId, descendantId) {
  let current = await db.getBookmark(descendantId);
  while (current && current.parentId) {
    if (current.parentId === ancestorId) return true;
    current = await db.getBookmark(current.parentId);
  }
  return false;
}

/**
 * 获取下一个排序号
 */
async function getNextSortOrder(parentId) {
  const siblings = await db.getBookmarksByParent(parentId);
  const maxOrder = Math.max(...siblings.map(s => s.sortOrder || 0), 0);
  return maxOrder + 1;
}
```

**注册消息处理器**：

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ... 现有代码 ...

  switch (request.type) {
    // ... 现有 case ...

    case 'DELETE_FOLDER':
      handleDeleteFolder(request, sendResponse);
      return true;

    case 'MERGE_FOLDERS':
      handleMergeFolders(request, sendResponse);
      return true;
  }
});
```

#### 2.3.4 前端调用

**文件**: `src/popup/popup.js`

**新增函数**：

```javascript
/**
 * 删除分类文件夹
 */
async function deleteFolder(folder) {
  const dialog = new ConfirmDialog({
    title: '确认删除分类',
    message: `删除 "${folder.title}" 后，其中的 ${folder.childCount || 0} 项内容将移动到上级文件夹。确定要删除吗？`,
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_FOLDER',
          folderId: folder.id
        });

        if (response.error) throw new Error(response.error);

        Toast.success('分类已删除');
        await loadBookmarks();
      } catch (error) {
        console.error('Delete folder failed:', error);
        Toast.error(`删除失败: ${error.message}`);
      }
    }
  });

  dialog.show();
}

/**
 * 合并文件夹
 */
async function mergeFolders(sourceFolder, targetFolder) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'MERGE_FOLDERS',
      sourceId: sourceFolder.id,
      targetId: targetFolder.id
    });

    if (response.error) throw new Error(response.error);

    Toast.success(`已合并 ${response.movedCount} 项内容`);
    await loadBookmarks();
  } catch (error) {
    console.error('Merge folders failed:', error);
    Toast.error(`合并失败: ${error.message}`);
  }
}
```

---

### 2.4 popup.js 重构方案

#### 2.4.1 模块划分

**当前问题**：
- `popup.js` 约 3500 行，包含所有功能
- 功能耦合严重

**重构目标**：
- 按功能域拆分为独立模块
- 每个模块负责一个明确的职责
- 通过事件总线通信

**新模块结构**：

```
src/popup/
  ├── popup.js          # 主入口（~200 行）
  ├── popup.html        # UI 结构
  ├── popup.css         # 样式
  ├── modules/
  │   ├── state.js          # 全局状态管理（~150 行）
  │   ├── bookmarks.js      # 书签数据管理（~400 行）
  │   ├── navigation.js     # 侧边栏导航（~300 行）
  │   ├── search.js         # 搜索功能（~400 行）
  │   ├── drag-drop.js      # 拖拽排序（~300 行）
  │   ├── ai-analysis.js    # AI 分析功能（~400 行）
  │   ├── link-checker.js   # 链接检测（~300 行）
  │   ├── dialog.js         # 对话框管理（~300 行）
  │   ├── context-menu.js   # 右键菜单（~200 行）
  │   ├── folder-manager.js # 文件夹管理（~300 行）
  │   └── keyboard-nav.js   # 键盘导航（~200 行）
  └── utils/
      ├── event-bus.js      # 事件总线（~100 行）
      ├── storage.js        # 本地存储（~100 行）
      └── helpers.js        # 辅助函数（~200 行）
```

#### 2.4.2 模块职责

**1. popup.js（主入口）**
- 初始化所有模块
- 协调模块间通信
- 全局错误处理

**2. state.js（状态管理）**
- 集中管理应用状态
- 提供状态读取和更新接口
- 状态变更通知

**3. bookmarks.js（书签管理）**
- 书签数据 CRUD
- 书签树构建
- 书签同步

**4. navigation.js（导航）**
- 侧边栏导航切换
- 面包屑导航
- 文件夹树渲染

**5. search.js（搜索）**
- 本地搜索
- AI 搜索
- 搜索结果渲染
- 搜索建议

**6. drag-drop.js（拖拽）**
- 拖拽排序
- 拖拽移动到文件夹
- 拖拽视觉反馈

**7. ai-analysis.js（AI 分析）**
- AI 分析启动
- 进度显示
- 结果确认对话框
- 分类应用

**8. link-checker.js（链接检测）**
- 失效链接检测
- 检测进度显示
- 检测结果展示

**9. dialog.js（对话框）**
- 编辑对话框
- 删除确认
- 合并对话框
- 通用对话框组件

**10. context-menu.js（右键菜单）**
- 菜单显示/隐藏
- 菜单项动态生成
- 菜单操作处理

**11. folder-manager.js（文件夹管理）**
- 文件夹删除
- 文件夹合并
- AI 合并建议

**12. keyboard-nav.js（键盘导航）**
- 键盘事件监听
- 焦点管理
- 快捷键处理

#### 2.4.3 事件总线设计

**文件**: `src/popup/utils/event-bus.js`

```javascript
/**
 * 简单的事件总线
 */
class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * 订阅事件
   */
  on(eventName, callback) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push(callback);
  }

  /**
   * 取消订阅
   */
  off(eventName, callback) {
    if (!this.events[eventName]) return;
    this.events[eventName] = this.events[eventName].filter(cb => cb !== callback);
  }

  /**
   * 触发事件
   */
  emit(eventName, data) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Event handler error for ${eventName}:`, error);
      }
    });
  }

  /**
   * 一次性订阅
   */
  once(eventName, callback) {
    const wrapper = (data) => {
      callback(data);
      this.off(eventName, wrapper);
    };
    this.on(eventName, wrapper);
  }
}

// 创建全局事件总线实例
export const eventBus = new EventBus();

// 事件名称常量
export const Events = {
  // 书签事件
  BOOKMARKS_LOADED: 'bookmarks:loaded',
  BOOKMARK_CHANGED: 'bookmark:changed',
  BOOKMARK_DELETED: 'bookmark:deleted',

  // 导航事件
  NAVIGATION_CHANGED: 'navigation:changed',
  FOLDER_EXPANDED: 'folder:expanded',
  FOLDER_COLLAPSED: 'folder:collapsed',

  // 搜索事件
  SEARCH_STARTED: 'search:started',
  SEARCH_COMPLETED: 'search:completed',
  SEARCH_CLEARED: 'search:cleared',

  // AI 分析事件
  ANALYSIS_STARTED: 'analysis:started',
  ANALYSIS_PROGRESS: 'analysis:progress',
  ANALYSIS_COMPLETED: 'analysis:completed',
  ANALYSIS_FAILED: 'analysis:failed',

  // 链接检测事件
  CHECK_STARTED: 'check:started',
  CHECK_PROGRESS: 'check:progress',
  CHECK_COMPLETED: 'check:completed',

  // 对话框事件
  DIALOG_OPENED: 'dialog:opened',
  DIALOG_CLOSED: 'dialog:closed',

  // 文件夹管理事件
  FOLDER_DELETED: 'folder:deleted',
  FOLDERS_MERGED: 'folders:merged',
};
```

#### 2.4.4 重构步骤

**Phase 1: 基础设施（第 1 周）**
1. 创建事件总线
2. 创建状态管理模块
3. 提取公共工具函数

**Phase 2: 核心模块（第 2 周）**
1. 提取书签管理模块
2. 提取导航模块
3. 提取搜索模块

**Phase 3: 功能模块（第 3 周）**
1. 提取 AI 分析模块
2. 提取链接检测模块
3. 提取拖拽模块

**Phase 4: UI 模块（第 4 周）**
1. 提取对话框模块
2. 提取右键菜单模块
3. 提取键盘导航模块

**Phase 5: 整合测试（第 5 周）**
1. 完整回归测试
2. 性能优化
3. 文档更新

---

## 三、实施计划

### 3.1 优先级排序

**P0 - 阻塞问题（立即修复）**：
1. ✅ AI 分析结果样式优化
2. ✅ AI 分类聚合去重

**P1 - 高优先级（本周完成）**：
1. 文件夹删除功能
2. 文件夹合并功能
3. AI 合并建议

**P2 - 中优先级（下周完成）**：
1. popup.js 重构 - Phase 1
2. popup.js 重构 - Phase 2

**P3 - 低优先级（后续迭代）**：
1. popup.js 重构 - Phase 3-5
2. 性能优化
3. 单元测试覆盖

### 3.2 时间估算

| 任务 | 工作量 | 负责人 | 截止日期 |
|------|--------|--------|----------|
| AI 分析结果样式优化 | 0.5 天 | 开发 | D+1 |
| AI 分类聚合算法 | 2 天 | 开发 | D+3 |
| Prompt 优化 | 0.5 天 | 开发 | D+3 |
| 文件夹删除功能 | 1 天 | 开发 | D+4 |
| 文件夹合并功能 | 1 天 | 开发 | D+5 |
| AI 合并建议 | 1.5 天 | 开发 | D+7 |
| popup.js 重构 Phase 1-2 | 3 天 | 开发 | D+10 |
| 集成测试 | 1 天 | QA | D+11 |
| Bug 修复和优化 | 1 天 | 开发 | D+12 |

**总计**: 约 12 个工作日

### 3.3 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| AI 聚合算法效果不佳 | 高 | 中 | 提供手动合并功能作为兜底 |
| 重构引入新 Bug | 高 | 中 | 充分的回归测试 |
| 用户不习惯新分类方式 | 中 | 低 | 保留原有功能，逐步引导 |
| 性能下降 | 中 | 低 | 性能基准测试和优化 |

---

## 四、测试计划

### 4.1 功能测试

**AI 分析优化**：
- [ ] 分类数量控制在 5-15 个
- [ ] 重复分类减少 80% 以上
- [ ] 分析结果对话框样式清晰
- [ ] 支持手动启用/禁用分类

**文件夹管理**：
- [ ] 删除文件夹，子内容正确移动
- [ ] 删除根文件夹，子内容移到"未分类"
- [ ] 合并文件夹，内容正确归并
- [ ] 防止循环嵌套合并
- [ ] AI 合并建议准确率 > 85%

**重构验证**：
- [ ] 所有现有功能正常工作
- [ ] 无功能回归
- [ ] 性能无明显下降

### 4.2 性能测试

- AI 分析耗时：100 个书签 < 30 秒
- 页面加载时间：< 500ms
- 渲染性能：滚动流畅（> 60fps）

### 4.3 兼容性测试

- Chrome 120+
- Edge 120+
- 不同分辨率（1920x1080, 1366x768, 2560x1440）

---

## 五、上线计划

### 5.1 灰度发布

1. **内测**（D+13）：开发团队内部测试
2. **小范围测试**（D+15）：5-10 个用户
3. **逐步放量**（D+17）：根据反馈调整
4. **全量发布**（D+20）：稳定后全量

### 5.2 用户引导

1. 更新文档和帮助中心
2. 添加首次使用引导（Tooltip）
3. 提供视频教程

### 5.3 监控指标

- AI 分析使用率
- 分类删除/合并使用率
- 用户反馈和满意度
- 错误日志和崩溃率

---

## 六、后续优化方向

### 6.1 短期（1-2 个月）

1. **智能分类建议**
   - 基于用户历史行为推荐分类
   - 自动识别重复内容

2. **批量操作**
   - 批量移动书签到分类
   - 批量编辑标签

3. **分类模板**
   - 预设常见分类体系（技术、设计、产品等）
   - 用户自定义模板

### 6.2 中期（3-6 个月）

1. **AI 能力增强**
   - 多模态理解（网页截图分析）
   - 语义搜索（向量数据库）
   - 智能推荐（根据阅读习惯）

2. **协作功能**
   - 分类共享
   - 团队收藏夹

3. **数据统计**
   - 分类使用统计
   - 访问频率分析
   - 可视化报表

### 6.3 长期（6+ 个月）

1. **知识图谱**
   - 构建书签关系网络
   - 智能关联推荐

2. **自动整理**
   - 定期自动归类
   - 过期内容清理

3. **跨平台同步**
   - 多设备同步
   - 移动端支持

---

## 附录

### A. 相关文档

- [需求设计说明书](./需求设计说明书.md)
- [AI 分类设计文档](./AI分类设计文档.md)
- [数据库设计](./database-schema.md)

### B. API 参考

#### 新增消息类型

```javascript
// 删除文件夹
{
  type: 'DELETE_FOLDER',
  folderId: string
}

// 合并文件夹
{
  type: 'MERGE_FOLDERS',
  sourceId: string,
  targetId: string
}

// 获取合并建议
{
  type: 'GET_MERGE_SUGGESTIONS',
  categories: Array<Category>
}
```

### C. 配置项

**新增配置**：

```javascript
// AI 分析配置
{
  similarityThreshold: 0.75,  // 相似度阈值
  minMergeSupport: 2,         // 最小合并支持数
  enableAIMerge: true,        // 启用 AI 合并建议
  maxCategories: 15           // 最大分类数
}
```

---

**文档版本**: v1.0
**最后更新**: 2026-03-13
**维护者**: Smart Bookmarks Team
