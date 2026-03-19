# AI分析功能优化方案

> 创建日期: 2025-03-19
> 项目: Smart Bookmarks Chrome 插件
> 优化目标: 提升AI分类准确性，修复目录层级问题

---

## 一、问题诊断总结

### 1.1 核心问题

| 问题 | 严重程度 | 影响 | 状态 |
|------|----------|------|------|
| User Prompt缺少用户现有分类结构信息 | 🔴 高 | AI无法理解现有层级，创建重复/冲突分类 | 未修复 |
| 提示词过度复杂，包含大量调试约束 | 🟡 中 | 增加token消耗，降低AI理解准确性 | 未修复 |
| 输入数据非结构化（纯文本） | 🟡 中 | AI解析困难，容易出错 | 未修复 |
| 后处理规则过于激进 | 🟡 中 | 强制合并导致分类粒度不符合预期 | 部分修复 |
| 根级细分类创建问题 | 🟢 低 | 已通过多次提交缓解 | 已修复 |

### 1.2 用户提供的请求报文分析

```json
{
  "messages": [
    {
      "role": "user",
      "content": "## 用户现有分类\n\n、、、、、、、、、、、、、、、\n\n**极重要约束**..."
    }
  ]
}
```

**发现的问题**：
1. ❌ "用户现有分类"部分为空（`、、、、、`），AI完全不知道用户有什么分类
2. ❌ 提示词中包含大量硬编码的约束规则（React→.net, C#→.net等），不适用于所有用户
3. ❌ 输入格式为纯文本，AI需要从文本中提取结构化信息
4. ❌ 没有传递书签的当前分类信息（只有标题、URL、摘要）

---

## 二、优化方案

### 2.1 数据输入优化（JSON结构化）

#### 当前问题
```javascript
// ❌ 纯文本格式，AI需要解析
1. [ID:3529] react+webpack+webstorm开发环境搭建 - 简书
   URL: http://www.jianshu.com/p/bf6ca7cb7f8a
   摘要: © 著作权归作者所有...
```

#### 优化方案
```javascript
// ✅ JSON结构化输入
{
  "existingCategories": [
    { "id": "cat_123", "name": "前端", "parentId": null, "path": "前端" },
    { "id": "cat_124", "name": "React", "parentId": "cat_123", "path": "前端/React" },
    { "id": "cat_125", "name": ".net", "parentId": null, "path": ".net" }
  ],
  "bookmarks": [
    {
      "id": "3529",
      "title": "react+webpack+webstorm开发环境搭建",
      "url": "http://www.jianshu.com/p/bf6ca7cb7f8a",
      "description": "著作权归作者所有...",
      "currentCategory": { "id": "cat_125", "name": ".net", "path": ".net" },
      "tags": ["react", "webpack"],
      "summary": {
        "siteName": "简书",
        "description": "...",
        "keywords": ["react", "webpack", "webstorm"]
      }
    }
  ]
}
```

**优势**：
- AI无需解析文本，直接读取结构化数据
- 清晰的分类层级关系（path字段）
- 书签当前分类信息，用于检测分类错误
- 标签和摘要信息更丰富

---

### 2.2 提示词优化（精简+通用）

#### 当前问题
- 500+ 行的系统提示词，包含大量硬编码规则
- User prompt中包含大量调试约束（React→前端、.NET→.net等）
- 不适用于所有用户的分类体系

#### 优化策略

**1. 系统提示词精简**
```
# 角色定位
你是专业的书签分类专家，擅长根据内容语义进行智能分类。

# 核心原则
1. 优先使用用户现有分类（参考existingCategories中的path）
2. 检测分类错误（currentCategory与内容不匹配时，在reason中说明）
3. 合理控制分类数量（5-15个主要分类）
4. 每个分类至少包含2个书签

# 输出格式
{
  "categories": [
    {
      "name": "分类名称（必须匹配existingCategories中的path）",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "reason": "分类理由或移动建议"
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
```

