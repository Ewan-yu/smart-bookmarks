/**
 * 右键菜单模块
 * 管理书签和文件夹的上下文菜单
 */

import eventBus, { Events } from '../utils/event-bus.js';
import { escapeHtml } from '../utils/helpers.js';

/**
 * 右键菜单管理器
 */
class ContextMenuManager {
  constructor() {
    this.menuElement = null;
    this.currentItem = null;
    this.currentOptions = {};
    this.previousFocus = null;
    this.menuItems = this._getDefaultMenuItems();
    this.isVisible = false;
  }

  /**
   * 初始化右键菜单
   */
  init() {
    this.menuElement = document.getElementById('contextMenuEl');
    if (!this.menuElement) {
      console.warn('[ContextMenu] Menu element not found');
      return;
    }

    // 保存事件处理器引用，以便后续可以移除
    this._handleClick = (e) => {
      const btn = e.target.closest('.ctx-item');
      if (btn) {
        const action = btn.dataset.action;
        this._handleAction(action);
        this.hide();
      }
    };

    this._handleKeyboard = (e) => this._handleKeyboard(e);

    this._handleDocumentClick = (e) => {
      if (this.isVisible && !this.menuElement.contains(e.target)) {
        this.hide();
      }
    };

    this._handleDocumentContextMenu = (e) => {
      if (this.isVisible && !e.target.closest('.bm-row') && !e.target.closest('.bm-folder-row') && !e.target.closest('.tree-item')) {
        this.hide();
      }
    };

    this._bindEvents();
    this._renderMenu();
  }

  /**
   * 获取默认菜单项配置
   * @private
   */
  _getDefaultMenuItems() {
    return [
      // 通用菜单项
      {
        id: 'open',
        icon: '🔗',
        label: '打开链接',
        action: 'open',
        shortcut: 'Enter',
        for: 'bookmark'
      },
      {
        id: 'openIncognito',
        icon: '🕵️',
        label: '无痕打开',
        action: 'openIncognito',
        for: 'bookmark'
      },
      {
        id: 'openNewWindow',
        icon: '🪟',
        label: '新窗口打开',
        action: 'openNewWindow',
        for: 'bookmark'
      },
      { separator: true },
      {
        id: 'edit',
        icon: '✏️',
        label: '编辑',
        action: 'edit',
        shortcut: 'F2',
        for: 'both'
      },
      {
        id: 'copy',
        icon: '📋',
        label: '复制链接',
        action: 'copy',
        shortcut: 'Ctrl+C',
        for: 'bookmark'
      },
      {
        id: 'cut',
        icon: '✂️',
        label: '剪切',
        action: 'cut',
        shortcut: 'Ctrl+X',
        for: 'both'
      },
      {
        id: 'paste',
        icon: '📌',
        label: '粘贴',
        action: 'paste',
        shortcut: 'Ctrl+V',
        for: 'folder'
      },
      {
        id: 'move',
        icon: '📁',
        label: '移动到...',
        action: 'move',
        for: 'both'
      },
      { separator: true },
      {
        id: 'addTag',
        icon: '🏷️',
        label: '添加标签',
        action: 'addTag',
        for: 'bookmark'
      },
      {
        id: 'check',
        icon: '✅',
        label: '检测链接',
        action: 'check',
        for: 'bookmark'
      },
      {
        id: 'regenerateSummary',
        icon: '🔄',
        label: '重新生成摘要',
        action: 'regenerateSummary',
        for: 'bookmark'
      },
      { separator: true },
      // 文件夹专用菜单
      {
        id: 'addSubFolder',
        icon: '➕',
        label: '添加子文件夹',
        action: 'addSubFolder',
        for: 'folder'
      },
      {
        id: 'renameFolder',
        icon: '✏️',
        label: '重命名',
        action: 'renameFolder',
        for: 'folder'
      },
      {
        id: 'mergeFolder',
        icon: '🔀',
        label: '合并文件夹...',
        action: 'mergeFolder',
        for: 'folder'
      },
      { separator: true, for: 'folder' },
      // 删除菜单
      {
        id: 'delete',
        icon: '🗑️',
        label: '删除',
        action: 'delete',
        shortcut: 'Del',
        for: 'both',
        danger: true
      }
    ];
  }

  /**
   * 设置菜单项
   * @param {Array} items - 菜单项配置
   */
  setMenuItems(items) {
    this.menuItems = items;
    this._renderMenu();
  }

