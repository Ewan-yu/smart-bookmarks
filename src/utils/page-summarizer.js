// Smart Bookmarks - 页面摘要提取工具
// 从 URL 抓取页面 HTML 并提取 meta 信息、关键词、正文摘要

/**
 * 单个 URL 抓取超时（毫秒）
 */
const FETCH_TIMEOUT = 3000;

/**
 * 正文摘要最大字符数
 */
const MAX_SNIPPET_LENGTH = 200;

/**
 * 描述最大字符数
 */
const MAX_DESC_LENGTH = 150;

/**
 * 并发抓取数
 */
const CONCURRENCY = 5;

/**
 * 提取单个 URL 的页面摘要信息
 * @param {string} url - 页面 URL
 * @returns {Promise<{description: string, keywords: string[], snippet: string} | null>}
 */
export async function extractPageSummary(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

    const resp = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    });
    clearTimeout(timer);

    if (!resp.ok) return null;

    const contentType = resp.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('xhtml')) {
      return null;
    }

    const html = await resp.text();
    return parseHtmlMeta(html);
  } catch {
    return null;
  }
}

/**
 * 从 HTML 中解析 meta 信息
 * @param {string} html
 * @returns {{description: string, keywords: string[], snippet: string}}
 */
function parseHtmlMeta(html) {
  // meta description / og:description
  const desc =
    matchMeta(html, 'name', 'description') ||
    matchMeta(html, 'property', 'og:description') ||
    '';

  // meta keywords
  const kwRaw = matchMeta(html, 'name', 'keywords') || '';
  const keywords = kwRaw
    .split(/[,，;；]/)
    .map(k => k.trim())
    .filter(Boolean)
    .slice(0, 8);  // 最多保留 8 个

  // 正文摘要：剥离 script/style/tag，取前 N 字符
  let snippet = '';
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    snippet = bodyMatch[1]
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&[a-z]+;/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_SNIPPET_LENGTH);
  }

  return {
    description: desc.slice(0, MAX_DESC_LENGTH),
    keywords,
    snippet
  };
}

/**
 * 匹配 meta 标签内容
 * @param {string} html
 * @param {string} attr - 属性名 (name / property)
 * @param {string} value - 属性值 (description / og:description / keywords)
 * @returns {string | null}
 */
function matchMeta(html, attr, value) {
  // 兼容 content 在前或在后两种写法
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${value}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${value}["']`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * 批量提取页面摘要（带并发控制）
 * @param {Array<{id: string, url: string}>} bookmarks - 书签列表
 * @param {Function} [onProgress] - 进度回调 (completed, total)
 * @returns {Promise<Map<string, {description: string, keywords: string[], snippet: string}>>}
 */
export async function batchExtractSummaries(bookmarks, onProgress) {
  const results = new Map();
  let completed = 0;

  // 并发池
  const pool = [];
  for (const bm of bookmarks) {
    const task = extractPageSummary(bm.url).then(summary => {
      if (summary) {
        results.set(bm.id, summary);
      }
      completed++;
      if (onProgress) onProgress(completed, bookmarks.length);
    });
    pool.push(task);

    // 控制并发
    if (pool.length >= CONCURRENCY) {
      await Promise.race(pool);
      // 移除已完成的
      for (let i = pool.length - 1; i >= 0; i--) {
        const settled = await Promise.race([pool[i].then(() => true), Promise.resolve(false)]);
        if (settled) pool.splice(i, 1);
      }
    }
  }

  await Promise.all(pool);
  return results;
}

/**
 * 将摘要信息合并到书签对象上（附加 _summary 字段，不修改原始数据）
 * @param {Array} bookmarks - 书签列表
 * @param {Map} summaryMap - batchExtractSummaries 返回的 Map
 * @returns {Array} 带 _summary 的书签浅拷贝
 */
export function enrichBookmarks(bookmarks, summaryMap) {
  return bookmarks.map(bm => {
    const summary = summaryMap.get(bm.id);
    return summary ? { ...bm, _summary: summary } : bm;
  });
}
