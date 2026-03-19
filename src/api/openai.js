// Smart Bookmarks - OpenAI 兼容 API 调用

import CategoryMerger from '../utils/category-merger.js';
import { CLASSIFICATION_SYSTEM_PROMPT } from './prompts/classification-system.prompt.js';

/**
 * 最大重试次数
 */
const MAX_RETRIES = 3;

/**
 * 重试延迟基数（毫秒）
 */
const RETRY_DELAY_BASE = 1000;

/**
 * 调用 AI 分析收藏（支持断点续分析、逐批回调、取消）
 * @param {Object} config - API 配置
 * @param {Array}  bookmarks - 待分析的收藏列表
 * @param {Array}  existingCategories - 用户已有的分类（作为参考）
 * @param {Object} options
 * @param {number}   [options.batchSize=10]       - 每批分析的书签数
 * @param {Function} [options.onProgress]          - 进度回调 (current, total, message)
 * @param {Function} [options.onBatchComplete]     - 每批完成回调 async (batchIndex, batchLog)
 * @param {Object}   [options.cancelToken]         - 取消令牌 { cancelled: boolean }
 * @param {number}   [options.startBatchIndex=0]  - 从第几批开始（断点续接）
 * @param {Array}    [options.cachedBatches=[]]    - 已缓存的批次结果（仅含 categories/tags/usage）
 * @returns {Promise<{categories, tags, summary, batchLogs}>}
 */