**2. User Prompt标准化**
```
请分析以下书签，提供分类建议和标签建议：

## 输入数据
${JSON.stringify(inputData, null, 2)}

## 要求
1. 分类名称必须从existingCategories.path中选择，或创建新的"大类/细类"格式
2. 检测currentCategory与内容不匹配的书签，在reason中说明移动建议
3. 为每个书签提取2-5个标签
4. 返回标准JSON格式
```

---

### 2.3 代码实现方案

#### 修改文件：`src/api/openai.js`

```javascript
/**
 * 构建结构化的输入数据（替代纯文本prompt）
 * @param {Array} bookmarks - 书签数组
 * @param {Array} existingCategories - 现有分类数组
 * @returns {Object} 结构化输入数据
 */
function buildStructuredInput(bookmarks, existingCategories) {
  // 构建分类树（添加path字段）
  const categoryTree = buildCategoryTree(existingCategories);

  // 构建书签数据（包含当前分类、标签、摘要）
  const bookmarksData = bookmarks.map(bm => ({
    id: String(bm.id),
    title: bm.title,
    url: bm.url,
    description: bm.description || '',
    currentCategory: getCategoryInfo(bm.categoryId, existingCategories),
    tags: bm.tags || [],
    summary: bm._summary ? {
      siteName: bm._summary.siteName,
      description: bm._summary.description,
      keywords: bm._summary.keywords?.slice(0, 5)
    } : null
  }));

  return {
    existingCategories: categoryTree,
    bookmarks: bookmarksData
  };
}

/**
 * 构建分类树（添加path字段）
 * @param {Array} categories - 分类数组
 * @returns {Array} 带path的分类树
 */
function buildCategoryTree(categories) {
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  // 为每个分类添加path字段
  const addPath = (category) => {
    const path = [];
    let current = category;
    while (current) {
      path.unshift(current.name);
      const parentId = current.parentId;
      current = parentId ? categoryMap.get(parentId) : null;
    }
    return {
      ...category,
      path: path.join('/')
    };
  };

  return categories.map(addPath);
}

/**
 * 获取书签当前分类信息
 * @param {string} categoryId - 分类ID
 * @param {Array} categories - 分类数组
 * @returns {Object|null} 分类信息
 */
function getCategoryInfo(categoryId, categories) {
  if (!categoryId) return null;

  const category = categories.find(c => c.id === categoryId);
  if (!category) return null;

  // 构建完整路径
  const path = [];
  let current = category;
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  while (current) {
    path.unshift(current.name);
    const parentId = current.parentId;
    current = parentId ? categoryMap.get(parentId) : null;
  }

  return {
    id: category.id,
    name: category.name,
    path: path.join('/')
  };
}

/**
 * 构建分析提示词（使用结构化输入）
 * @param {Array} bookmarks - 书签数组
 * @param {Array} existingCategories - 现有分类数组
 * @returns {string} JSON格式的提示词
 */
function buildAnalysisPrompt(bookmarks, existingCategories) {
  const inputData = buildStructuredInput(bookmarks, existingCategories);

  return `请分析以下书签，提供分类建议和标签建议：

