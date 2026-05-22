// Smart Bookmarks - 日志工具
// 提供日志级别控制，生产模式下关闭 debug 级日志

// 日志级别
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// 当前日志级别（可通过 chrome.storage 配置）
let currentLevel = LOG_LEVELS.DEBUG;

// 初始化日志级别
async function initLogLevel() {
  try {
    const result = await chrome.storage.local.get('logLevel');
    if (result.logLevel !== undefined) {
      currentLevel = result.logLevel;
    }
  } catch (error) {
    // 忽略错误，使用默认级别
  }
}

// 初始化时加载日志级别
initLogLevel();

/**
 * 设置日志级别
 * @param {number} level - 日志级别
 */
export function setLogLevel(level) {
  currentLevel = level;
  chrome.storage.local.set({ logLevel: level });
}

/**
 * 获取当前日志级别
 * @returns {number} 当前日志级别
 */
export function getLogLevel() {
  return currentLevel;
}

/**
 * Debug 级别日志
 * @param {...any} args - 日志参数
 */
export function debug(...args) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    console.debug('[DEBUG]', ...args);
  }
}

/**
 * Info 级别日志
 * @param {...any} args - 日志参数
 */
export function info(...args) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    console.log('[INFO]', ...args);
  }
}

/**
 * Warn 级别日志
 * @param {...any} args - 日志参数
 */
export function warn(...args) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    console.warn('[WARN]', ...args);
  }
}

/**
 * Error 级别日志
 * @param {...any} args - 日志参数
 */
export function error(...args) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    console.error('[ERROR]', ...args);
  }
}

export default {
  LOG_LEVELS,
  setLogLevel,
  getLogLevel,
  debug,
  info,
  warn,
  error
};