export async function analyzeBookmarks(
  config,
  bookmarks,
  existingCategories = [],
  options = {}
) {
  const {
    batchSize = 10,
    onProgress,
    onBatchComplete,
    cancelToken,
    startBatchIndex = 0,
    cachedBatches = []
  } = options;

  const { apiUrl, apiKey, model } = config;

  // 确保 existingCategories 是一个数组（防御性编程）
  const categories = Array.isArray(existingCategories) ? existingCategories : [];

  // 分批
  const batches = [];
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }

  const allCategories = new Map();
  const allTags = [];
  const batchLogs = [];

  /**
   * 将一批 categories/tags 合并到汇总 Map 中
   */
  function mergeBatch(cats, tags) {
    if (cats) {
      cats.forEach((cat) => {
        const key = cat.name.toLowerCase();
        if (allCategories.has(key)) {
          const existing = allCategories.get(key);
          existing.bookmarkIds.push(...(cat.bookmarkIds || []));
          existing.confidence = (existing.confidence + (cat.confidence ?? 0.5)) / 2;
        } else {
          allCategories.set(key, {
            name: cat.name,
            confidence: cat.confidence ?? 0.5,
            bookmarkIds: cat.bookmarkIds || [],
            isNew: !categories.includes(cat.name)
          });
        }
      });
    }
    if (tags) {
      tags.forEach(tag => allTags.push({ name: tag.name || tag, bookmarkId: tag.bookmarkId }));
    }
  }

  // ── 重放缓存批次（断点续接时跳过已完成批次）────────────────────────────────
  for (let i = 0; i < Math.min(startBatchIndex, cachedBatches.length); i++) {
    const cached = cachedBatches[i];
    mergeBatch(cached?.categories, cached?.tags);
    batchLogs.push({
      batchIndex: i,
      batchSize: batches[i]?.length ?? batchSize,
      bookmarks: batches[i]?.map(b => ({ id: b.id, title: b.title, url: b.url })) ?? [],
      categories: cached?.categories || [],
      tags: cached?.tags || [],
      usage: cached?.usage || null,
      warnings: [],
      duration: 0,
      fromCache: true
    });
  }

  // ── 逐批发送 API 请求 ────────────────────────────────────────────────────────
  // 累积所有已生成的分类（包括用户原有分类 + 新生成的分类）
  let accumulatedCategories = [...categories];

  for (let i = startBatchIndex; i < batches.length; i++) {
    // 检查取消令牌
    if (cancelToken?.cancelled) {
      throw new Error('已取消');
    }

    const batch = batches[i];
    if (onProgress) {
      onProgress(i + 1, batches.length, `正在分析第 ${i + 1}/${batches.length} 批（${batch.length} 个）...`);
    }

    // 🔄 传入累积的分类列表（用户原有 + 前面批次生成的）
    const prompt = buildAnalysisPrompt(batch, accumulatedCategories);
    const batchStartTime = Date.now();

    try {
      const { content: rawContent, usage } = await fetchWithRetry(
        () => callOpenAI(apiUrl, apiKey, model, prompt),
        MAX_RETRIES
      );

      const parsed = parseAIJSON(rawContent);
      const inputIds = batch.map(b => String(b.id));
      const { result: validatedParsed, warnings } = validateAIResult(parsed, inputIds);

      console.log(`[AI] 批 ${i + 1} 返回: ${validatedParsed.categories?.length || 0} 个分类, ${validatedParsed.tags?.length || 0} 个标签`);

      // 🔄 将新分类累积到列表中
      const newCategories = validatedParsed.categories || [];
      newCategories.forEach(cat => {
        // 检查是否是新分类（不在累积列表中）
        const exists = accumulatedCategories.some(c => c.name === cat.name);
        if (!exists) {
          accumulatedCategories.push({
            id: `cat_new_${cat.name}`,
            name: cat.name,
            parentId: null
          });
          console.log(`[AI] 批 ${i + 1} 新增分类: ${cat.name}`);
        }
      });

      mergeBatch(validatedParsed.categories, validatedParsed.tags);

      const batchLog = {
        batchIndex: i,
        batchSize: batch.length,
        bookmarks: batch.map(b => ({ id: b.id, title: b.title })),
        categories: validatedParsed.categories || [],
        tags: validatedParsed.tags || [],
        usage,
        warnings,
        duration: Date.now() - batchStartTime,
        fromCache: false
      };
      batchLogs.push(batchLog);

      if (onBatchComplete) {
        await onBatchComplete(i, batchLog);
      }

    } catch (error) {
      if (cancelToken?.cancelled) throw error; // 取消错误直接透传
      console.error(`批 ${i + 1} 分析失败:`, error);
      throw new Error(`分析第 ${i + 1}/${batches.length} 批收藏时失败: ${error.message}`);
    }
  }

  // ── 应用智能聚合去重（减少重复分类）────────────────────────────────────────────
  const rawCategories = Array.from(allCategories.values());
  console.log(`[AI] 聚合前分类数: ${rawCategories.length}`);
  console.log(`[AI] 分类列表:`, rawCategories.map(c => `${c.name}(${c.bookmarkIds.length})`).join(', '));

  const merger = new CategoryMerger({
    similarityThreshold: 0.45,  // 更激进：合并更多相似分类（0.60 → 0.45）
    minMergeSupport: 1          // 单例分类也可以合并
  });

  // 执行聚合
  const mergeResult = merger.mergeCategories(rawCategories);
  const mergedCategories = mergeResult.categories;

  console.log(`[AI] 聚合后分类数: ${mergedCategories.length}`);
  console.log(`[AI] 聚合报告: ${mergeResult.report.mergedGroups} 个组合并`);

  // ── 后处理规则：强制合并包含相同关键词的分类 ────────────────────────────────────────
  const postProcessedCategories = forceMergeByKeywords(mergedCategories);
  if (postProcessedCategories.length < mergedCategories.length) {
    console.log(`[AI] 后处理规则: ${mergedCategories.length - postProcessedCategories.length} 个分类被强制合并`);
    console.log(`[AI] 后处理最终分类数: ${postProcessedCategories.length}`);
  }

  // 记录聚合日志到 batchLogs
  if (mergeResult.report.mergedGroups > 0) {
    batchLogs.push({
      batchIndex: -1, // 特殊标记：这是聚合步骤
      batchSize: 0,
      bookmarks: [],
      categories: postProcessedCategories,
      tags: [],
      usage: null,
      warnings: [],
      duration: 0,
      fromCache: false,
      mergeReport: mergeResult.report
    });
  }

  const summary = generateSummary(
    new Map(postProcessedCategories.map(c => [c.name.toLowerCase(), c])),
    categories,
    bookmarks.length
  );

  // 在摘要中添加聚合信息
  summary.mergeReport = mergeResult.report;

  console.log(`[AI] 最终结果: ${postProcessedCategories.length} 个分类, ${allTags.length} 个标签`);

  return {
    categories: postProcessedCategories,
    tags: allTags,
    summary,
    batchLogs
  };
}

