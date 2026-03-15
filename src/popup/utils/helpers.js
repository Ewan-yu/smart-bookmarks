/**
 * 公共工具函数
 * 提供 DOM 操作、格式化、验证等通用功能
 */

// ==================== DOM 操作 ====================

/**
 * 转义 HTML 特殊字符
 * @param {string} str - 要转义的字符串
 * @returns {string} 转义后的字符串
 */
export function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  const htmlEntities = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;'
  };
  return str.replace(/[&<>"'/]/g, char => htmlEntities[char]);
}

/**
 * 创建 DOM 元素
 * @param {string} tag - 标签名
 * @param {Object} attributes - 属性对象
 * @param {string|Element|Array} content - 内容
 * @returns {Element} DOM 元素
 */
export function createElement(tag, attributes = {}, content = null) {
  const element = document.createElement(tag);

  // 设置属性
  Object.entries(attributes).forEach(([key, value]) => {
    if (key === 'className') {
      element.className = value;
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(element.style, value);
    } else if (key.startsWith('data-')) {
      element.setAttribute(key, value);
    } else if (key in element) {
      element[key] = value;
    } else {
      element.setAttribute(key, value);
    }
  });

  // 设置内容
  if (content !== null) {
    if (typeof content === 'string') {
      element.innerHTML = content;
    } else if (content instanceof Element) {
      element.appendChild(content);
    } else if (Array.isArray(content)) {
      content.forEach(child => {
        if (typeof child === 'string') {
          element.appendChild(document.createTextNode(child));
        } else if (child instanceof Element) {
          element.appendChild(child);
        }
      });
    }
  }

  return element;
}

/**
 * 查询元素
 * @param {string} selector - 选择器
 * @param {Element} parent - 父元素（默认为 document）
 * @returns {Element|null} 找到的元素或 null
 */
export function query(selector, parent = document) {
  return parent.querySelector(selector);
}

/**
 * 查询所有元素
 * @param {string} selector - 选择器
 * @param {Element} parent - 父元素（默认为 document）
 * @returns {NodeList} 找到的元素列表
 */
export function queryAll(selector, parent = document) {
  return parent.querySelectorAll(selector);
}

// ==================== 格式化函数 ====================

/**
 * 截断文本
 * @param {string} text - 要截断的文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀（默认为 '...'）
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength, suffix = '...') {
  if (typeof text !== 'string') return text;
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + suffix;
}

/**
 * 截断 URL
 * @param {string} url - URL
 * @param {number} maxLength - 最大长度
 * @returns {string} 截断后的 URL
 */
export function truncateUrl(url, maxLength) {
  return truncateText(url, maxLength);
}

/**
 * 格式化日期
 * @param {Date|string|number} date - 日期
 * @param {string} format - 格式（'short', 'long', 'relative'）
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'short') {
  const d = date instanceof Date ? date : new Date(date);

  if (isNaN(d.getTime())) {
    return '无效日期';
  }

  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (format === 'relative') {
    if (seconds < 60) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    if (days < 30) return `${Math.floor(days / 7)}周前`;
    if (days < 365) return `${Math.floor(days / 30)}个月前`;
    return `${Math.floor(days / 365)}年前`;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours24 = String(d.getHours()).padStart(2, '0');
  const minutes24 = String(d.getMinutes()).padStart(2, '0');

  if (format === 'short') {
    return `${year}-${month}-${day}`;
  }

  if (format === 'long') {
    return `${year}年${month}月${day}日 ${hours24}:${minutes24}`;
  }

  return d.toLocaleDateString('zh-CN');
}

/**
 * 格式化文件大小
 * @param {number} bytes - 字节数
 * @returns {string} 格式化后的大小
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * 格式化数字
 * @param {number} num - 数字
 * @returns {string} 格式化后的数字（如 1,234）
 */
export function formatNumber(num) {
  return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/**
 * 高亮搜索关键词
 * @param {string} text - 原文本
 * @param {string} keyword - 关键词
 * @param {string} className - 高亮类名
 * @returns {string} 包含高亮标记的 HTML
 */
export function highlightKeyword(text, keyword, className = 'highlight') {
  if (!keyword || !text) return escapeHtml(text);

  const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedKeyword})`, 'gi');

  return text.replace(regex, (match) => {
    return `<span class="${className}">${escapeHtml(match)}</span>`;
  });
}

// ==================== 验证函数 ====================

/**
 * 验证 URL
 * @param {string} url - URL 字符串
 * @returns {boolean} 是否有效
 */
export function isValidUrl(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * 验证电子邮件
 * @param {string} email - 电子邮件地址
 * @returns {boolean} 是否有效
 */
export function isValidEmail(email) {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * 验证是否为空
 * @param {*} value - 要检查的值
 * @returns {boolean} 是否为空
 */
export function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

// ==================== 工具函数 ====================

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} delay - 延迟时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
export function debounce(func, delay = 300) {
  let timeoutId = null;

  return function debounced(...args) {
    clearTimeout(timeoutId);

    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} interval - 间隔时间（毫秒）
 * @returns {Function} 节流后的函数
 */
export function throttle(func, interval = 300) {
  let lastTime = 0;

  return function throttled(...args) {
    const now = Date.now();

    if (now - lastTime >= interval) {
      lastTime = now;
      func.apply(this, args);
    }
  };
}

/**
 * 深度克隆对象
 * @param {*} obj - 要克隆的对象
 * @returns {*} 克隆后的对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Object) {
    const clonedObj = {};
    Object.keys(obj).forEach(key => {
      clonedObj[key] = deepClone(obj[key]);
    });
    return clonedObj;
  }
}

/**
 * 深度比较两个对象是否相等
 * @param {*} obj1 - 对象1
 * @param {*} obj2 - 对象2
 * @returns {boolean} 是否相等
 */
export function deepEqual(obj1, obj2) {
  if (obj1 === obj2) return true;
  if (obj1 == null || obj2 == null) return false;
  if (typeof obj1 !== typeof obj2) return false;

  if (typeof obj1 !== 'object') return obj1 === obj2;

  if (Array.isArray(obj1) !== Array.isArray(obj2)) return false;

  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);

  if (keys1.length !== keys2.length) return false;

  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }

  return true;
}

/**
 * 生成唯一 ID
 * @param {string} prefix - 前缀
 * @returns {string} 唯一 ID
 */
export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise} Promise
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 批量处理数组
 * @param {Array} array - 要处理的数组
 * @param {number} batchSize - 批次大小
 * @param {Function} processor - 处理函数
 * @returns {Promise} Promise
 */
export async function processBatch(array, batchSize, processor) {
  const results = [];

  for (let i = 0; i < array.length; i += batchSize) {
    const batch = array.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    // 让出控制权，避免阻塞 UI
    await delay(0);
  }

  return results;
}

/**
 * 标准化 URL（用于比较）
 * @param {string} url - URL
 * @returns {string} 标准化后的 URL
 */
export function normalizeUrl(url) {
  try {
    let normalized = url.trim().toLowerCase();

    // 移除常见的跟踪参数
    const urlObj = new URL(normalized);
    const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'];
    paramsToRemove.forEach(param => urlObj.searchParams.delete(param));

    normalized = urlObj.href;

    // 移除末尾的 /
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1);
    }

    return normalized;
  } catch {
    return url.trim().toLowerCase();
  }
}

/**
 * 检查是否在书签栏中
 * @param {Object} item - 书签或分类对象
 * @returns {boolean} 是否在书签栏中
 */
export function isInBookmarksBar(item) {
  if (!item) return false;

  // 检查是否有路径信息
  if (item.path && item.path.length > 0) {
    return item.path[0] === '书签栏' || item.path[0] === 'Bookmarks Bar';
  }

  return false;
}

// ==================== 常量 ====================

/**
 * CSS 变量名
 */
export const CSSVars = {
  primary: '--c-primary',
  primaryHover: '--c-primary-h',
  bg: '--c-bg',
  surface: '--c-surface',
  border: '--c-border',
  text: '--c-text',
  textMuted: '--c-muted',
  danger: '--c-danger',
  success: '--c-success',
  warning: '--c-warning'
};

/**
 * 获取 CSS 变量值
 * @param {string} name - 变量名
 * @returns {string} 变量值
 */
export function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * 构建分类面包屑路径
 * @param {Object} category - 分类对象
 * @param {Array} categories - 所有分类数组
 * @returns {Array} 路径数组（从根到当前分类）
 */
export function buildCategoryPath(category, categories) {
  if (!category) return [];

  const path = [category.name];
  let currentCat = category;
  const visited = new Set();

  // 向上遍历父分类
  while (currentCat.parentId && !visited.has(currentCat.id)) {
    visited.add(currentCat.id);

    const parentCat = categories.find(c => c.id === currentCat.parentId);
    if (!parentCat) break;

    path.unshift(parentCat.name);
    currentCat = parentCat;

    // 防止无限循环（最多10层）
    if (path.length > 10) break;
  }

  return path;
}

/**
 * 格式化路径为字符串
 * @param {Array} path - 路径数组
 * @param {string} separator - 分隔符（默认 ' › '）
 * @returns {string} 格式化的路径字符串
 */
export function formatPath(path, separator = ' › ') {
  if (!Array.isArray(path)) return '';
  return path.join(separator);
}

// ==================== 存储函数 ====================

/**
 * 安全地从 localStorage 读取数据
 * 处理隐私模式和存储配额超限等异常情况
 * @param {string} key - 存储键
 * @param {*} defaultValue - 默认值（当读取失败或不存在时返回）
 * @returns {*} 存储的值或默认值
 */
export function safeGetStorage(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (item === null) return defaultValue;
    return item;
  } catch (error) {
    console.warn(`[Storage] Failed to read localStorage key "${key}":`, error.message);
    // 可能是隐私模式或存储已满
    return defaultValue;
  }
}

/**
 * 安全地向 localStorage 写入数据
 * 处理隐私模式和存储配额超限等异常情况
 * @param {string} key - 存储键
 * @param {string} value - 要存储的值
 * @returns {boolean} 是否成功
 */
export function safeSetStorage(key, value) {
  try {
    localStorage.setItem(key, String(value));
    return true;
  } catch (error) {
    console.warn(`[Storage] Failed to write localStorage key "${key}":`, error.message);
    // 可能是隐私模式或存储已满
    return false;
  }
}

/**
 * 安全地从 localStorage 移除数据
 * @param {string} key - 存储键
 * @returns {boolean} 是否成功
 */
export function safeRemoveStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`[Storage] Failed to remove localStorage key "${key}":`, error.message);
    return false;
  }
}

/**
 * 解析 JSON 字符串（带错误处理）
 * @param {string} jsonStr - JSON字符串
 * @param {*} defaultValue - 默认值（解析失败时返回）
 * @returns {*} 解析后的对象或默认值
 */
export function safeParseJSON(jsonStr, defaultValue = null) {
  if (!jsonStr || typeof jsonStr !== 'string') return defaultValue;
  try {
    return JSON.parse(jsonStr);
  } catch (error) {
    console.warn('[JSON] Failed to parse:', error.message);
    return defaultValue;
  }
}
