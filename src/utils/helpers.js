// Smart Bookmarks - 通用工具函数

/**
 * 转义 HTML 特殊字符，防止 XSS
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
 * 生成唯一 ID
 */
export function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 防抖函数
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 深度克隆对象
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj);
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (obj instanceof Object) {
    const clonedObj = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = deepClone(obj[key]);
      }
    }
    return clonedObj;
  }
}

/**
 * 格式化日期
 */
export function formatDate(timestamp, format = 'YYYY-MM-DD HH:mm:ss') {
  const date = new Date(timestamp);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return format
    .replace('YYYY', year)
    .replace('MM', month)
    .replace('DD', day)
    .replace('HH', hours)
    .replace('mm', minutes)
    .replace('ss', seconds);
}

/**
 * 相对时间
 */
export function relativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return `${years} 年前`;
  if (months > 0) return `${months} 个月前`;
  if (days > 0) return `${days} 天前`;
  if (hours > 0) return `${hours} 小时前`;
  if (minutes > 0) return `${minutes} 分钟前`;
  return '刚刚';
}

/**
 * 截断文本
 */
export function truncateText(text, maxLength = 100, suffix = '...') {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 高亮关键词
 * @param {string} text - 原文本
 * @param {string[]} keywords - 要高亮的关键词列表
 * @returns {string} 高亮后的 HTML 字符串
 */
export function highlightKeywords(text, keywords) {
  if (!text || !keywords || keywords.length === 0) return text;

  // 先转义 HTML，防止 XSS
  const escapedText = escapeHtml(text);

  // 转义关键词中的正则特殊字符
  const escapedKeywords = keywords.map(kw => escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

  const regex = new RegExp(`(${escapedKeywords.join('|')})`, 'gi');
  return escapedText.replace(regex, '<mark>$1</mark>');
}

/**
 * 提取域名
 */
export function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

/**
 * 判断是否为有效 URL
 */
export function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}

/**
 * 下载文件
 */
export function downloadFile(data, filename, type = 'application/json') {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 读取文件
 */
export function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(new Error('Failed to read file'));

    reader.readAsText(file);
  });
}

/**
 * 复制到剪贴板
 */
export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.error('Failed to copy:', error);
    return false;
  }
}

/**
 * 从剪贴板读取
 */
export async function readFromClipboard() {
  try {
    return await navigator.clipboard.readText();
  } catch (error) {
    console.error('Failed to read clipboard:', error);
    return null;
  }
}

/**
 * 本地存储封装
 */
export const storage = {
  async get(key) {
    const result = await chrome.storage.local.get(key);
    return result[key];
  },

  async set(key, value) {
    await chrome.storage.local.set({ [key]: value });
  },

  async remove(key) {
    await chrome.storage.local.remove(key);
  },

  async clear() {
    await chrome.storage.local.clear();
  }
};

/**
 * 发送消息到 background
 */
export function sendMessage(type, data = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, data }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * 显示通知
 */
export function showNotification(message, type = 'basic') {
  chrome.notifications.create({
    type,
    iconUrl: chrome.runtime.getURL('icons/icon48.png'),
    title: 'Smart Bookmarks',
    message
  });
}

// ==================== 根目录检测 ====================

/**
 * 已知的浏览器根目录名称（中英文）
 * 用于识别系统原生的根文件夹
 */
const KNOWN_ROOT_NAMES = new Set([
  // Chrome
  '书签栏', 'Bookmarks Bar', 'Bookmarks',
  '其他书签', 'Other Bookmarks',
  // Edge
  '收藏夹', 'Favorites',
  // 移动端
  '移动书签', 'Mobile Bookmarks'
]);

/**
 * 检查一个名称是否是浏览器原生根目录
 * @param {string} name - 文件夹名称
 * @returns {boolean}
 */
export function isNativeRootFolder(name) {
  if (!name) return false;
  return KNOWN_ROOT_NAMES.has(name);
}

/**
 * 动态获取当前浏览器的书签栏根目录信息
 * 通过 chrome.bookmarks.getTree() 实际检测，不依赖硬编码名称
 * 逻辑：根节点（parentId='0'）下的第一个文件夹就是书签栏
 * @returns {Promise<{id: string, title: string} | null>}
 */
export async function detectBookmarksBar() {
  try {
    const tree = await chrome.bookmarks.getTree();
    const rootChildren = tree[0]?.children || [];

    // 查找根节点下的第一个文件夹（不管叫什么名字）
    for (const node of rootChildren) {
      const isRootChild = node.parentId === '0' || node.parentId === 0;
      if (isRootChild && node.children) {
        return { id: node.id, title: node.title };
      }
    }

    // 降级：使用第一个有 children 的节点
    for (const node of rootChildren) {
      if (node.children) {
        return { id: node.id, title: node.title };
      }
    }
  } catch (error) {
    console.error('[helpers] detectBookmarksBar failed:', error);
  }
  return null;
}