/**
 * 从 AI 返回的原始文本中提取并解析 JSON
 * 兼容：
 *   1. 思维链模型输出的 <think>...</think> 推理标签（DeepSeek-R1 等）
 *   2. AI 有时套一层 markdown 代码块 ```json ... ```
 * @param {string} raw - AI 返回的原始文本
 * @returns {Object} 解析后的 JSON 对象
 */
function parseAIJSON(raw) {
  // 1. 剥离 <think>...</think>（含嵌套）
  let text = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

  // 2. 剥离 markdown 代码块
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

  // 3. 如果还找不到 JSON 对象，尝试截取第一个 { ... }
  if (!text.startsWith('{') && !text.startsWith('[')) {
    const braceStart = text.indexOf('{');
    const bracketStart = text.indexOf('[');
    const start = braceStart === -1 ? bracketStart
      : bracketStart === -1 ? braceStart
      : Math.min(braceStart, bracketStart);
    if (start !== -1) {
      text = text.slice(start);
    }
  }

  return JSON.parse(text);
}

/**
 * 带重试机制的 Fetch 请求
 * @param {Function} fetchFn - Fetch 函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} attempt - 当前尝试次数
 * @returns {Promise<string>}
 */
async function fetchWithRetry(fetchFn, maxRetries, attempt = 0) {
  try {
    const response = await fetchFn();

    // 先检查 Content-Type，避免把 HTML 错误页当 JSON 解析
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      const err = new Error(
        `API 返回非 JSON 响应 (HTTP ${response.status})，请检查 API 地址是否正确。响应片段: ${text.slice(0, 200)}`
      );
      err.status = response.status;
      throw err;
    }

    const data = await response.json();

    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || response.statusText;
      const error = new Error(`API 请求失败 ${response.status}: ${errMsg}`);
      error.status = response.status;
      throw error;
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('API 返回内容为空');
    }

    return { content, usage: data.usage || null };
  } catch (error) {
    // 429 (Too Many Requests) 或 5xx 错误时重试
    const shouldRetry =
      attempt < maxRetries &&
      ((error.status === 429) || (error.status >= 500 && error.status < 600));

    if (shouldRetry) {
      // 指数退避
      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt);
      console.log(`请求失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries})...`);
      await sleep(delay);
      return fetchWithRetry(fetchFn, maxRetries, attempt + 1);
    }

    throw error;
  }
}

/**
 * 调用 OpenAI API
 * @param {string} apiUrl - API 地址
 * @param {string} apiKey - API 密钥
 * @param {string} model - 模型名称
 * @param {string} prompt - 提示词
 * @returns {Promise<Response>}
 */
