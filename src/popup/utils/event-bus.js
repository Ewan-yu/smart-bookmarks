/**
 * 事件总线 - 用于模块间通信
 * 实现发布-订阅模式，解耦模块间依赖
 */

class EventBus {
  constructor() {
    // 存储事件监听器：{ eventName: [callback1, callback2, ...] }
    this._listeners = new Map();
    // 存储一次性监听器：{ eventName: [callback1, ...] }
    this._onceListeners = new Map();
  }

  /**
   * 订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  on(eventName, callback) {
    if (typeof callback !== 'function') {
      throw new Error('EventBus: callback must be a function');
    }

    if (!this._listeners.has(eventName)) {
      this._listeners.set(eventName, []);
    }

    this._listeners.get(eventName).push(callback);

    // 返回取消订阅函数
    return () => this.off(eventName, callback);
  }

  /**
   * 取消订阅事件
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数（可选，不传则取消该事件的所有监听器）
   */
  off(eventName, callback) {
    if (!this._listeners.has(eventName)) {
      return;
    }

    if (callback) {
      // 移除特定的回调
      const listeners = this._listeners.get(eventName);
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }

      // 如果没有监听器了，删除事件
      if (listeners.length === 0) {
        this._listeners.delete(eventName);
      }
    } else {
      // 移除该事件的所有监听器
      this._listeners.delete(eventName);
    }
  }

  /**
   * 发布事件
   * @param {string} eventName - 事件名称
   * @param {*} data - 事件数据
   */
  emit(eventName, data) {
    // 触发普通监听器
    if (this._listeners.has(eventName)) {
      const listeners = this._listeners.get(eventName);
      // 创建副本，避免在回调中修改数组影响迭代
      [...listeners].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: Error in listener for "${eventName}":`, error);
          // 错误不中断其他监听器
        }
      });
    }

    // 触发一次性监听器
    if (this._onceListeners.has(eventName)) {
      const onceListeners = this._onceListeners.get(eventName);
      // 清空一次性监听器（在触发之前）
      this._onceListeners.delete(eventName);

      // 触发所有一次性监听器
      [...onceListeners].forEach((callback) => {
        try {
          callback(data);
        } catch (error) {
          console.error(`EventBus: Error in once listener for "${eventName}":`, error);
        }
      });
    }
  }

  /**
   * 订阅一次性事件（触发后自动取消订阅）
   * @param {string} eventName - 事件名称
   * @param {Function} callback - 回调函数
   * @returns {Function} 取消订阅函数
   */
  once(eventName, callback) {
    if (typeof callback !== 'function') {
      throw new Error('EventBus: callback must be a function');
    }

    if (!this._onceListeners.has(eventName)) {
      this._onceListeners.set(eventName, []);
    }

    this._onceListeners.get(eventName).push(callback);

    // 返回取消订阅函数
    return () => {
      if (this._onceListeners.has(eventName)) {
        const listeners = this._onceListeners.get(eventName);
        const index = listeners.indexOf(callback);
        if (index > -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this._onceListeners.delete(eventName);
        }
      }
    };
  }

  /**
   * 移除所有监听器
   * @param {string} eventName - 可选，指定事件名称，不传则清空所有
   */
  clear(eventName) {
    if (eventName) {
      this._listeners.delete(eventName);
      this._onceListeners.delete(eventName);
    } else {
      this._listeners.clear();
      this._onceListeners.clear();
    }
  }

  /**
   * 获取事件的监听器数量
   * @param {string} eventName - 事件名称
   * @returns {number} 监听器数量
   */
  listenerCount(eventName) {
    const count = (this._listeners.get(eventName)?.length || 0) +
                  (this._onceListeners.get(eventName)?.length || 0);
    return count;
  }

  /**
   * 获取所有事件名称
   * @returns {string[]} 事件名称数组
   */
  eventNames() {
    const names = new Set([
      ...this._listeners.keys(),
      ...this._onceListeners.keys()
    ]);
    return Array.from(names);
  }
}

// 创建单例实例
const eventBus = new EventBus();

// 事件名称常量
export const Events = {
  // 书签事件
  BOOKMARKS_LOADED: 'bookmarks:loaded',
  BOOKMARK_CHANGED: 'bookmark:changed',
  BOOKMARK_ADDED: 'bookmark:added',
  BOOKMARK_UPDATED: 'bookmark:updated',
  BOOKMARK_DELETED: 'bookmark:deleted',
  BOOKMARKS_DELETED: 'bookmarks:deleted', // 批量删除

  // 分类/文件夹事件
  CATEGORIES_CHANGED: 'categories:changed',
  CATEGORY_ADDED: 'category:added',
  CATEGORY_UPDATED: 'category:updated',
  CATEGORY_DELETED: 'category:deleted',
  FOLDER_DELETED: 'folder:deleted',

  // 导航事件
  NAVIGATION_CHANGED: 'navigation:changed',
  FOLDER_SELECTED: 'folder:selected',
  BREADCRUMB_CHANGED: 'breadcrumb:changed',

  // 搜索事件
  SEARCH_PERFORMED: 'search:performed',
  SEARCH_CLEARED: 'search:cleared',
  SEARCH_RESULTS_UPDATED: 'search:results:updated',

  // AI 分析事件
  ANALYSIS_STARTED: 'analysis:started',
  ANALYSIS_PROGRESS: 'analysis:progress',
  ANALYSIS_COMPLETED: 'analysis:completed',
  ANALYSIS_CANCELLED: 'analysis:cancelled',
  ANALYSIS_FAILED: 'analysis:failed',

  // 链接检测事件
  CHECK_STARTED: 'check:started',
  CHECK_PROGRESS: 'check:progress',
  CHECK_COMPLETED: 'check:completed',
  CHECK_CANCELLED: 'check:cancelled',

  // 拖拽事件
  DRAG_STARTED: 'drag:started',
  DRAG_ENDED: 'drag:ended',
  BOOKMARK_REORDERED: 'bookmark:reordered',
  ITEM_MOVED_TO_FOLDER: 'item:moved:to:folder',
  MOVE_TO_FOLDER: 'move:to:folder',

  // 渲染事件
  CONTENT_AREA_RENDER: 'content:area:render',
  SIDEBAR_RENDER: 'sidebar:render',

  // 侧边栏事件
  SIDEBAR_RESIZE_STARTED: 'sidebar:resize:started',
  SIDEBAR_RESIZING: 'sidebar:resizing',
  SIDEBAR_RESIZE_ENDED: 'sidebar:resize:ended',
  SIDEBAR_TOGGLED: 'sidebar:toggled',

  // UI 事件
  DIALOG_OPENED: 'dialog:opened',
  DIALOG_CLOSED: 'dialog:closed',
  CONTEXT_MENU_SHOWN: 'contextmenu:shown',
  CONTEXT_MENU_HIDDEN: 'contextmenu:hidden',
  CONTEXT_MENU_ACTION: 'contextmenu:action',
  KEYBOARD_ACTION: 'keyboard:action',

  // 数据同步事件
  SYNC_STARTED: 'sync:started',
  SYNC_COMPLETED: 'sync:completed',
  SYNC_FAILED: 'sync:failed',

  // 状态事件
  STATE_CHANGED: 'state:changed',
  ERROR_OCCURRED: 'error:occurred',
  VIEW_CHANGED: 'view:changed',
  FOLDER_TREE_CHANGED: 'folder:tree:changed'
};

export default eventBus;
