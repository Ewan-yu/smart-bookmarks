/**
 * 导航模块
 * 负责侧边栏导航、面包屑导航和文件夹树的渲染和交互
 */

import eventBus, { Events } from '../utils/event-bus.js';
import { escapeHtml } from '../utils/helpers.js';
import bookmarkManager from './bookmarks.js';

/**
 * 导航管理器
 */
class NavigationManager {
  constructor() {
    this.currentView = 'all'; // all, recent, broken, tags, folder
    this.selectedFolderId = null;
    this.breadcrumb = [];
    this.sidebarExpanded = true;
  }

  /**
   * 初始化导航
   */
  init() {
    this._bindEvents();
  }

  /**
   * 绑定事件
   * @private
   */
  _bindEvents() {
    // 监听书签变更，更新文件夹树
    eventBus.on(eventBus.Events.CATEGORIES_CHANGED, () => {
      this.renderFolderTree();
    });

    // 监听书签加载完成，渲染导航
    eventBus.on(eventBus.Events.BOOKMARKS_LOADED, () => {
      this.renderFolderTree();
    });
  }

  /**
   * 切换视图
   * @param {string} view - 视图名称
   */
  switchView(view) {
    this.currentView = view;
    this.selectedFolderId = null;
    this.breadcrumb = [];

    eventBus.emit(eventBus.Events.NAVIGATION_CHANGED, {
      view,
      folderId: null,
      breadcrumb: []
    });
  }

  /**
   * 选择文件夹
   * @param {string} folderId - 文件夹ID
   */
  selectFolder(folderId) {
    this.currentView = 'folder';
    this.selectedFolderId = folderId;
    this.breadcrumb = this._buildBreadcrumb(folderId);

    eventBus.emit(eventBus.Events.FOLDER_SELECTED, {
      folderId,
      breadcrumb: this.breadcrumb
    });

    eventBus.emit(eventBus.Events.NAVIGATION_CHANGED, {
      view: 'folder',
      folderId,
      breadcrumb: this.breadcrumb
    });
  }

  /**
   * 构建面包屑路径
   * @param {string} folderId - 文件夹ID
   * @returns {Array} 面包屑数组
   * @private
   */
  _buildBreadcrumb(folderId) {
    const breadcrumb = [];
    const categories = bookmarkManager.categories;

    // 向上遍历父分类
    let currentId = folderId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = categories.find(c => c.id === currentId);

      if (category) {
        breadcrumb.unshift({
          id: category.id,
          name: category.name,
          type: 'category'
        });
        currentId = category.parentId;
      } else {
        break;
      }
    }

    // 添加"全部收藏"作为根节点
    if (breadcrumb.length > 0 || !folderId) {
      breadcrumb.unshift({
        id: null,
        name: '全部收藏',
        type: 'root'
      });
    }