async function callOpenAI(apiUrl, apiKey, model, prompt) {
  return fetch(`${apiUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: getSystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3
      // 不传 response_format，以兼容不支持该参数的模型（如推理模型）
    })
  });
}

/**
 * 获取系统提示词
 * @returns {string}
 */
function getSystemPrompt() {
  return CLASSIFICATION_SYSTEM_PROMPT;
}

/**
 * 根据分类ID获取分类名称
 * @param {string} categoryId - 分类ID
 * @param {Array} categories - 分类列表
 * @returns {string|null} 分类名称，如果未找到返回null
 */
function getCategoryNameById(categoryId, categories) {
  if (!categoryId) return null;
  const category = categories.find(c => c.id === categoryId);
  return category ? category.name : null;
}

/**
 * 构建分类树（添加path字段）
 * @param {Array} categories - 分类数组
 * @returns {Array} 带path的分类树
 */
function buildCategoryTree(categories) {
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  // 浏览器根目录名称（需要从path中排除）
  const ROOT_FOLDERS = new Set(['书签栏', '其他书签', 'Bookmarks Bar', 'Other Bookmarks']);

  // 为每个分类添加path字段
  const addPath = (category) => {
    const path = [];
    let current = category;
    while (current) {
      // 跳过浏览器根目录
      if (!ROOT_FOLDERS.has(current.name)) {
        path.unshift(current.name);
      }
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

  // 浏览器根目录名称（需要从path中排除）
  const ROOT_FOLDERS = new Set(['书签栏', '其他书签', 'Bookmarks Bar', 'Other Bookmarks']);

  // 构建完整路径
  const path = [];
  let current = category;
  const categoryMap = new Map(categories.map(c => [c.id, c]));

  while (current) {
    // 跳过浏览器根目录
    if (!ROOT_FOLDERS.has(current.name)) {
      path.unshift(current.name);
    }
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
 * 构建结构化的输入数据（用于JSON格式提示词）
 * @param {Array} bookmarks - 书签数组
 * @param {Array} existingCategories - 现有分类数组
 * @returns {Object} 结构化输入数据
 */
function buildStructuredInput(bookmarks, existingCategories) {
  // 构建分类树（添加path字段）
  const categoryTree = buildCategoryTree(existingCategories || []);

  // 构建书签数据（包含当前分类、标签、摘要）
  const bookmarksData = bookmarks.map(bm => {
    const bookmarkData = {
      id: String(bm.id),
      title: bm.title,
      url: bm.url
    };

    // 添加描述（如果存在）
    if (bm.description) {
      bookmarkData.description = bm.description;
    }

    // 添加当前分类信息
    const currentCategory = getCategoryInfo(bm.categoryId, existingCategories || []);
    if (currentCategory) {
      bookmarkData.currentCategory = currentCategory;
    }

    // 添加标签
    if (bm.tags && bm.tags.length > 0) {
      bookmarkData.tags = bm.tags;
    }

    // 添加摘要信息
    if (bm._summary) {
      const summary = {};
      if (bm._summary.siteName) {
        summary.siteName = bm._summary.siteName;
      }
      if (bm._summary.description) {
        summary.description = bm._summary.description;
      }
      if (bm._summary.keywords && bm._summary.keywords.length > 0) {
        summary.keywords = bm._summary.keywords.slice(0, 5);
      }
      if (Object.keys(summary).length > 0) {
        bookmarkData.summary = summary;
      }
    }

    return bookmarkData;
  });

  return {
    existingCategories: categoryTree,
    bookmarks: bookmarksData
  };
}

/**
 * 每个书签在 prompt 中的最大字符数（含标题+URL+摘要）
 */
const MAX_BOOKMARK_PROMPT_CHARS = 300;

/**
 * 构建分析提示词（使用JSON结构化输入）
 * @param {Array} bookmarks - 书签数组（可携带 _summary）
 * @param {Array} existingCategories - 现有分类列表（包含id和name）
 * @returns {string}
 */
function buildAnalysisPrompt(bookmarks, existingCategories) {
  // 构建结构化输入数据
  const inputData = buildStructuredInput(bookmarks, existingCategories);

  // 将输入数据转换为JSON字符串
  const inputJson = JSON.stringify(inputData, null, 2);

  // 根据是否有现有分类，动态生成提示词
  const hasCategories = inputData.existingCategories.length > 0;
  const categoryHint = hasCategories
    ? `## 用户现有分类
已有 ${inputData.existingCategories.length} 个分类，详见下方的 existingCategories.path 字段。

**极重要约束**：
1. **分类名称必须直接使用现有分类名称**（从 existingCategories.name 或 existingCategories.path 中选择）
   - ✅ 正确：直接使用 "前端"、".net"、"数据库"（现有分类的name字段）
   - ✅ 正确：使用 "前端/React"（如果是层级分类的path字段）
   - ❌ 错误：不要添加 "书签栏/"、"其他书签/" 前缀
   - ❌ 错误：不要创建 "书签栏/前端"、"其他书签/.net" 这样的分类

2. **优先使用现有分类**（90%以上的书签应归入现有分类）
   - 如果书签明显属于现有分类，必须使用现有分类
   - 只有在现有分类完全不适用时才创建新分类

3. **创建新分类时的格式**：
   - 必须使用 "大类/细类" 格式（如 "技术/AI"、"开发工具/Docker"）
   - 禁止创建根级细分类（如 "React"、"Vue" 必须用 "技术/React"）`
    : `## 用户暂无分类（首次分类）
请根据书签内容创建合理的分类结构。

**推荐模式**：
- 技术类：技术/前端、技术/后端、技术/数据库等
- 设计类：设计/UI设计、设计/平面设计等
- 工具类：开发工具/Git、开发工具/Docker等
- 学习类：学习/编程、学习/语言等

建议创建 5-10 个主要分类，每个分类包含 2-10 个书签。`;

  return `${categoryHint}

## 输入数据
\`\`\`json
${inputJson}
\`\`\`

## 要求
1. **分类名称必须直接使用 existingCategories.name 或 existingCategories.path**
2. **禁止在分类名称前添加 "书签栏/" 或 "其他书签/" 前缀**
3. 检测 currentCategory 与内容不匹配的书签，在 reason 字段说明 "建议从XX移动到YY"
4. 为每个书签提取 2-5 个标签（tags）
5. 最终分类总数控制在 5-15 个
6. 每个分类至少包含 2 个书签

## 输出格式
严格返回 JSON 格式，不要添加任何解释：

\`\`\`json
{
  "categories": [
    {
      "name": "分类名称（直接使用现有分类名称，如"前端"、".net"）",
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

/**
 * 截断文本到指定长度
 * @param {string} text
 * @param {number} maxLen
 * @returns {string}
 */
function truncateText(text, maxLen) {
  if (!text) return '';
  text = text.replace(/\s+/g, ' ').trim();
  return text.length > maxLen ? text.slice(0, maxLen) + '...' : text;
}

/**
 * 生成分析摘要
 * @param {Map} categories - 分类映射
 * @param {Array} existingCategories - 现有分类列表
 * @param {number} totalBookmarks - 总书签数
 * @returns {Object} 分析摘要
 */
function generateSummary(categories, existingCategories, totalBookmarks) {
  const newCategories = [];
  const adjustedCategories = [];

  let categorizedCount = 0;
  const categorizedIds = new Set();

  categories.forEach((cat) => {
    cat.bookmarkIds.forEach(id => categorizedIds.add(id));
    categorizedCount = Math.max(categorizedCount, categorizedIds.size);

    if (cat.isNew) {
      newCategories.push(cat.name);
    } else {
      // 现有分类的调整
      adjustedCategories.push({
        name: cat.name,
        addedCount: cat.bookmarkIds.length,
        removedCount: 0 // 暂不跟踪移除的项目
      });
    }
  });

  return {
    totalBookmarks,
    categorizedCount,
    newCategories,
    adjustedCategories
  };
}

/**
 * 延迟函数
 * @param {number} ms - 延迟毫秒数
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 校验 AI 返回的分析结果
 * @param {Object} parsed - parseAIJSON 解析后的对象
 * @param {Array<string>} inputBookmarkIds - 输入的 bookmark ID 列表
 * @returns {{ result: Object, warnings: string[] }}
 */
function validateAIResult(parsed, inputBookmarkIds) {
  const validIds = new Set(inputBookmarkIds);
  const warnings = [];

  if (!parsed.categories || !Array.isArray(parsed.categories)) {
    warnings.push('categories 字段缺失或非数组，已修正为空数组');
    parsed.categories = [];
  }

  for (const cat of parsed.categories) {
    // 校验 name
    if (!cat.name || typeof cat.name !== 'string') {
      warnings.push(`分类名称为空或无效，已修正为"未分类"`);
      cat.name = '未分类';
    }

    // 校验 confidence
    if (typeof cat.confidence !== 'number' || isNaN(cat.confidence)) {
      warnings.push(`分类"${cat.name}"的 confidence 无效 (${cat.confidence})，已修正为 0.5`);
      cat.confidence = 0.5;
    } else {
      cat.confidence = Math.min(1, Math.max(0, cat.confidence));
    }

    // 过滤无效 bookmarkIds
    const originalIds = cat.bookmarkIds || [];
    cat.bookmarkIds = originalIds.filter(id => {
      const strId = String(id);
      if (!validIds.has(strId)) {
        warnings.push(`分类"${cat.name}"中的 bookmarkId "${id}" 不存在于输入中，已移除`);
        return false;
      }
      return true;
    });
    // 确保 ID 为字符串
    cat.bookmarkIds = cat.bookmarkIds.map(String);
  }

  if (!parsed.tags || !Array.isArray(parsed.tags)) {
    parsed.tags = [];
  }

  return { result: parsed, warnings };
}

/**
 * Debug 模式分析收藏（不分批，记录完整 API 交互报文）
 * @param {Object} config - API 配置
 * @param {Array} bookmarks - 待分析的收藏列表（建议 1-5 个）
 * @param {Array} existingCategories - 用户已有的分类名称列表
 * @returns {Promise<Object>} 包含 debugLog 的完整调试信息
 */
export async function analyzeBookmarksDebug(config, bookmarks, existingCategories = []) {
  const { apiUrl, apiKey, model } = config;

  // 确保 existingCategories 是一个数组（防御性编程）
  const categories = Array.isArray(existingCategories) ? existingCategories : [];

  const debugLog = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `debug_${Date.now()}`,
    timestamp: Date.now(),
    bookmarkCount: bookmarks.length,
    bookmarks: bookmarks.map(b => ({
      id: b.id, title: b.title, url: b.url,
      hasSummary: !!b._summary,
      summaryPreview: b._summary?.description?.slice(0, 60) || null
    })),
    existingCategories: categories,
    request: null,
    response: null,
    rawContent: null,
    parsed: null,
    validation: null,
    duration: 0,
    error: null
  };

  const startTime = Date.now();

  try {
    // 构建 prompt
    const prompt = buildAnalysisPrompt(bookmarks, categories);
    const systemPrompt = getSystemPrompt();

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3
    };

    debugLog.request = requestBody;

    console.log('[AI Debug] 发送请求:', JSON.stringify(requestBody, null, 2));

    // 直接调用（不走 fetchWithRetry，方便调试）
    const url = `${apiUrl}/chat/completions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseData = await response.json();

    debugLog.response = {
      status: response.status,
      statusText: response.statusText,
      body: responseData,
      usage: responseData.usage || null
    };

    if (!response.ok) {
      const errMsg = responseData?.error?.message || responseData?.message || response.statusText;
      throw new Error(`API 请求失败 ${response.status}: ${errMsg}`);
    }

    const rawContent = responseData.choices?.[0]?.message?.content;
    debugLog.rawContent = rawContent;

    console.log('[AI Debug] 原始响应:', rawContent);

    if (!rawContent) {
      throw new Error('API 返回内容为空');
    }

    // 解析 JSON
    const parsed = parseAIJSON(rawContent);
    debugLog.parsed = parsed;

    console.log('[AI Debug] 解析结果:', JSON.stringify(parsed, null, 2));

    // 校验
    const inputIds = bookmarks.map(b => String(b.id));
    const validation = validateAIResult(parsed, inputIds);
    debugLog.validation = validation;

    if (validation.warnings.length > 0) {
      console.warn('[AI Debug] 校验警告:', validation.warnings);
    }

    debugLog.duration = Date.now() - startTime;
    return debugLog;

  } catch (error) {
    debugLog.error = error.message;
    debugLog.duration = Date.now() - startTime;
    console.error('[AI Debug] 分析失败:', error);
    return debugLog;
  }
}

