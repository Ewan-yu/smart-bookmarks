/**
 * 键盘导航模块
 * 处理全局快捷键和列表键盘导航
 */

import eventBus, { Events } from '../utils/event-bus.js';

/**
 * 键盘导航管理器
 */
class KeyboardNavigationManager {
  constructor() {
    this.isEnabled = true;
    this.keyHandlers = new Map();
    this.scope = 'global'; // global, dialog, list
    this.previousScope = 'global';

    this._initDefaultHandlers();
  }

  /**
   * 初始化键盘导航（全局快捷键 + 列表导航 + 对话框导航）
   */
  init() {
    this._bindGlobalEvents();
    this._bindListNavigation();
    this._bindDialogNavigation();
  }

  /**
   * 初始化默认快捷键处理器
   * @private
   */
  _initDefaultHandlers() {
    // 全局快捷键
    this.registerHandler('global', 'Ctrl+K', () => {
      // 聚焦搜索框
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });

    this.registerHandler('global', 'Ctrl+F', () => {
      // 聚焦搜索框
      const searchInput = document.getElementById('searchInput');
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    });

    this.registerHandler('global', 'Escape', () => {
      // 关闭所有模态元素
      eventBus.emit(Events.KEYBOARD_ACTION, {
        action: 'closeAll'
      });
    });

    this.registerHandler('global', 'F2', () => {
      // 编辑当前选中项
      eventBus.emit(Events.KEYBOARD_ACTION, {
        action: 'edit'
      });
    });

    this.registerHandler('global', 'Delete', () => {
      // 删除当前选中项
      eventBus.emit(Events.KEYBOARD_ACTION, {
        action: 'delete'
      });
    });

    this.registerHandler('global', 'Ctrl+Shift+?', () => {
      // 显示快捷键帮助
      this._showShortcutHelp();
    });
  }

  /**
   * 绑定全局事件
   * @private
   */
  _bindGlobalEvents() {
    // 保存处理器引用以便后续清理
    this._handleGlobalKeydown = (e) => {
      if (!this.isEnabled) return;

      const shortcut = this._getShortcutString(e);
      this._handleShortcut(shortcut, e);
    };

    document.addEventListener('keydown', this._handleGlobalKeydown);
  }

  /**
   * 绑定列表导航
   * @private
   */
  _bindListNavigation() {
    const bookmarkList = document.getElementById('bookmarkList');
    if (!bookmarkList) return;

    // 保存处理器引用以便后续清理
    this._handleListKeydown = (e) => {
      if (this.scope !== 'global') return;

      const handled = this._handleListNavigation(e);
      if (handled) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    this._bookmarkListElement = bookmarkList;
    bookmarkList.addEventListener('keydown', this._handleListKeydown);
  }

  /**
   * 处理列表键盘导航
   * @private
   */
  _handleListNavigation(e) {
    const key = e.key;
    const target = e.target;

    // 方向键导航
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(key)) {
      return this._navigateList(key, target);
    }

    // Enter/Space 激活
    if ((key === 'Enter' || key === ' ') && this._isNavigableItem(target)) {
      target.click();
      return true;
    }

    // Shift+F10 打开右键菜单
    if (key === 'F10' && e.shiftKey) {
      return this._openContextMenu(target);
    }

    // Delete 删除
    if (key === 'Delete' || key === 'Backspace') {
      if (this._isNavigableItem(target)) {
        eventBus.emit(Events.KEYBOARD_ACTION, {
          action: 'delete',
          item: this._getItemFromElement(target)
        });
        return true;
      }
    }

    return false;
  }

  /**
   * 导航列表
   * @private
   */
  _navigateList(direction, currentElement) {
    const items = this._getNavigableItems();
    if (items.length === 0) return false;

    const currentIndex = items.indexOf(currentElement);
    if (currentIndex === -1 && items.length > 0) {
      items[0].focus();
      return true;
    }

    let nextIndex = currentIndex;

    switch (direction) {
      case 'ArrowDown':
      case 'ArrowRight':
        nextIndex = (currentIndex + 1) % items.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        nextIndex = (currentIndex - 1 + items.length) % items.length;
        break;
    }

    items[nextIndex].focus();
    this._scrollIntoView(items[nextIndex]);

    // 触发导航事件
    eventBus.emit(Events.KEYBOARD_ACTION, {
      action: 'navigate',
      direction,
      index: nextIndex,
      item: this._getItemFromElement(items[nextIndex])
    });

    return true;
  }

