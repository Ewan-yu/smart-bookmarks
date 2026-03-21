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

    this._handleKeyboardHandler = (e) => this._handleKeyboard(e);

    this._handleDocumentClick = (e) => {
      if (this.isVisible && !this.menuElement.contains(e.target)) {
        this.hide();
      }
    };

    this._bindEvents();
    // 不调用 _renderMenu()，保留 HTML 中的原始菜单项
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
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>',
        label: '打开链接',
        action: 'open',
        shortcut: 'Enter',
        for: 'bookmark'
      },
      {
        id: 'openIncognito',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
        label: '无痕打开',
        action: 'openIncognito',
        for: 'bookmark'
      },
      {
        id: 'openNewWindow',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>',
        label: '新窗口打开',
        action: 'openNewWindow',
        for: 'bookmark'
      },
      { separator: true },
      {
        id: 'edit',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        label: '编辑',
        action: 'edit',
        shortcut: 'F2',
        for: 'both'
      },
      {
        id: 'copy',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
        label: '复制链接',
        action: 'copy',
        shortcut: 'Ctrl+C',
        for: 'bookmark'
      },
      {
        id: 'cut',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><circle cx="18" cy="6" r="3"/><line x1="8.5" y1="7.5" x2="15.5" y2="7.5"/><line x1="6" y1="9" x2="6" y2="21"/><line x1="18" y1="9" x2="18" y2="11"/><path d="M14 21h6"/><path d="M17 18v6"/></svg>',
        label: '剪切',
        action: 'cut',
        shortcut: 'Ctrl+X',
        for: 'both'
      },
      {
        id: 'paste',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>',
        label: '粘贴',
        action: 'paste',
        shortcut: 'Ctrl+V',
        for: 'folder'
      },
      {
        id: 'move',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
        label: '移动到...',
        action: 'move',
        for: 'both'
      },
      { separator: true },
      {
        id: 'addTag',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>',
        label: '添加标签',
        action: 'addTag',
        for: 'bookmark'
      },
      {
        id: 'check',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        label: '检测链接',
        action: 'check',
        for: 'bookmark'
      },
      {
        id: 'regenerateSummary',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>',
        label: '重新生成摘要',
        action: 'regenerateSummary',
        for: 'bookmark'
      },
      { separator: true },
      // 文件夹专用菜单
      {
        id: 'addSubFolder',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>',
        label: '添加子文件夹',
        action: 'addSubFolder',
        for: 'folder'
      },
      {
        id: 'renameFolder',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
        label: '重命名',
        action: 'renameFolder',
        for: 'folder'
      },
      {
        id: 'mergeFolder',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>',
        label: '合并文件夹...',
        action: 'mergeFolder',
        for: 'folder'
      },
      { separator: true, for: 'folder' },
      // 删除菜单
      {
        id: 'delete',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
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
    console.log('[ContextMenu._renderMenu] 渲染菜单，menuItems 数量:', this.menuItems.length);

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
    console.log('[ContextMenu._renderMenu] 菜单渲染完成');
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 点击菜单项
    this.menuElement.addEventListener('click', this._handleClick);

    // 键盘导航
    this.menuElement.addEventListener('keydown', this._handleKeyboardHandler);

    // 点击外部关闭
    document.addEventListener('click', this._handleDocumentClick);

    // 不绑定 document contextmenu 事件（会导致菜单刚显示就被关闭）
  }

  /**
   * 显示菜单
   * @param {Object} item - 目标项目（书签或文件夹）
   * @param {number} x - 鼠标 X 坐标
   * @param {number} y - 鼠标 Y 坐标
   * @param {Object} options - 选项
   */
  show(item, x, y, options = {}) {
    if (!this.menuElement) {
      console.error('[ContextMenu] menuElement is null!');
      return;
    }

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

    // 计算位置，防止超出视口（必须在显示菜单之前）
    const position = this._calculatePosition(x, y);

    // 显示菜单
    this.menuElement.style.display = 'block';
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
    eventBus.emit(Events.CONTEXT_MENU_SHOWN, {
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
    eventBus.emit(Events.CONTEXT_MENU_HIDDEN);
  }

  /**
   * 根据项目类型更新菜单可见性
   * @private
   */
  _updateMenuVisibility(item, options) {
    const isFolder = item.type === 'folder';
    const isSidebar = options.source === 'sidebar';

    // 性能优化：合并DOM查询，一次性获取所有需要操作的元素
    const allItems = this.menuElement.querySelectorAll('.ctx-item, .ctx-separator, [data-for], [data-for-sidebar-only], [data-for-content-only]');

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

      // 处理 data-for-sidebar-only
      if (el.hasAttribute('data-for-sidebar-only')) {
        el.style.display = isSidebar ? '' : 'none';
        continue;
      }

      // 处理 data-for-content-only
      if (el.hasAttribute('data-for-content-only')) {
        el.style.display = isSidebar ? 'none' : '';
        continue;
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
      this.menuElement.removeEventListener('keydown', this._handleKeyboardHandler);
    }

    document.removeEventListener('click', this._handleDocumentClick);
    // document.removeEventListener('contextmenu', this._handleDocumentContextMenu);

    // 清理处理器引用
    this._handleClick = null;
    this._handleKeyboardHandler = null;
    this._handleDocumentClick = null;
    // this._handleDocumentContextMenu = null;

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
