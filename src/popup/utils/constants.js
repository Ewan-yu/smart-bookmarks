/**
 * 常量定义
 * 集中管理项目中的魔术字符串、数字和配置值
 */

// ==================== 拖拽类型 ====================
export const DragTypes = {
  BOOKMARK: 'bookmark',
  FOLDER: 'folder'
};

// ==================== 键盘作用域 ====================
export const KeyboardScopes = {
  GLOBAL: 'global',
  DIALOG: 'dialog',
  LIST: 'list'
};

// ==================== UI 尺寸配置 ====================
export const SidebarConfig = {
  MIN_WIDTH: 180,
  MAX_WIDTH: 480,
  DEFAULT_WIDTH: 240
};

export const DialogSizes = {
  SMALL: 'small',
  MEDIUM: 'medium',
  LARGE: 'large'
};

export const DialogSizeMaxWidth = {
  small: '400px',
  medium: '600px',
  large: '800px'
};

// ==================== 性能相关 ====================
export const Performance = {
  // 每秒检测的链接数
  CHECK_RATE: 2,
  // 防抖延迟（毫秒）
  DEBOUNCE_DELAY: 300,
  // 节流间隔（毫秒）
  THROTTLE_INTERVAL: 300,
  // 拖拽排序时间戳间隔（毫秒）
  SORT_ORDER_INTERVAL: 1000
};

// ==================== 样式相关 ====================
export const PlaceholderConfig = {
  HEIGHT: 4,
  COLOR: 'var(--c-primary)', // 使用CSS变量而非硬编码颜色
  BORDER_RADIUS: '2px',
  MARGIN: '4px',
  SHADOW: '0 2px 4px rgba(99, 102, 241, 0.3)',
  TRANSITION: 'all 0.2s ease'
};

// ==================== 消息类型 ====================
export const MessageTypes = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// ==================== 书签状态 ====================
export const BookmarkStatus = {
  VALID: 'valid',
  INVALID: 'invalid',
  UNCERTAIN: 'uncertain',
  PENDING: 'pending'
};

// ==================== 分析相关 ====================
export const AnalysisDefaults = {
  BATCH_SIZE: 10,
  SIMILARITY_THRESHOLD: 0.75,
  MIN_MERGE_SUPPORT: 2
};

// ==================== 焦点选择器 ====================
export const FocusableSelectors = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(', ');

// ==================== 正则表达式 ====================
export const RegexPatterns = {
  // URL验证
  URL: /^https?:\/\/.+/i,
  // Email验证
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  // 提取域名
  DOMAIN: /^https?:\/\/([^\/\?#]+)/
};

// ==================== 时间格式 ====================
export const DateFormats = {
  SHORT: 'short',
  LONG: 'long',
  FULL: 'full'
};

// ==================== 键盘快捷键 ====================
export const KeyboardShortcuts = {
  SEARCH: 'Ctrl+K',
  SEARCH_ALT: 'Ctrl+F',
  EDIT: 'F2',
  DELETE: 'Delete',
  DELETE_ALT: 'Backspace',
  CONTEXT_MENU: 'Shift+F10',
  CLOSE: 'Escape',
  HELP: 'Ctrl+Shift+?'
};

// ==================== 本地存储键 ====================
export const StorageKeys = {
  SIDEBAR_WIDTH: 'sidebarWidth',
  THEME: 'theme',
  API_CONFIG: 'apiConfig'
};