  /**
   * 获取可导航的元素列表
   * @private
   */
  _getNavigableItems() {
    const selectors = [
      '.bm-row[data-id]',
      '.bm-folder-row[data-id]',
      '.tree-node[data-id]',
      '.sidebar-nav-item',
      '.search-result-item'
    ];

    const items = [];
    for (const selector of selectors) {
      items.push(...Array.from(document.querySelectorAll(selector)));
    }

    // 过滤掉不可见和不可聚焦的元素
    return items.filter(el => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && el.tabIndex >= 0;
    });
  }

  /**
   * 检查元素是否是可导航项
   * @private
   */
  _isNavigableItem(element) {
    return element && (
      element.classList.contains('bm-row') ||
      element.classList.contains('bm-folder-row') ||
      element.classList.contains('tree-node') ||
      element.classList.contains('search-result-item')
    );
  }

  /**
   * 从元素获取项目数据
   * @private
   */
  _getItemFromElement(element) {
    if (!element) return null;
    return {
      id: element.dataset.id,
      type: element.dataset.type || (element.classList.contains('bm-folder-row') ? 'folder' : 'bookmark'),
      element
    };
  }

  /**
   * 打开右键菜单
   * @private
   */
  _openContextMenu(target) {
    if (!this._isNavigableItem(target)) return false;

    const item = this._getItemFromElement(target);
    const rect = target.getBoundingClientRect();

    eventBus.emit(Events.KEYBOARD_ACTION, {
      action: 'openContextMenu',
      item,
      position: {
        x: rect.left,
        y: rect.bottom + 2
      }
    });

    return true;
  }

  /**
   * 滚动元素到可见区域
   * @private
   */
  _scrollIntoView(element) {
    if (!element) return;

    const container = element.closest('[style*="overflow"]');
    if (container) {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    } else {
      element.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest'
      });
    }
  }

  /**
   * 绑定对话框导航
   * @private
   */
  _bindDialogNavigation() {
    // 对话框内的 Tab 键循环由浏览器处理
    // 这里处理 Escape 关闭
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        // 检查是否在对话框中
        const dialog = e.target.closest('.confirm-dialog-overlay, #editDialog');
        if (dialog) {
          eventBus.emit(Events.KEYBOARD_ACTION, {
            action: 'closeDialog',
            dialog
          });
        }
      }
    });
  }

  /**
   * 注册快捷键处理器
   * @param {string} scope - 作用域（global, dialog, list）
   * @param {string} shortcut - 快捷键字符串（如 'Ctrl+K', 'Escape'）
   * @param {Function} handler - 处理函数
   */
  registerHandler(scope, shortcut, handler) {
    if (!this.keyHandlers.has(scope)) {
      this.keyHandlers.set(scope, new Map());
    }
    this.keyHandlers.get(scope).set(shortcut.toLowerCase(), handler);
  }

  /**
   * 注销快捷键处理器
   * @param {string} scope - 作用域
   * @param {string} shortcut - 快捷键字符串
   */
  unregisterHandler(scope, shortcut) {
    const scopeHandlers = this.keyHandlers.get(scope);
    if (scopeHandlers) {
      scopeHandlers.delete(shortcut.toLowerCase());
    }
  }

  /**
   * 获取快捷键字符串
   * @private
   */
  _getShortcutString(event) {
    const parts = [];

    if (event.ctrlKey) parts.push('ctrl');
    if (event.altKey) parts.push('alt');
    if (event.shiftKey) parts.push('shift');
    if (event.metaKey) parts.push('meta');

    // 主键
    const key = event.key;
    if (key && !['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
      parts.push(key.toLowerCase());
    }

    return parts.join('+');
  }

  /**
   * 处理快捷键
   * @private
   */
  _handleShortcut(shortcut, event) {
    const shortcutLower = shortcut.toLowerCase();

    // 首先检查当前作用域
    const scopeHandlers = this.keyHandlers.get(this.scope);
    if (scopeHandlers && scopeHandlers.has(shortcutLower)) {
      const handler = scopeHandlers.get(shortcutLower);
      const result = handler(event);
      if (result !== false) {
        event.preventDefault();
      }
      return;
    }

    // 然后检查全局作用域
    const globalHandlers = this.keyHandlers.get('global');
    if (globalHandlers && globalHandlers.has(shortcutLower)) {
      const handler = globalHandlers.get(shortcutLower);
      const result = handler(event);
      if (result !== false) {
        event.preventDefault();
      }
    }
  }

  /**
   * 设置作用域
   * @param {string} scope - 新作用域
   */
  setScope(scope) {
    if (this.scope !== scope) {
      this.previousScope = this.scope;
      this.scope = scope;
    }
  }

  /**
   * 恢复上一个作用域
   */
  restoreScope() {
    if (this.previousScope) {
      const temp = this.scope;
      this.scope = this.previousScope;
      this.previousScope = temp;
    }
  }

  /**
   * 启用键盘导航
   */
  enable() {
    this.isEnabled = true;
  }

  /**
   * 禁用键盘导航
   */
  disable() {
    this.isEnabled = false;
  }

  /**
   * 显示快捷键帮助
   * @private
   */
  _showShortcutHelp() {
    eventBus.emit(Events.KEYBOARD_ACTION, {
      action: 'showHelp'
    });
  }

  /**
   * 获取快捷键列表
   */
  getShortcuts() {
    return [
      { key: 'Ctrl+K / Ctrl+F', description: '聚焦搜索框' },
      { key: '↑↓←→', description: '导航列表' },
      { key: 'Enter / Space', description: '激活选中项' },
      { key: 'F2', description: '编辑选中项' },
      { key: 'Delete / Backspace', description: '删除选中项' },
      { key: 'Shift+F10', description: '打开右键菜单' },
      { key: 'Escape', description: '关闭对话框/取消操作' },
      { key: 'Tab', description: '在表单中切换焦点' },
      { key: 'Ctrl+Shift+?', description: '显示此帮助' }
    ];
  }

  /**
   * 格式化快捷键显示
   * @param {string} shortcut - 快捷键字符串
   */
  formatShortcut(shortcut) {
    const parts = shortcut.split('+');
    const keyMap = {
      ctrl: 'Ctrl',
      alt: 'Alt',
      shift: 'Shift',
      meta: '⌘'
    };

    return parts.map(part => keyMap[part.toLowerCase()] || part.toUpperCase()).join('+');
  }

  /**
   * 创建快捷键帮助对话框内容
   */
  createHelpContent() {
    const shortcuts = this.getShortcuts();

    let html = `
      <div class="keyboard-shortcuts-help">
        <h3 style="margin-bottom: 16px;">⌨️ 键盘快捷键</h3>
        <div class="shortcuts-list">
    `;

    for (const shortcut of shortcuts) {
      html += `
        <div class="shortcut-item" style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--c-border);">
          <kbd class="shortcut-key" style="font-family: monospace; padding: 2px 8px; background: var(--c-bg-alt); border-radius: 4px; border: 1px solid var(--c-border);">${this.formatShortcut(shortcut.key)}</kbd>
          <span style="color: var(--c-text-2);">${shortcut.description}</span>
        </div>
      `;
    }

    html += `
        </div>
      </div>
    `;

    return html;
  }

  /**
   * 清理事件监听器
   * 注意：由于这是单例模式，通常不需要调用此方法
   * 仅在扩展卸载或页面完全重新加载时使用
   */
  destroy() {
    // 移除全局事件监听器
    if (this._handleGlobalKeydown) {
      document.removeEventListener('keydown', this._handleGlobalKeydown);
      this._handleGlobalKeydown = null;
    }

    // 移除列表导航事件监听器
    if (this._bookmarkListElement && this._handleListKeydown) {
      this._bookmarkListElement.removeEventListener('keydown', this._handleListKeydown);
      this._handleListKeydown = null;
      this._bookmarkListElement = null;
    }

    // 清理处理器引用
    this._handlers = {};

    // 清理状态
    this.isEnabled = true;
    this.scope = 'global';
  }
}

// 创建单例实例
const keyboardManager = new KeyboardNavigationManager();

export default keyboardManager;