  /**
   * 渲染菜单
   * @private
   */
  _renderMenu() {
    if (!this.menuElement) return;

    let html = '';

    for (const item of this.menuItems) {
      if (item.separator) {
        html += `<div class="ctx-separator" data-item-id="${item.id || ''}"></div>`;
      } else {
        const shortcut = item.shortcut ? `<span class="ctx-shortcut">${escapeHtml(item.shortcut)}</span>` : '';
        const dangerClass = item.danger ? ' ctx-item-danger' : '';
        html += `
          <button
            class="ctx-item${dangerClass}"
            data-action="${item.action}"
            data-for="${item.for || 'both'}"
            data-item-id="${item.id}"
            tabindex="-1"
          >
            <span class="ctx-icon">${item.icon || ''}</span>
            <span class="ctx-label">${escapeHtml(item.label)}</span>
            ${shortcut}
          </button>
        `;
      }
    }

    this.menuElement.innerHTML = html;
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 点击菜单项
    this.menuElement.addEventListener('click', this._handleClick);

    // 键盘导航
    this.menuElement.addEventListener('keydown', this._handleKeyboard);

    // 点击外部关闭
    document.addEventListener('click', this._handleDocumentClick);

    // 右键其他地方关闭
    document.addEventListener('contextmenu', this._handleDocumentContextMenu);
  }

