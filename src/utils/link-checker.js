// Smart Bookmarks - 链接检测工具
// 用于检测收藏链接是否有效

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
    timeout = 10000,
    method = 'HEAD',
    followRedirects = true,
    retries = 2
  } = options;

  // 尝试多次检测以提高准确性
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      // 使用 chrome.fetch API 来绕过 CORS 限制
      let response;

      // 检查是否在 Chrome 扩展环境中
      if (typeof chrome !== 'undefined' && chrome.fetch) {
        // 使用 Chrome 扩展的 fetch API
        response = await chrome.fetch(url, {
          method,
          redirect: followRedirects ? 'follow' : 'manual',
          signal: controller.signal
        });
      } else {
        // 降级到标准 fetch，使用 no-cors 模式
        response = await fetch(url, {
          method,
          redirect: followRedirects ? 'follow' : 'manual',
          signal: controller.signal,
          mode: 'no-cors'
        });
      }

      clearTimeout(timeoutId);

      // 获取状态码
      const statusCode = response.status || 0;

      // 判断链接是否有效
      // 状态码 2xx 和 3xx 视为有效，4xx 和 5xx 视为失效
      if (statusCode >= 200 && statusCode < 400) {
        return {
          url,
          status: 'ok',
          statusCode,
          redirected: response.redirected || false,
          error: null,
          attempt: attempt + 1
        };
      } else if (statusCode >= 400) {
        // 客户端错误或服务器错误
        return {
          url,
          status: 'broken',
          statusCode,
          error: getErrorMessage(statusCode),
          attempt: attempt + 1
        };
      } else if (statusCode === 0 && response.type === 'opaque') {
        // no-cors 模式下的 opaque 响应，无法确定状态
        // 尝试使用 GET 请求再次验证
        if (method === 'HEAD') {
          clearTimeout(timeoutId);
          const getResult = await checkLink(url, {
            ...options,
            method: 'GET',
            retries: 0
          });
          return getResult;
        }

        // 无法确定状态，视为可能有效
        return {
          url,
          status: 'unknown',
          statusCode: 0,
          error: '无法验证（CORS限制）',
          attempt: attempt + 1
        };
      }

      return {
        url,
        status: 'ok',
        statusCode,
        redirected: response.redirected || false,
        error: null,
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
 * 批量检测链接（带并发控制和进度报告）
 * @param {Array<string>} urls - URL数组
 * @param {Object} options - 检测选项
 * @param {number} options.concurrency - 并发数，默认3（避免过多并发导致性能问题）
 * @param {Function} options.onProgress - 进度回调函数 (completed, total, brokenLinks)
 * @param {number} options.delay - 批次间延迟（毫秒），默认500
 * @returns {Promise<Array<Object>>} 检测结果数组
 */
export async function checkLinks(urls, options = {}) {
  const {
    concurrency = 3,
    onProgress,
    delay = 500,
    ...checkOptions
  } = options;

  const results = [];
  let completed = 0;
  const total = urls.length;
  const brokenLinks = [];

  // 分批处理以控制并发
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    // 并发检测当前批次
    const batchResults = await Promise.all(
      batch.map(url => checkLink(url, checkOptions))
    );

    results.push(...batchResults);

    // 统计失效链接
    for (const result of batchResults) {
      if (result.status !== 'ok' && result.status !== 'unknown') {
        brokenLinks.push(result);
      }
    }

    completed += batch.length;

    // 报告进度
    if (onProgress) {
      onProgress(completed, total, brokenLinks);
    }

    // 批次间延迟，避免过于频繁的请求
    if (i + concurrency < urls.length && delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

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
 * @returns {Promise<Array<Object>>} 检测结果数组
 */
export async function checkBookmarks(bookmarks, options = {}) {
  const {
    onProgress,
    ...checkOptions
  } = options;

  // 创建URL到书签的映射
  const urlToBookmark = {};
  bookmarks.forEach(b => {
    urlToBookmark[b.url] = b;
  });

  // 执行检测
  const results = await checkLinks(
    bookmarks.map(b => b.url),
    {
      ...checkOptions,
      onProgress: (completed, total, brokenLinks) => {
        // 将URL映射回书签ID
        const brokenWithIds = brokenLinks.map(result => ({
          ...result,
          bookmarkId: urlToBookmark[result.url]?.id,
          bookmarkTitle: urlToBookmark[result.url]?.title
        }));

        if (onProgress) {
          onProgress(completed, total, brokenWithIds);
        }
      }
    }
  );

  // 更新书签状态
  for (const result of results) {
    const bookmark = urlToBookmark[result.url];
    if (bookmark) {
      bookmark.status = result.status === 'ok' ? 'active' : 'broken';
      bookmark.checkError = result.error;
      bookmark.checkStatusCode = result.statusCode;
      bookmark.checkStatus = result.status;
      bookmark.lastChecked = result.timestamp || Date.now();
    }
  }

  return results;
}

/**
 * 更新书签状态
 * @param {Object} db - 数据库实例
 * @param {string} bookmarkId - 书签ID
 * @param {string} status - 状态
 * @param {string} error - 错误信息
 */
export async function updateBookmarkStatus(db, bookmarkId, status, error = null) {
  const bookmark = await db.getBookmark(bookmarkId);

  if (bookmark) {
    bookmark.status = status === 'ok' ? 'active' : 'broken';
    bookmark.lastChecked = Date.now();
    bookmark.checkError = error;

    await db.putBookmark(bookmark);
  }
}

/**
 * 创建"待清理"分类
 * @param {Object} db - 数据库实例
 * @returns {Promise<Object>} 分类对象
 */
export async function createPendingCleanupCategory(db) {
  // 检查是否已存在
  const categories = await db.getAllCategories();
  let category = categories.find(c => c.name === '待清理');

  if (!category) {
    category = {
      id: 'pending-cleanup-' + Date.now(),
      name: '待清理',
      icon: '🗑️',
      description: '失效的收藏链接',
      createdAt: Date.now()
    };

    await db.addCategory(category);
  }

  return category;
}

/**
 * 将失效书签移至"待清理"分类
 * @param {Object} db - 数据库实例
 * @param {string} bookmarkId - 书签ID
 * @param {Object} checkResult - 检测结果
 */
export async function moveToPendingCleanup(db, bookmarkId, checkResult) {
  const bookmark = await db.getBookmark(bookmarkId);

  if (bookmark) {
    // 获取或创建"待清理"分类
    const category = await createPendingCleanupCategory(db);

    // 更新书签
    bookmark.categoryId = category.id;
    bookmark.status = 'broken';
    bookmark.lastChecked = Date.now();
    bookmark.checkError = checkResult.error;
    bookmark.checkStatusCode = checkResult.statusCode;
    bookmark.checkStatus = checkResult.status;

    await db.putBookmark(bookmark);

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
export async function batchMoveToPendingCleanup(db, brokenLinks) {
  let movedCount = 0;

  for (const link of brokenLinks) {
    if (link.bookmarkId) {
      await moveToPendingCleanup(db, link.bookmarkId, link);
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
