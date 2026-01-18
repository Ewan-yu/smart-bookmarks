// Smart Bookmarks - OpenAI 兼容 API 调用

/**
 * 最大重试次数
 */
const MAX_RETRIES = 3;

/**
 * 重试延迟基数（毫秒）
 */
const RETRY_DELAY_BASE = 1000;

/**
 * AI 分析请求配置
 */
interface AnalysisConfig {
  apiUrl: string;
  apiKey: string;
  model: string;
}

/**
 * 分析进度回调
 */
interface ProgressCallback {
  (current: number, total: number, message: string): void;
}

/**
 * 分析结果中的分类
 */
interface CategoryResult {
  name: string;
  confidence: number;
  bookmarkIds: string[];
  isNew: boolean; // 是否为建议新增的分类
}

/**
 * 标签建议
 */
interface TagSuggestion {
  name: string;
  bookmarkId: string;
}

/**
 * 完整分析结果
 */
interface AnalysisResult {
  categories: CategoryResult[];
  tags: TagSuggestion[];
  summary: {
    totalBookmarks: number;
    categorizedCount: number;
    newCategories: string[];
    adjustedCategories: Array<{
      name: string;
      addedCount: number;
      removedCount: number;
    }>;
  };
}

/**
 * 调用 AI 分析收藏（带进度回调）
 * @param config - API 配置
 * @param bookmarks - 待分析的收藏列表
 * @param existingCategories - 用户已有的分类（作为参考）
 * @param batchSize - 每批分析的收藏数量
 * @param onProgress - 进度回调
 */
export async function analyzeBookmarks(
  config: AnalysisConfig,
  bookmarks: Array<{ id: string; title: string; url: string; description?: string }>,
  existingCategories: string[] = [],
  batchSize: number = 10,
  onProgress?: ProgressCallback
): Promise<AnalysisResult> {
  const { apiUrl, apiKey, model } = config;

  // 分批分析，避免单次请求数据量过大
  const batches = [];
  for (let i = 0; i < bookmarks.length; i += batchSize) {
    batches.push(bookmarks.slice(i, i + batchSize));
  }

  const allCategories: Map<string, CategoryResult> = new Map();
  const allTags: TagSuggestion[] = [];

  // 逐批分析
  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];

    // 触发进度回调
    if (onProgress) {
      onProgress(i + 1, batches.length, `正在分析第 ${i + 1}/${batches.length} 批收藏...`);
    }

    // 构建分析提示
    const prompt = buildAnalysisPrompt(batch, existingCategories);

    try {
      const result = await fetchWithRetry(
        () => callOpenAI(apiUrl, apiKey, model, prompt),
        MAX_RETRIES
      );

      // 解析结果
      const parsed = JSON.parse(result);

      // 处理分类结果
      if (parsed.categories && Array.isArray(parsed.categories)) {
        parsed.categories.forEach((cat: any) => {
          const key = cat.name.toLowerCase();
          if (allCategories.has(key)) {
            // 合并到已有分类
            const existing = allCategories.get(key);
            existing.bookmarkIds.push(...cat.bookmarkIds);
            // 更新置信度（取平均）
            existing.confidence = (existing.confidence + cat.confidence) / 2;
          } else {
            // 新增分类
            allCategories.set(key, {
              name: cat.name,
              confidence: cat.confidence,
              bookmarkIds: cat.bookmarkIds || [],
              isNew: !existingCategories.includes(cat.name)
            });
          }
        });
      }

      // 处理标签建议
      if (parsed.tags && Array.isArray(parsed.tags)) {
        parsed.tags.forEach((tag: any) => {
          allTags.push({
            name: tag.name || tag,
            bookmarkId: tag.bookmarkId
          });
        });
      }

    } catch (error) {
      console.error(`批 ${i + 1} 分析失败:`, error);
      throw new Error(`分析第 ${i + 1}/${batches.length} 批收藏时失败: ${error.message}`);
    }
  }

  // 生成分析摘要
  const summary = generateSummary(allCategories, existingCategories, bookmarks.length);

  return {
    categories: Array.from(allCategories.values()),
    tags: allTags,
    summary
  };
}

