// Smart Bookmarks - 链接检测工具
// 用于检测收藏链接是否有效

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
    timeout = 6000,   // 缩短超时：大多数失效站点 3~5s 内即可确认
    method = 'HEAD',
    followRedirects = true,
    retries = 1       // 减少重试：1 次即可，避免在失效链接上浪费时间
  } = options;

  // 尝试多次检测以提高准确性
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // Chrome 扩展 Background Service Worker 配合 host_permissions: ["<all_urls>"]
      // 可以直接发起跨域请求，无需 no-cors 模式
      const response = await fetch(url, {
        method,
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

      // 4xx / 5xx 视为失效
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
        // 如果还有重试机会，继续重试
        if (attempt < retries) {
          // 等待一小段时间后重试
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

      // 网络错误（DNS失败、连接失败等）
      const errorType = classifyError(error);

      // 如果是临时错误且还有重试机会
      if (isTemporaryError(error) && attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        continue;
      }

      return {
        url,
        status: errorType === 'dns' ? 'dns_error' : 'network_error',
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
    401: '未授权',
    403: '禁止访问',
    404: '页面不存在',
    405: '方法不允许',
    408: '请求超时',
    410: '资源已删除',
    429: '请求过多',
    500: '服务器错误',
    502: '网关错误',
    503: '服务不可用',
    504: '网关超时',
    599: '网络连接超时'
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
    if (result.status !== 'ok' && result.status !== 'unknown') {
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
  return results.filter(r =>
    r.status !== 'ok' && r.status !== 'unknown'
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

  // 建立 url → bookmark 映射
  const urlToBookmark = new Map(bookmarks.map(b => [b.url, b]));

  const results = await checkLinks(
    bookmarks.map(b => b.url),
    {
      ...checkOptions,
      // 每条 URL 检测完立即更新对应书签状态并触发增量保存
      onItemComplete: async (result) => {
        if (!result) return;
        const bookmark = urlToBookmark.get(result.url);
        if (bookmark) {
          bookmark.status = result.status === 'ok' ? 'active' : 'broken';
          bookmark.checkError = result.error;
          bookmark.checkStatusCode = result.statusCode;
          bookmark.checkStatus = result.status;
          bookmark.lastChecked = Date.now();
          if (onItemChecked) {
            await onItemChecked(bookmark);
          }
        }
      },
      onProgress: (completed, total, brokenLinks) => {
        const brokenWithIds = brokenLinks.map(r => ({
          ...r,
          bookmarkId: urlToBookmark.get(r.url)?.id,
          bookmarkTitle: urlToBookmark.get(r.url)?.title
        }));
        if (onProgress) onProgress(completed, total, brokenWithIds);
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