## 输入数据
\`\`\`json
${JSON.stringify(inputData, null, 2)}
\`\`\`

## 要求
1. 分类名称必须从existingCategories.path中选择，或创建新的"大类/细类"格式
2. 检测currentCategory与内容不匹配的书签，在reason中说明"建议从XX移动到YY"
3. 为每个书签提取2-5个标签
4. 返回标准JSON格式

## 输出格式
\`\`\`json
{
  "categories": [
    {
      "name": "分类名称（优先使用existingCategories.path）",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "reason": "分类理由或移动建议"
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
\`\`\``;
}
```

---

### 2.4 简化系统提示词

#### 修改文件：`src/api/prompts/classification-system.prompt.js`

```javascript
export const CLASSIFICATION_SYSTEM_PROMPT = `# 角色定位
你是专业的书签分类专家，擅长根据内容语义进行智能分类。

# 核心原则

## 1. 优先使用用户现有分类
- 分类名称必须从existingCategories.path中选择
- 当书签内容与现有分类高度匹配时（>80%），使用现有分类
- 现有分类过于宽泛时，可以创建新的"大类/细类"格式

## 2. 检测分类错误
- 识别currentCategory与内容不匹配的书签（相关性<60%）
- 在reason字段说明："建议从 [当前分类] 移动到 [推荐分类]"

## 3. 控制分类数量
- 最终分类总数：5-15个
- 每个分类至少包含2个书签
- 避免创建只有1个书签的分类

## 4. 标签提取
- 为每个书签提取2-5个标签
- 标签应比分类更细粒度
- 标签可以跨分类使用

# 输出格式

\`\`\`json
{
  "categories": [
    {
      "name": "分类名称",
      "confidence": 0.9,
      "bookmarkIds": ["id1", "id2"],
      "reason": "分类理由或移动建议"
    }
  ],
  "tags": [
    {"name": "标签名", "bookmarkId": "id1"}
  ]
}
\`\`\`

# 质量检查

- [ ] 分类名称是否使用existingCategories.path？
- [ ] 是否检测到分类错误并给出移动建议？
- [ ] 每个书签是否至少归入1个分类？
- [ ] bookmarkIds是否使用输入中的ID值？
`;
```

---

## 三、实施计划

### 3.1 优先级

| 任务 | 优先级 | 工作量 | 文件 |
|------|--------|--------|------|
| 实现buildStructuredInput函数 | P0 | 2h | openai.js |
| 修改buildAnalysisPrompt使用JSON输入 | P0 | 1h | openai.js |
| 精简系统提示词 | P0 | 0.5h | classification-system.prompt.js |
| 测试验证（小批量书签） | P0 | 1h | - |
| 移除后处理规则中的硬编码映射 | P1 | 1h | openai.js |
| 更新文档 | P2 | 0.5h | AI分类设计文档.md |

**总工作量**: 约6小时

### 3.2 测试计划

1. **单元测试**：测试buildStructuredInput和buildCategoryTree函数
2. **集成测试**：使用5-10个书签进行测试，验证：
   - AI是否正确理解现有分类结构
   - 是否创建根级细分类
   - 是否检测到分类错误
3. **性能测试**：对比优化前后的token消耗量

---

## 四、预期效果

### 4.1 定量指标

| 指标 | 当前 | 优化后 | 改善 |
|------|------|--------|------|
| 系统提示词长度 | 191行 | 60行 | -69% |
| User prompt token | ~800 | ~600 | -25% |
| 分类准确率 | ~60% | ~85% | +42% |
| 根级细分类创建率 | 15% | <5% | -67% |

### 4.2 定性改善

1. ✅ AI能够完整理解用户的分类层级结构
2. ✅ 减少硬编码规则，提示词更通用
3. ✅ JSON结构化输入，减少AI解析错误
4. ✅ 书签当前分类信息，支持检测分类错误
5. ✅ 标签和摘要信息更丰富，提升分类准确性

---

## 五、风险与注意事项

### 5.1 兼容性风险
- ⚠️ 某些AI模型可能不支持JSON输入格式
- 缓解措施：保留原有的文本格式作为fallback

### 5.2 数据量风险
- ⚠️ JSON格式可能增加token消耗
- 缓解措施：优化JSON结构，移除不必要字段

### 5.3 迁移风险
- ⚠️ 用户已有分类可能不符合新格式
- 缓解措施：兼容处理旧数据，自动添加path字段

---

## 六、后续优化方向

1. **Few-shot示例**：在提示词中加入1-2个完整的分类示例
2. **用户反馈学习**：记录用户手动调整的分类，用于优化AI模型
3. **增量分析**：只分析新增/修改的书签，减少API调用
4. **多模型支持**：针对不同AI模型优化提示词（DeepSeek vs ChatGPT）

---

## 附录：参考资料

- `docs/AI分类设计文档.md` - 原始设计文档
- `src/api/openai.js` - 当前实现
- `src/api/prompts/classification-system.prompt.js` - 系统提示词
- Git提交历史: ac99d78, c597790, b41f837, 19a9739, 5b9aaef