/**
 * 语义搜索（增强版）
 * 支持更复杂的查询理解和结果排序
 * @param {Object} config - API 配置
 * @param {string} query - 搜索查询
 * @param {Array} bookmarks - 书签数组
 * @returns {Promise<Array>} 搜索结果 ID 数组
 */
export async function semanticSearch(config, query, bookmarks) {
  const { apiUrl, apiKey, model } = config;

  // 如果收藏太多，先进行简单的本地过滤，减少 API 调用成本
  let searchBookmarks = bookmarks;
  if (bookmarks.length > 100) {
    // 简单的关键词匹配来缩小范围
    const queryLower = query.toLowerCase();
    searchBookmarks = bookmarks.filter(bm =>
      bm.title.toLowerCase().includes(queryLower) ||
      bm.url.toLowerCase().includes(queryLower) ||
      (bm.description && bm.description.toLowerCase().includes(queryLower)) ||
      (bm.tags && bm.tags.some(t => t.toLowerCase().includes(queryLower)))
    );
  }

  // 构建更详细的搜索提示
  const bookmarkList = searchBookmarks.map((bm, i) => {
    const tags = bm.tags && bm.tags.length > 0 ? ` [标签: ${bm.tags.join(', ')}]` : '';
    const desc = bm.description ? `\n   描述: ${bm.description}` : '';
    return `${i + 1}. [ID: ${bm.id}] ${bm.title}\n   URL: ${bm.url}${tags}${desc}`;
  }).join('\n');

  const prompt = `用户搜索查询："${query}"

请从以下收藏中找出最相关的，并按相关性从高到低排序。

${bookmarkList}

分析要求：
1. 理解用户的搜索意图，而不仅仅是关键词匹配
2. 考虑标题、URL、描述和标签的语义相关性
3. 即使没有完全匹配的关键词，也考虑内容相关的结果
4. 优先返回最相关的前20个结果

请返回 JSON 格式：
{
  "results": ["id1", "id2", ...],
  "reasoning": "简要说明排序依据"
}`;

  try {
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '你是一个智能搜索助手，擅长理解用户的搜索意图并找出最相关的内容。你会考虑语义相似性、主题相关性，而不仅仅是关键词匹配。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
        // 不传 response_format，以兼容不支持该参数的模型
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API request failed: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      console.warn('Empty AI response, returning empty results');
      return [];
    }

    // 解析 JSON 结果（兼容 <think> 标签 + markdown 代码块）
    let result;
    try {
      result = parseAIJSON(content);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', content);
      return [];
    }

    // 验证返回的 ID 是否存在
    const validIds = new Set(searchBookmarks.map(b => b.id));
    const filteredResults = (result.results || []).filter(id => validIds.has(id));

    // 记录推理过程（用于调试）
    if (result.reasoning) {
      console.log('AI Search Reasoning:', result.reasoning);
    }

    return filteredResults;
  } catch (error) {
    console.error('Semantic search failed:', error);
    throw error;
  }
}

