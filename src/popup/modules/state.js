/**
 * 状态管理模块
 * 集中管理应用状态，提供状态读取、更新和订阅功能
 */

import eventBus from './event-bus.js';

/**
 * 状态管理器
 * 使用代理对象实现响应式状态更新
 */
class StateManager {
  constructor() {
    // 初始状态
    this._state = {
      // 书签数据
      bookmarks: [],
      categories: [],
      tags: [],

      // 当前选中
      selectedFolderId: null,
      selectedBookmarkIds: [],

      // 导航状态
      currentView: 'all', // all, recent, broken, tags, folder
      breadcrumb: [],

      // 搜索状态
      searchQuery: '',
      searchResults: [],
      isSearching: false,

      // AI 分析状态
      isAnalyzing: false,
      analysisProgress: {
        current: 0,
        total: 0,
        message: ''
      },
      analysisSession: null, // { id, bookmarkIds, completedBatches, etc. }

      // 链接检测状态
      isChecking: false,
      checkProgress: {
        current: 0,
        total: 0,
        eta: 0
      },

      // 同步状态
      isSyncing: false,

      // 加载状态
      isLoading: false,
      loadError: null,

      // UI 状态
      sidebarExpanded: true,
      taskPanelExpanded: false
    };

    // 订阅者：{ path: [callback1, callback2, ...] }
    this._subscribers = new Map();

    // 创建响应式代理
    this._proxy = this._createProxy(this._state);
  }