/**
 * 带重试机制的 Fetch 请求
 */
async function fetchWithRetry(
  fetchFn: () => Promise<Response>,
  maxRetries: number,
  attempt: number = 0
): Promise<string> {
  try {
    const response = await fetchFn();

    if (!response.ok) {
      const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
      (error as any).status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from API');
    }

    return content;
  } catch (error: any) {
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
 */
async function callOpenAI(
  apiUrl: string,
  apiKey: string,
  model: string,
  prompt: string
): Promise<Response> {
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
      temperature: 0.3,
      response_format: { type: 'json_object' }
    })
  });
}

/**
 * 获取系统提示词
 */
function getSystemPrompt(): string {
  return `你是一个专业的收藏夹智能分类助手。你的职责是：
1. 分析收藏的标题、URL和描述，将它们智能分类
2. 优先使用用户已有的分类体系
3. 当需要创建新分类时，使用简洁明了的名称（如"前端开发"、"AI工具"、"学习资料"）
4. 一个链接可以属于多个分类
5. 提取有意义的标签，标签应比分类更细粒度
6. 确保分类结果准确、合理、易于理解`;
}

/**
 * 构建分析提示词
 */
function buildAnalysisPrompt(
  bookmarks: Array<{ id: string; title: string; url: string; description?: string }>,
  existingCategories: string[]
): string {
  const bookmarksList = bookmarks.map((bm, index) => {
    const desc = bm.description ? `\n   描述: ${bm.description}` : '';
    return `${index + 1}. [ID: ${bm.id}] ${bm.title}\n   URL: ${bm.url}${desc}`;
  }).join('\n');

  const existingCategoriesText = existingCategories.length > 0
    ? `用户已有的分类：${existingCategories.join('、')}（优先使用这些分类）`
    : '用户暂无分类，请创建合适的分类';

  return `${existingCategoriesText}

请分析以下收藏链接，并返回 JSON 格式的分类结果：

${bookmarksList}

请返回以下 JSON 格式：
{
  "categories": [
    {
      "name": "分类名称",
      "confidence": 0.95,
      "bookmarkIds": ["id1", "id2", ...]
    }
  ],
  "tags": [
    {
      "name": "标签名",
      "bookmarkId": "收藏ID"
    }
  ]
}

要求：
1. 分类名称应简洁明了（2-6个字最佳）
2. confidence 表示分类的可信度（0-1之间，0.7以上较可信）
3. 一个链接可以属于多个分类
4. 标签应比分类更细粒度，例如"React"、"教程"、"工具"等
5. 返回的 bookmarkIds 必须存在于输入中
6. 优先使用用户已有的分类`;
}

/**
 * 生成分析摘要
 */
function generateSummary(
  categories: Map<string, CategoryResult>,
  existingCategories: string[],
  totalBookmarks: number
) {
  const newCategories: string[] = [];
  const adjustedCategories: Array<{
    name: string;
    addedCount: number;
    removedCount: number;
  }> = [];

  let categorizedCount = 0;
  const categorizedIds = new Set<string>();

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
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 语义搜索（增强版）
 * 支持更复杂的查询理解和结果排序
 */
export async function semanticSearch(
  config: AnalysisConfig,
  query: string,
  bookmarks: Array<{ id: string; title: string; url: string; description?: string; tags?: string[] }>
): Promise<string[]> {
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
        response_format: { type: 'json_object' },
        max_tokens: 2000
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

    // 解析 JSON 结果
    let result;
    try {
      result = JSON.parse(content);
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
 * 测试 API 连接
 */
export async function testConnection(config: AnalysisConfig): Promise<boolean> {
  try {
    const response = await fetch(`${config.apiUrl}/models`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`
      }
    });

    return response.ok;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}