  /**
   * 显示菜单
   * @param {Object} item - 目标项目（书签或文件夹）
   * @param {number} x - 鼠标 X 坐标
   * @param {number} y - 鼠标 Y 坐标
   * @param {Object} options - 选项
   */
  show(item, x, y, options = {}) {
    if (!this.menuElement) return;

    this.currentItem = item;
    this.currentOptions = options;
    this.isVisible = true;

    // 保存触发元素，以便关闭时恢复焦点
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.dataset.bookmarkId || activeElement.dataset.folderId)) {
      this.previousFocus = activeElement;
    } else {
      this.previousFocus = null;
    }

    // 根据项目类型显示/隐藏菜单项
    this._updateMenuVisibility(item, options);

    // 显示菜单
    this.menuElement.style.display = 'block';

    // 计算位置，防止超出视口
    const position = this._calculatePosition(x, y);
    this.menuElement.style.left = `${position.left}px`;
    this.menuElement.style.top = `${position.top}px`;

    // 聚焦第一个可见菜单项
    setTimeout(() => {
      const firstItem = this.menuElement.querySelector('.ctx-item:not([style*="display: none"])');
      if (firstItem) {
        firstItem.focus();
      }
    }, 50);

    // 触发事件
    eventBus.emit(eventBus.Events.CONTEXT_MENU_SHOWN, {
      item,
      x: position.left,
      y: position.top,
      options
    });
  }

  /**
   * 隐藏菜单
   */
  hide() {
    if (!this.isVisible) return;

    this.isVisible = false;
    this.menuElement.style.display = 'none';

    // 恢复焦点
    if (this.previousFocus && this.previousFocus.parentNode) {
      try {
        this.previousFocus.focus();
      } catch (e) {
        console.debug('[ContextMenu] Failed to restore focus:', e.message);
      }
    }
    this.previousFocus = null;

    // 触发事件
    eventBus.emit(eventBus.Events.CONTEXT_MENU_HIDDEN);
  }

  /**
   * 根据项目类型更新菜单可见性
   * @private
   */
  _updateMenuVisibility(item, options) {
    const isFolder = item.type === 'folder';
    const isSidebar = options.source === 'sidebar';

    // 性能优化：合并DOM查询，一次性获取所有需要操作的元素
    // 原先两次 querySelectorAll 会导致两次DOM遍历，现在只遍历一次
    const allItems = this.menuElement.querySelectorAll('.ctx-item, .ctx-separator, [data-for]');

    // 使用Set记录已处理的元素，避免重复操作
    const processed = new Set();

    for (const el of allItems) {
      // 跳过已处理的元素
      if (processed.has(el)) continue;
      processed.add(el);

      // 重置所有菜单项和分隔符
      if (el.classList.contains('ctx-item') || el.classList.contains('ctx-separator')) {
        el.style.display = '';
      }

      // 根据类型显示/隐藏菜单项
      if (el.hasAttribute('data-for')) {
        const forType = el.dataset.for;
        let shouldShow = false;

        if (forType === 'both') {
          shouldShow = true;
        } else if (forType === 'bookmark' && !isFolder) {
          shouldShow = true;
        } else if (forType === 'folder' && isFolder) {
          shouldShow = true;
        }

        el.style.display = shouldShow ? '' : 'none';
      }
    }

    // 隐藏连续的分隔符
    this._hideConsecutiveSeparators();
  }

  /**
   * 隐藏连续的分隔符
   * @private
   */
  _hideConsecutiveSeparators() {
    const items = Array.from(this.menuElement.children);
    let prevWasSeparator = true; // 开头的分隔符也要隐藏

    items.forEach(item => {
      if (item.classList.contains('ctx-separator')) {
        if (prevWasSeparator || item.style.display === 'none') {
          item.style.display = 'none';
        }
        prevWasSeparator = true;
      } else if (item.style.display !== 'none') {
        prevWasSeparator = false;
      }
    });

    // 隐藏结尾的分隔符
    for (let i = items.length - 1; i >= 0; i--) {
      const item = items[i];
      if (item.classList.contains('ctx-separator') && item.style.display !== 'none') {
        item.style.display = 'none';
      } else if (item.style.display !== 'none') {
        break;
      }
    }
  }

  /**
   * 计算菜单位置
   * @private
   */
  _calculatePosition(x, y) {
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    // 先显示菜单以获取尺寸
    this.menuElement.style.visibility = 'hidden';
    this.menuElement.style.display = 'block';
    const mW = this.menuElement.offsetWidth;
    const mH = this.menuElement.offsetHeight;
    this.menuElement.style.visibility = '';
    this.menuElement.style.display = 'none';

    // 计算位置
    let left = x;
    let top = y;

    // 防止超出右边界
    if (left + mW > vpW - 4) {
      left = Math.max(4, vpW - mW - 4);
    }

    // 防止超出下边界
    if (top + mH > vpH - 4) {
      top = Math.max(4, vpH - mH - 4);
    }

    return { left, top };
  }

  /**
   * 处理键盘事件
   * @private
   */
  _handleKeyboard(e) {
    const items = Array.from(this.menuElement.querySelectorAll('.ctx-item:not([style*="display: none"])'));
    if (items.length === 0) return;

    const currentIndex = items.indexOf(document.activeElement);

    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        this.hide();
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (currentIndex < items.length - 1) {
          items[currentIndex + 1].focus();
        } else {
          items[0].focus();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (currentIndex > 0) {
          items[currentIndex - 1].focus();
        } else {
          items[items.length - 1].focus();
        }
        break;

      case 'Home':
        e.preventDefault();
        items[0].focus();
        break;

      case 'End':
        e.preventDefault();
        items[items.length - 1].focus();
        break;

      case 'Enter':
      case ' ':
        e.preventDefault();
        if (document.activeElement.classList.contains('ctx-item')) {
          document.activeElement.click();
        }
        break;
    }
  }

  /**
   * 处理菜单操作
   * @private
   */
  _handleAction(action) {
    if (!this.currentItem) return;

    // 触发事件，让外部处理具体操作
    eventBus.emit(Events.CONTEXT_MENU_ACTION, {
      action,
      item: this.currentItem,
      options: this.currentOptions
    });
  }

  /**
   * 检查菜单是否可见
   */
  getIsVisible() {
    return this.isVisible;
  }

  /**
   * 获取当前选中的项目
   */
  getCurrentItem() {
    return this.currentItem;
  }

  /**
   * 清理事件监听器
   * 注意：由于这是单例模式，通常不需要调用此方法
   * 仅在扩展卸载或页面完全重新加载时使用
   */
  destroy() {
    // 移除事件监听器
    if (this.menuElement) {
      this.menuElement.removeEventListener('click', this._handleClick);
      this.menuElement.removeEventListener('keydown', this._handleKeyboard);
    }

    document.removeEventListener('click', this._handleDocumentClick);
    document.removeEventListener('contextmenu', this._handleDocumentContextMenu);

    // 清理处理器引用
    this._handleClick = null;
    this._handleKeyboard = null;
    this._handleDocumentClick = null;
    this._handleDocumentContextMenu = null;

    // 清理状态
    this.currentItem = null;
    this.currentOptions = {};
    this.previousFocus = null;
    this.isVisible = false;
  }
}

// 创建单例实例
const contextMenuManager = new ContextMenuManager();

export default contextMenuManager;