    return breadcrumb;
  }

  /**
   * 渲染侧边栏导航
   */
  renderSidebarNav() {
    const navContainer = document.getElementById('sidebarNav');
    if (!navContainer) return;

    // 固定导航项
    const navItems = [
      { id: 'navAll', label: '全部收藏', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>', view: 'all', dataNav: 'all' },
      { id: 'navRecent', label: '最近添加', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>', view: 'recent', dataNav: 'recent' },
      { id: 'navBroken', label: '失效链接', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', view: 'broken', dataNav: 'broken' },
      { id: 'navTags', label: '标签视图', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>', view: 'tags', dataNav: 'tags' }
    ];

    navContainer.innerHTML = navItems.map(item => `
      <button class="sidebar-nav-item ${this.currentView === item.dataNav ? 'active' : ''}"
              id="${item.id}"
              data-nav="${item.dataNav}"
              role="listitem"
              tabindex="0">
        <span class="sidebar-nav-icon" aria-hidden="true">${item.icon}</span>
        <span class="sidebar-nav-label">${item.label}</span>
        ${item.id === 'navAll' ? `<span class="sidebar-nav-count">${bookmarkManager.bookmarks.length}</span>` : ''}
        ${item.id === 'navBroken' ? `<span class="sidebar-nav-count broken">${this._getBrokenCount()}</span>` : ''}
      </button>
    `).join('');

    // 绑定点击事件
    navContainer.querySelectorAll('.sidebar-nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.nav;
        this.switchView(view);
      });
    });
  }

  /**
   * 渲染文件夹树
   */
  renderFolderTree() {
    const treeContainer = document.getElementById('sidebarTreeContent');
    if (!treeContainer) return;

    const categories = bookmarkManager.categories;
    const rootCategories = categories.filter(c => !c.parentId);

    if (rootCategories.length === 0) {
      treeContainer.innerHTML = '<p class="text-sm text-slate-400 px-2 py-1">暂无文件夹</p>';
      return;
    }

    // 渲染文件夹树
    treeContainer.innerHTML = this._renderCategoryTree(rootCategories, categories, 0);

    // 绑定点击事件
    this._bindFolderTreeEvents();
  }

  /**
   * 递归渲染分类树
   * @param {Array} categories - 分类列表
   * @param {Array} allCategories - 所有分类
   * @param {number} level - 嵌套层级
   * @returns {string} HTML
   * @private
   */
  _renderCategoryTree(categories, allCategories, level) {
    return categories.map(category => {
      const hasChildren = allCategories.some(c => c.parentId === category.id);
      const childCategories = hasChildren
        ? allCategories.filter(c => c.parentId === category.id)
        : [];
      const bookmarkCount = bookmarkManager.getByCategory(category.id).length;
      const isActive = this.selectedFolderId === category.id;

      return `
        <div class="sf-item" data-folder-id="${category.id}">
          <div class="sf-item-row ${isActive ? 'active' : ''}" style="padding-left: ${level * 16 + 8}px">
            ${hasChildren ? '<span class="sf-folder-toggle">▶</span>' : '<span class="sf-folder-spacer"></span>'}
            <span class="sf-folder-icon"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg></span>
            <span class="bm-folder-name">${escapeHtml(category.name)}</span>
            <span class="bm-count" style="font-size:11px;color:var(--c-text-muted);">(${bookmarkCount})</span>
          </div>
          ${hasChildren ? `<div class="sf-children" style="display:none;">${this._renderCategoryTree(childCategories, allCategories, level + 1)}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  /**
   * 绑定文件夹树事件
   * @private
   */
  _bindFolderTreeEvents() {
    const treeContainer = document.getElementById('sidebarTreeContent');
    if (!treeContainer) return;

    // 文件夹点击
    treeContainer.querySelectorAll('.sf-item-row').forEach(row => {
      row.addEventListener('click', (e) => {
        const folderId = row.closest('.sf-item').dataset.folderId;
        this.selectFolder(folderId);
      });

      // 展开/折叠
      const toggle = row.querySelector('.sf-folder-toggle');
      if (toggle) {
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          const item = toggle.closest('.sf-item');
          const children = item.querySelector('.sf-children');
          if (children) {
            const isHidden = children.style.display === 'none';
            children.style.display = isHidden ? 'block' : 'none';
            toggle.textContent = isHidden ? '▼' : '▶';
          }
        });
      }
    });

    // 右键菜单
    treeContainer.querySelectorAll('.sf-item').forEach(item => {
      item.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const folderId = item.dataset.folderId;
        // TODO: 显示文件夹右键菜单
        // 通过 eventBus 触发事件让 popup.js 处理
        eventBus.emit(Events.FOLDER_CONTEXT_MENU, { folderId, x: e.clientX, y: e.clientY });
      });
    });
  }

  /**
   * 渲染面包屑
   */
  renderBreadcrumb() {
    const breadcrumbContainer = document.getElementById('breadcrumb');
    if (!breadcrumbContainer) return;

    if (this.breadcrumb.length === 0) {
      breadcrumbContainer.innerHTML = '';
      return;
    }

    breadcrumbContainer.innerHTML = this.breadcrumb.map((item, index) => {
      const isLast = index === this.breadcrumb.length - 1;
      return `
        <span class="breadcrumb-item ${isLast ? 'active' : ''}">
          ${item.id ? `<a href="#" data-folder-id="${item.id}">${escapeHtml(item.name)}</a>` : escapeHtml(item.name)}
        </span>
        ${!isLast ? '<span class="breadcrumb-separator">›</span>' : ''}
      `;
    }).join('');

    // 绑定点击事件
    breadcrumbContainer.querySelectorAll('[data-folder-id]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const folderId = link.dataset.folderId;
        this.selectFolder(folderId);
      });
    });
  }

  /**
   * 更新导航状态
   * @param {Object} state - 导航状态
   */
  updateState(state) {
    if (state.view !== undefined) {
      this.currentView = state.view;
    }
    if (state.folderId !== undefined) {
      this.selectedFolderId = state.folderId;
    }
    if (state.breadcrumb !== undefined) {
      this.breadcrumb = state.breadcrumb;
    }

    this.renderSidebarNav();
    this.renderFolderTree();
    this.renderBreadcrumb();
  }

  /**
   * 获取失效链接数量
   * @returns {number} 数量
   * @private
   */
  _getBrokenCount() {
    return bookmarkManager.bookmarks.filter(bm => bm.status === 'invalid' || bm.status === 'uncertain').length;
  }

  /**
   * 展开/折叠侧边栏
   */
  toggleSidebar() {
    this.sidebarExpanded = !this.sidebarExpanded;
    const sidebar = document.getElementById('sidebar');
    const resizer = document.getElementById('sidebarResizer');

    if (this.sidebarExpanded) {
      sidebar.style.width = '260px';
      resizer.style.display = 'block';
    } else {
      sidebar.style.width = '0';
      resizer.style.display = 'none';
    }
  }
}

// 创建单例实例
const navigationManager = new NavigationManager();

export default navigationManager;