/**
 * 测试 API 连接（发送最小化 chat completion 请求）
 * @param {Object} config - API 配置
 * @returns {Promise<{ok: boolean, message: string}>}
 */
export async function testConnection(config) {
  try {
    const apiUrl = (config.apiUrl || '').replace(/\/+$/, '');
    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.model,
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 5
      })
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return { ok: false, message: `服务器返回非 JSON 响应 (${response.status})，请检查 API 地址` };
    }

    const data = await response.json();
    if (!response.ok) {
      const errMsg = data?.error?.message || data?.message || response.statusText;
      return { ok: false, message: `${response.status}: ${errMsg}` };
    }

    return { ok: true, message: '连接成功' };
  } catch (error) {
    console.error('Connection test failed:', error);
    return { ok: false, message: error.message };
  }
}

/**
 * 后处理：智能合并根级细分类，保留层级分类
 * 规则：
 * 1. 层级分类（含"/"）保留不变
 * 2. 现有大类（用户已有）保留不变
 * 3. 根级细分类合并到相似的大类（基于名称相似度）
 *
 * @param {Array} categories - 分类数组
 * @returns {Array} 合并后的分类数组
 */
function forceMergeByKeywords(categories) {
  if (categories.length <= 15) return categories; // 已经足够少，无需处理

  // 识别常见的大类名称（保留这些分类不合并）
  const commonCategories = new Set([
    '前端', '后端', '数据库', '容器化', '开发工具', 'AI工具',
    '运维', '测试', '设计', '学习', '技术', '工具'
  ]);

  // 提取所有大类（书签数 >= 3 的分类）
  const majorCategories = categories.filter(cat => cat.bookmarkIds.length >= 3);
  const majorCategoryNames = new Set(majorCategories.map(cat => cat.name));

  const mergeMap = new Map(); // categoryId → targetCategory
  const targetCategories = [];

  for (const cat of categories) {
    // 跳过层级分类（包含 "/" 的保留）
    if (cat.name.includes('/')) {
      targetCategories.push(cat);
      continue;
    }

    // 跳过常见大类和已有的大类
    if (commonCategories.has(cat.name) || majorCategoryNames.has(cat.name)) {
      targetCategories.push(cat);
      continue;
    }

    // 查找相似的大类进行合并
    let targetCategory = null;
    let maxSimilarity = 0;

    for (const major of majorCategories) {
      if (major.name === cat.name) continue;

      // 计算名称相似度（简单的包含关系）
      const similarity = calculateSimilarity(cat.name, major.name);
      if (similarity > maxSimilarity && similarity > 0.4) {
        maxSimilarity = similarity;
        targetCategory = major;
      }
    }

    if (targetCategory) {
      // 合并到目标大类
      const target = targetCategories.find(t => t.name === targetCategory.name);
      if (target) {
        const uniqueIds = new Set([...target.bookmarkIds, ...cat.bookmarkIds]);
        target.bookmarkIds = Array.from(uniqueIds);
        mergeMap.set(cat.id, target);
      } else {
        targetCategories.push({...targetCategory, bookmarkIds: [...cat.bookmarkIds]});
      }
      console.log(`[后处理] 合并 "${cat.name}" → "${targetCategory.name}" (相似度: ${maxSimilarity.toFixed(2)})`);
    } else {
      // 没找到相似的大类，保留原分类
      targetCategories.push(cat);
    }
  }

  return targetCategories;
}

/**
 * 计算两个分类名称的相似度
 * @param {string} name1 - 分类名称1
 * @param {string} name2 - 分类名称2
 * @returns {number} 相似度（0-1）
 */
function calculateSimilarity(name1, name2) {
  const lower1 = name1.toLowerCase();
  const lower2 = name2.toLowerCase();

  // 包含关系
  if (lower1.includes(lower2) || lower2.includes(lower1)) {
    return 0.8;
  }

  // 计算公共字符比例
  const set1 = new Set(lower1);
  const set2 = new Set(lower2);
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);

  return intersection.size / union.size;
}
