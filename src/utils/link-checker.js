// Smart Bookmarks - 链接检测工具
// 用于检测收藏链接是否有效

/**
 * 典型反爬/WAF 触发状态码。
 * 这些码通常意味着站点在线但对自动化请求作了拦截，不应直接判定为失效。
 *   401 - 需要登录（内容可能正常存在）
 *   403 - 禁止访问（WAF/地区限制/需登录，内容未必消失）
 *   429 - 请求过多（速率限制 / 反爬）
 *   520 - Cloudflare 未知错误（通常是源站临时问题）
 *   521 - WAF bot 检测（CSDN/CloudFlare 反爬常见）
 *   999 - LinkedIn 反爬专用码
 */
const UNCERTAIN_STATUS_CODES = new Set([401, 403, 429, 520, 521, 999]);

/**
 * 模拟浏览器的请求头，降低 WAF 拦截概率。
 * 注意：User-Agent 是 Fetch API 禁用头，浏览器会自动附带真实 UA，无需手动设置。
 */
const BROWSER_HEADERS = {
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

import {
  getBookmark,
  put,
  getAllCategories,
  addCategory,
  STORES
} from '../db/indexeddb.js';

/**
 * 检测单个链接
 * @param {string} url - 要检测的URL
 * @param {Object} options - 检测选项
 * @param {number} options.timeout - 超时时间（毫秒），默认10000
 * @param {string} options.method - 请求方法，默认'HEAD'
 * @param {boolean} options.followRedirects - 是否跟随重定向，默认true
 * @param {number} options.retries - 重试次数，默认2
 * @returns {Promise<Object>} 检测结果
 */
export async function checkLink(url, options = {}) {
  const {
    timeout = 6000,    // GET 超时
    headTimeout = 4000, // HEAD 超时更短：站点静默丢弃 HEAD 时尽快降级到 GET
    method = 'HEAD',
    followRedirects = true,
    retries = 1
  } = options;

  // HEAD 使用更短的超时
  const effectiveTimeout = (method === 'HEAD') ? headTimeout : timeout;

  // 尝试多次检测以提高准确性
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
      // Chrome 扩展 Background Service Worker 配合 host_permissions: ["<all_urls>"]
      // 可以直接发起跨域请求，无需 no-cors 模式
      const response = await fetch(url, {
        method,
        headers: BROWSER_HEADERS,
        redirect: followRedirects ? 'follow' : 'manual',
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const statusCode = response.status;

      // 2xx / 3xx 视为有效
      if (statusCode >= 200 && statusCode < 400) {
        return {
          url,
          status: 'ok',
          statusCode,
          redirected: response.redirected || false,
          error: null,
          attempt: attempt + 1
        };
      }

      // 405 Method Not Allowed：该站点不支持 HEAD，改用 GET 重试
      if (statusCode === 405 && method === 'HEAD') {
        clearTimeout(timeoutId);
        return checkLink(url, { ...options, method: 'GET', retries: 0 });
      }

      // HEAD 返回 5xx：服务端对 HEAD 实现有缺陷（如宝塔面板返回 500、部分框架返回 502/503）
      // GET 才是真正的访问验证，降级重试
      if (statusCode >= 500 && method === 'HEAD') {
        clearTimeout(timeoutId);
        return checkLink(url, { ...options, method: 'GET', retries: 0 });
      }

      // 反爬/WAF 触发码：HEAD 方式更易被拦截，自动降级为 GET 重试一次
      if (UNCERTAIN_STATUS_CODES.has(statusCode) && method === 'HEAD') {
        clearTimeout(timeoutId);
        return checkLink(url, { ...options, method: 'GET', retries: 0 });
      }

      // 反爬/WAF 触发码：GET 仍被拦截，标记为 uncertain（不确定），不视为失效
      if (UNCERTAIN_STATUS_CODES.has(statusCode)) {
        return {
          url,
          status: 'uncertain',
          statusCode,
          error: getErrorMessage(statusCode),
          attempt: attempt + 1
        };
      }

      // 其余 4xx / 5xx 视为失效
      return {
        url,
        status: 'broken',
        statusCode,
        error: getErrorMessage(statusCode),
        attempt: attempt + 1
      };

    } catch (error) {
      clearTimeout(timeoutId);

      // 如果是超时错误
      if (error.name === 'AbortError') {
        // HEAD 超时：部分站点会静默丢弃 HEAD 连接（如 cnblogs），降级为 GET 重试一次
        if (method === 'HEAD') {
          return checkLink(url, { ...options, method: 'GET', retries: 0 });
        }

        // GET 也超时：先尝试重试
        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          continue;
        }

        return {
          url,
          status: 'timeout',
          statusCode: 0,
          error: '请求超时',
          attempt: attempt + 1
        };
      }

      // 网络错误（DNS失败、连接失败、TCP RST 等）
      const errorType = classifyError(error);

      // DNS 失败：域名不可达，直接判定为失效，不降级
      if (errorType === 'dns') {
        return {
          url,
          status: 'dns_error',
          statusCode: 0,
          error: error.message || 'DNS 解析失败',
          attempt: attempt + 1
        };
      }

      // HEAD 网络错误（连接被丢弃/拒绝）：降级为 GET 重试一次
      if (method === 'HEAD') {
        return checkLink(url, { ...options, method: 'GET', retries: 0 });
      }

      // GET 也出现网络错误：先尝试重试
      if (isTemporaryError(error) && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      return {
        url,
        status: 'network_error',
        statusCode: 0,
        error: error.message || '网络错误',
        attempt: attempt + 1
      };
    }
  }

  // 理论上不应该到达这里
  return {
    url,
    status: 'error',
    statusCode: 0,
    error: '未知错误',
    attempt: retries + 1
  };
}

/**
 * 根据状态码获取错误描述
 */
function getErrorMessage(statusCode) {
  const errorMessages = {
    400: '请求错误',
    401: '需要登录（内容可能正常存在）',
    403: '访问受限（可能为登录/地区/反爬限制）',
    404: '页面不存在',
    405: '方法不允许',
    408: '请求超时',
    410: '资源已删除',
    429: '请求被限速（反爬/WAF）',
    500: '服务器错误',
    502: '网关错误',
    503: '服务不可用',
    504: '网关超时',
    520: 'WAF/CDN 未知错误（站点可能正常）',
    521: 'WAF 反爬拦截（站点可能正常）',
    599: '网络连接超时',
    999: '反爬保护（站点可能正常）'
  };

  return errorMessages[statusCode] || `HTTP ${statusCode}`;
}

/**
 * 分类错误类型
 */
function classifyError(error) {
  const message = error.message.toLowerCase();

  if (message.includes('dns') || message.includes('ename')) {
    return 'dns';
  }

  if (message.includes('network') || message.includes('fetch')) {
    return 'network';
  }

  if (message.includes('cors') || message.includes('cross-origin')) {
    return 'cors';
  }

  return 'unknown';
}

/**
 * 判断是否为临时错误（可重试）
 */
function isTemporaryError(error) {
  const message = error.message.toLowerCase();

  // 临时网络错误
  const temporaryErrors = [
    'network',
    'timeout',
    'econnreset',
    'etimedout'
  ];

  return temporaryErrors.some(err => message.includes(err));
}

/**
 * 批量检测链接（真并发池 + 域名 DNS 缓存）
 *
 * 相比旧的"分批等待最慢请求"模式，改为 N 个 worker 持续从队列取任务：
 *   - 某个请求超时不会拖慢整批，空出的槽位立即被下一个 URL 填充
 *   - DNS 失败的域名只发一次请求，同域名的其余链接直接跳过
 *
 * @param {Array<string>} urls - URL 数组
 * @param {Object} options
 * @param {number}   options.concurrency       - 最大并发数，默认 10
 * @param {Function} options.onProgress        - 进度回调 (completed, total, brokenLinks[])
 * @param {Function} options.onItemComplete    - 单条完成回调 (result)，立即触发
 * @param {number}   options.delay             - 每条完成后的可选延迟（ms），默认 0
 * @param {boolean}  options.enableDomainCache - 启用域名级 DNS 缓存，默认 true
 * @param {Object}   options.cancelToken       - 取消令牌，设 .cancelled=true 可中止
 * @returns {Promise<Array<Object>>}
 */
export async function checkLinks(urls, options = {}) {
  const {
    concurrency = 10,
    onProgress,
    onItemComplete,
    delay = 0,
    enableDomainCache = true,
    cancelToken = null,
    ...checkOptions
  } = options;

  const results = [];
  let completed = 0;
  const total = urls.length;
  const brokenLinks = [];

  // 只缓存 DNS 失败的域名，避免因域名正常但 URL 404 而误判
  const deadDomains = new Set();

  function getHostname(url) {
    try { return new URL(url).hostname; } catch { return null; }
  }

  async function processUrl(url) {
    if (cancelToken && cancelToken.cancelled) return null;

    let result;
    const hostname = getHostname(url);

    if (enableDomainCache && hostname && deadDomains.has(hostname)) {
      // 域名已确认 DNS 失败，无需发请求
      result = {
        url,
        status: 'dns_error',
        statusCode: 0,
        error: 'DNS 解析失败（域名不可达）',
        attempt: 0,
        fromCache: true
      };
    } else {
      result = await checkLink(url, checkOptions);
      // 缓存 DNS 失败域名
      if (enableDomainCache && hostname && result.status === 'dns_error') {
        deadDomains.add(hostname);
      }
    }

    results.push(result);
    // uncertain 表示 WAF/反爬拦截，不确定链接是否真实失效，不加入 brokenLinks
    if (result.status !== 'ok' && result.status !== 'unknown' && result.status !== 'uncertain') {
      brokenLinks.push(result);
    }
    completed++;

    if (onItemComplete) {
      await onItemComplete(result);
    }
    if (onProgress) {
      onProgress(completed, total, [...brokenLinks]);
    }
    return result;
  }

  // Worker 池：N 个 worker 并发从队列持续取任务
  // JS 单线程保证 queue.shift() 是原子的，无竞争条件
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      if (cancelToken && cancelToken.cancelled) break;
      const url = queue.shift();
      if (url === undefined) break;
      await processUrl(url);
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  const workerCount = Math.min(concurrency, urls.length);
  await Promise.all(Array.from({ length: workerCount }, worker));

  return results;
}

/**
 * 检测结果统计
 * @param {Array<Object>} results - 检测结果数组
 * @returns {Object} 统计信息
 */
export function summarizeResults(results) {
  const summary = {
    total: results.length,
    ok: 0,
    broken: 0,
    uncertain: 0,
    timeout: 0,
    dns_error: 0,
    network_error: 0,
    unknown: 0,
    details: {}
  };

  for (const result of results) {
    // 统计各状态数量
    if (result.status === 'ok') {
      summary.ok++;
    } else if (result.status === 'broken') {
      summary.broken++;
    } else if (result.status === 'uncertain') {
      summary.uncertain++;
    } else if (result.status === 'timeout') {
      summary.timeout++;
    } else if (result.status === 'dns_error') {
      summary.dns_error++;
    } else if (result.status === 'network_error') {
      summary.network_error++;
    } else {
      summary.unknown++;
    }

    // 统计错误详情
    if (result.error) {
      const errorKey = result.error || 'unknown';
      summary.details[errorKey] = (summary.details[errorKey] || 0) + 1;
    }
  }

  return summary;
}

/**
 * 获取失效链接（排除unknown状态）
 * @param {Array<Object>} results - 检测结果数组
 * @returns {Array<Object>} 失效链接数组
 */
export function getBrokenLinks(results) {
  // uncertain（WAF/反爬拦截）排除在外，不视为失效
  return results.filter(r =>
    r.status !== 'ok' && r.status !== 'unknown' && r.status !== 'uncertain'
  );
}

/**
 * 获取失效链接（包含unknown状态）
 * @param {Array<Object>} results - 检测结果数组
 * @returns {Array<Object>} 失效和未知状态的链接数组
 */
export function getBrokenAndUnknownLinks(results) {
  return results.filter(r => r.status !== 'ok');
}

/**
 * 格式化检测结果
 */
export function formatResult(result) {
  const statusIcons = {
    ok: '✅',
    timeout: '⏱️',
    error: '❌',
    unknown: '❓'
  };

  const icon = statusIcons[result.status] || '❓';
  const message = result.error || `Status: ${result.statusCode || 'OK'}`;

  return `${icon} ${result.url}\n   ${message}`;
}

/**
 * 检测书签是否有效（用于定期检测）
 * @param {Object} bookmark - 书签对象
 * @param {Object} options - 检测选项
 * @returns {Promise<Object>} 带书签ID的检测结果
 */
export async function checkBookmark(bookmark, options = {}) {
  const result = await checkLink(bookmark.url, options);

  return {
    bookmarkId: bookmark.id,
    bookmarkTitle: bookmark.title,
    ...result,
    timestamp: Date.now()
  };
}

/**
 * 批量检测书签
 * @param {Array<Object>} bookmarks - 书签数组
 * @param {Object} options - 检测选项
 * @param {Function} options.onItemChecked - 单条书签状态更新后的回调（用于增量保存）
 * @returns {Promise<Array<Object>>} 检测结果数组
 */
export async function checkBookmarks(bookmarks, options = {}) {
  const {
    onProgress,
    onItemChecked,
    ...checkOptions
  } = options;

  // url → bookmark[] 映射（支持同一 URL 对应多个书签）
  const urlToBookmarks = new Map();
  for (const b of bookmarks) {
    if (!urlToBookmarks.has(b.url)) urlToBookmarks.set(b.url, []);
    urlToBookmarks.get(b.url).push(b);
  }

  // 去重后的 URL（同一 URL 只发一次请求）
  const uniqueUrls = [...urlToBookmarks.keys()];

  let brokenBookmarkCount = 0;   // 实际失效书签数（非 URL 数）
  let completedBookmarkCount = 0; // 实际已处理书签数
  const totalBookmarks = bookmarks.length;

  const results = await checkLinks(
    uniqueUrls,
    {
      ...checkOptions,
      // 每个唯一 URL 检测完后，更新该 URL 对应的所有书签
      onItemComplete: async (result) => {
        if (!result) return;
        const bmList = urlToBookmarks.get(result.url) || [];
        // uncertain（WAF/反爬拦截）不标记为 broken，保持原有状态不变
        const isBroken = result.status !== 'ok' && result.status !== 'uncertain';
        for (const bookmark of bmList) {
          bookmark.status = isBroken ? 'broken' : 'active';
          bookmark.checkError = result.error;
          bookmark.checkStatusCode = result.statusCode;
          bookmark.checkStatus = result.status;
          bookmark.lastChecked = Date.now();
          if (onItemChecked) await onItemChecked(bookmark);
        }
        if (isBroken) brokenBookmarkCount += bmList.length;
        completedBookmarkCount += bmList.length;
      },
      onProgress: () => {
        // 传递实际书签数（非 URL 数）到上层
        if (onProgress) onProgress(completedBookmarkCount, totalBookmarks, brokenBookmarkCount);
      }
    }
  );

  return results;
}

/**
 * 更新书签状态
 * @param {Object} db - 数据库实例
 * @param {string} bookmarkId - 书签ID
 * @param {string} status - 状态
 * @param {string} error - 错误信息
 */
export async function updateBookmarkStatus(bookmarkId, status, error = null) {
  const bookmark = await getBookmark(bookmarkId);

  if (bookmark) {
    bookmark.status = status === 'ok' ? 'active' : 'broken';
    bookmark.lastChecked = Date.now();
    bookmark.checkError = error;

    await put(STORES.BOOKMARKS, bookmark);
  }
}

/**
 * 创建"待清理"分类
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 分类对象
 */
export async function createPendingCleanupCategory() {
  // 检查是否已存在
  const categories = await getAllCategories();
  let category = categories.find(c => c.name === '待清理');

  if (!category) {
    category = {
      id: 'pending-cleanup-' + Date.now(),
      name: '待清理',
      icon: '🗑️',
      description: '失效的收藏链接',
      createdAt: Date.now()
    };

    await addCategory(category);
  }

  return category;
}

/**
 * 将失效书签移至"待清理"分类
 * @param {Object} db - 数据库实例
 * @param {string} bookmarkId - 书签ID
 * @param {Object} checkResult - 检测结果
 */
export async function moveToPendingCleanup(bookmarkId, checkResult) {
  const bookmark = await getBookmark(bookmarkId);

  if (bookmark) {
    // 获取或创建"待清理"分类
    const category = await createPendingCleanupCategory();

    // 更新书签
    bookmark.categoryId = category.id;
    bookmark.status = 'broken';
    bookmark.lastChecked = Date.now();
    bookmark.checkError = checkResult.error;
    bookmark.checkStatusCode = checkResult.statusCode;
    bookmark.checkStatus = checkResult.status;

    await put(STORES.BOOKMARKS, bookmark);

    return { bookmark, category };
  }

  return null;
}

/**
 * 批量将失效书签移至"待清理"分类
 * @param {Object} db - 数据库实例
 * @param {Array<Object>} brokenLinks - 失效链接数组
 * @returns {Promise<number>} 移动的数量
 */
export async function batchMoveToPendingCleanup(brokenLinks) {
  let movedCount = 0;

  for (const link of brokenLinks) {
    if (link.bookmarkId) {
      await moveToPendingCleanup(link.bookmarkId, link);
      movedCount++;
    }
  }

  return movedCount;
}

/**
 * 创建定期检测任务
 * @param {number} interval - 检测间隔（毫秒）
 * @returns {Promise<string>} Alarm名称
 */
export function createCheckTask(interval = 7 * 24 * 60 * 60 * 1000) {
  // 默认每周检测一次
  return chrome.alarms.create('checkBrokenLinks', {
    periodInMinutes: interval / 60 / 1000
  });
}

/**
 * 取消定期检测任务
 * @returns {Promise<boolean>} 是否成功取消
 */
export function cancelCheckTask() {
  return chrome.alarms.clear('checkBrokenLinks');
}