  /**
   * 创建响应式代理
   * @private
   */
  _createProxy(target, path = '') {
    return new Proxy(target, {
      get: (obj, prop) => {
        const value = obj[prop];
        const currentPath = path ? `${path}.${String(prop)}` : String(prop);

        // 如果是对象，递归创建代理
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          return this._createProxy(value, currentPath);
        }

        return value;
      },

      set: (obj, prop, value) => {
        const currentPath = path ? `${path}.${String(prop)}` : String(prop);
        const oldValue = obj[prop];

        // 值未改变，不触发更新
        if (oldValue === value) {
          return true;
        }

        obj[prop] = value;

        // 通知订阅者
        this._notify(currentPath, value, oldValue);

        // 发送全局状态变更事件
        eventBus.emit(eventBus.Events.STATE_CHANGED, {
          path: currentPath,
          value,
          oldValue
        });

        return true;
      }
    });
  }

  /**
   * 通知订阅者
   * @private
   */
  _notify(path, value, oldValue) {
    // 通知精确路径匹配的订阅者
    if (this._subscribers.has(path)) {
      const callbacks = this._subscribers.get(path);
      [...callbacks].forEach((callback) => {
        try {
          callback(value, oldValue);
        } catch (error) {
          console.error(`StateManager: Error in subscriber for "${path}":`, error);
        }
      });
    }

    // 通知父路径匹配的订阅者（例如订阅 'state.search' 会收到 'state.search.query' 的更新）
    const segments = path.split('.');
    for (let i = segments.length - 1; i > 0; i--) {
      const parentPath = segments.slice(0, i).join('.');
      if (this._subscribers.has(parentPath)) {
        const callbacks = this._subscribers.get(parentPath);
        [...callbacks].forEach((callback) => {
          try {
            callback(this.get(parentPath), oldValue);
          } catch (error) {
            console.error(`StateManager: Error in subscriber for "${parentPath}":`, error);
          }
        });
      }
    }
  }

  /**
   * 获取状态值
   * @param {string} path - 状态路径，例如 'bookmarks' 或 'searchQuery'
   * @param {*} defaultValue - 默认值
   * @returns {*} 状态值
   */
  get(path, defaultValue = undefined) {
    if (!path) {
      return this._proxy;
    }

    const segments = path.split('.');
    let value = this._proxy;

    for (const segment of segments) {
      if (value && typeof value === 'object' && segment in value) {
        value = value[segment];
      } else {
        return defaultValue;
      }
    }

    return value;
  }

  /**
   * 设置状态值
   * @param {string} path - 状态路径
   * @param {*} value - 新值
   */
  set(path, value) {
    const segments = path.split('.');
    let obj = this._proxy;
    const lastSegment = segments.pop();

    // 导航到父对象
    for (const segment of segments) {
      if (!(segment in obj)) {
        obj[segment] = {};
      }
      obj = obj[segment];
    }

    // 设置值
    obj[lastSegment] = value;
  }

  /**
   * 批量更新状态
   * @param {Object} updates - 更新对象 { path1: value1, path2: value2, ... }
   */
  setMultiple(updates) {
    Object.entries(updates).forEach(([path, value]) => {
      this.set(path, value);
    });
  }

  /**
   * 更新对象的某个属性
   * @param {string} path - 对象路径
   * @param {string} key - 属性名
   * @param {*} value - 新值
   */
  update(path, key, value) {
    const obj = this.get(path, {});
    obj[key] = value;
    this.set(path, obj);
  }

  /**
   * 数组操作：添加元素
   * @param {string} path - 数组路径
   * @param {*} item - 要添加的元素
   * @param {boolean} prepend - 是否添加到开头
   */
  add(path, item, prepend = false) {
    const arr = this.get(path, []);
    if (prepend) {
      arr.unshift(item);
    } else {
      arr.push(item);
    }
    this.set(path, arr);
  }

  /**
   * 数组操作：删除元素
   * @param {string} path - 数组路径
   * @param {*} item - 要删除的元素（或谓词函数）
   */
  remove(path, item) {
    const arr = this.get(path, []);
    let newArr;

    if (typeof item === 'function') {
      newArr = arr.filter(item);
    } else {
      newArr = arr.filter(i => i !== item);
    }

    this.set(path, newArr);
  }

  /**
   * 数组操作：更新元素
   * @param {string} path - 数组路径
   * @param {string|Function} finder - 查找条件（id 或谓词函数）
   * @param {Function} updater - 更新函数
   */
  updateItem(path, finder, updater) {
    const arr = this.get(path, []);
    const index = typeof finder === 'function'
      ? arr.findIndex(finder)
      : arr.findIndex(item => item.id === finder);

    if (index > -1) {
      arr[index] = updater(arr[index]);
      this.set(path, arr);
    }
  }

  /**
   * 订阅状态变更
   * @param {string} path - 状态路径
   * @param {Function} callback - 回调函数 (newValue, oldValue) => void
   * @returns {Function} 取消订阅函数
   */
  subscribe(path, callback) {
    if (typeof callback !== 'function') {
      throw new Error('StateManager: callback must be a function');
    }

    if (!this._subscribers.has(path)) {
      this._subscribers.set(path, []);
    }

    this._subscribers.get(path).push(callback);

    // 返回取消订阅函数
    return () => {
      if (this._subscribers.has(path)) {
        const callbacks = this._subscribers.get(path);
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
        if (callbacks.length === 0) {
          this._subscribers.delete(path);
        }
      }
    };
  }

  /**
   * 重置状态到初始值
   * @param {string} path - 可选，指定重置的路径
   */
  reset(path) {
    if (path) {
      // 重置特定路径（需要实现初始状态的深度复制）
      // 这里简化处理，重新初始化整个状态
      console.warn('StateManager: Partial reset not implemented, resetting all state');
      this._resetAll();
    } else {
      this._resetAll();
    }
  }

  /**
   * 重置所有状态
   * @private
   */
  _resetAll() {
    // 保留必要的代理引用
    const oldState = this._state;
    this._state = {
      // 重新初始化状态
      bookmarks: [],
      categories: [],
      tags: [],
      selectedFolderId: null,
      selectedBookmarkIds: [],
      currentView: 'all',
      breadcrumb: [],
      searchQuery: '',
      searchResults: [],
      isSearching: false,
      isAnalyzing: false,
      analysisProgress: { current: 0, total: 0, message: '' },
      analysisSession: null,
      isChecking: false,
      checkProgress: { current: 0, total: 0, eta: 0 },
      isSyncing: false,
      isLoading: false,
      loadError: null,
      sidebarExpanded: true,
      taskPanelExpanded: false
    };

    // 创建新代理
    this._proxy = this._createProxy(this._state);
  }

  /**
   * 获取状态的快照（用于调试）
   * @returns {Object} 状态快照
   */
  snapshot() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * 导出状态（用于持久化）
   * @returns {Object} 可序列化的状态
   */
  export() {
    return {
      // 只导出需要持久化的状态
      selectedFolderId: this._state.selectedFolderId,
      currentView: this._state.currentView,
      sidebarExpanded: this._state.sidebarExpanded,
      taskPanelExpanded: this._state.taskPanelExpanded
    };
  }

  /**
   * 导入状态（从持久化恢复）
   * @param {Object} savedState - 保存的状态
   */
  import(savedState) {
    if (savedState && typeof savedState === 'object') {
      Object.entries(savedState).forEach(([key, value]) => {
        if (key in this._state) {
          this._state[key] = value;
        }
      });
    }
  }
}

// 创建单例实例
const state = new StateManager();

// 导出代理对象，直接使用 state.bookmarks 而不是 state.get('bookmarks')
export default state._proxy;

// 同时也导出 StateManager 类和原始实例（用于高级用法）
export { StateManager };
export const stateManager = state;
