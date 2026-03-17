/**
 * NavigationManager - 导航管理模块
 *
 * 负责处理：
 * - 导航模式切换（全部、最近、失效、标签、文件夹）
 * - 侧边栏文件夹树的渲染和交互
 * - 面包屑导航的构建和渲染
 * - 内容区域的文件夹导航
 */

import eventBus, { Events } from '../utils/event-bus.js';

export class NavigationManager {
  /**
   * @param {Object} state - 应用状态对象
   * @param {Object} elements - DOM 元素引用对象
   * @param {Object} callbacks - 回调函数对象
   * @param {Function} callbacks.renderBookmarks - 渲染书签列表的回调
   * @param {Function} callbacks.showContextMenu - 显示右键菜单的回调
   * @param {Function} callbacks.buildTreeData - 构建树形数据的回调
   * @param {Object} callbacks.searchManager - 搜索管理器实例
   */
  constructor(state, elements, callbacks = {}) {
    this.state = state;
    this.elements = elements;
    this.callbacks = callbacks;
    this.searchManager = callbacks.searchManager;

    // 绑定方法到实例
    this.setNavMode = this.setNavMode.bind(this);
    this.navigateToFolder = this.navigateToFolder.bind(this);
    this.renderSidebar = this.renderSidebar.bind(this);
    this.renderBreadcrumb = this.renderBreadcrumb.bind(this);
    this.renderContentArea = this.renderContentArea.bind(this);
  }

  /**
   * 切换导航模式
   * @param {string} mode - 导航模式: 'all' | 'recent' | 'broken' | 'tags' | 'folder'
   */
  setNavMode(mode) {
    this.state.currentNavMode = mode;
    this.state.searchTerm = '';
    if (this.searchManager) {
      this.searchManager.clear();
    }

    // 更新激活样式
    document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
    const navMap = { all: 'navAll', recent: 'navRecent', broken: 'navBroken', tags: 'navTags' };
    if (navMap[mode]) {
      document.getElementById(navMap[mode])?.classList.add('active');
    }

    // 清除侧栏文件夹激活状态（非 folder 模式）
    if (mode !== 'folder') {
      document.querySelectorAll('.sf-item-row.active').forEach(el => el.classList.remove('active'));
    }

    // 发送导航变更事件
    eventBus.emit(Events.NAVIGATION_CHANGED, { mode, folderId: this.state.currentFolderId });

    // 触发书签重新渲染
    if (this.callbacks.renderBookmarks) {
      this.callbacks.renderBookmarks();
    }
  }

  /**
   * 渲染左侧文件夹树
   */
  renderSidebar() {
    if (!this.elements.sidebarTreeContent) return;

    const treeData = this.callbacks.buildTreeData
      ? this.callbacks.buildTreeData(this.state.bookmarks)
      : this._buildTreeData(this.state.bookmarks);

    const folders = treeData.filter(n => n.type === 'folder');
    this.elements.sidebarTreeContent.innerHTML = '';
    const ul = this._renderSidebarLevel(folders, 0);
    this.elements.sidebarTreeContent.appendChild(ul);
  }

  /**
   * 递归渲染侧边栏层级
   * @param {Array} nodes - 节点数组
   * @param {number} depth - 深度
   * @returns {HTMLUListElement}
   * @private
   */
  _renderSidebarLevel(nodes, depth) {
    const ul = document.createElement('ul');
    ul.className = 'sf-node';

    nodes.forEach(node => {
      if (node.type !== 'folder') return;

      const li = document.createElement('li');
      li.className = 'sf-item';
      li.dataset.id = node.id;
      li.dataset.type = 'folder';

      const childFolders = (node.children || []).filter(c => c.type === 'folder');
      const isExpanded = this.state.expandedSidebarFolders.has(node.id);
      const indent = depth * 12;

      // 创建行元素
      const row = document.createElement('div');
      row.className = 'sf-item-row' +
        (this.state.currentFolderId === node.id && this.state.currentNavMode === 'folder' ? ' active' : '');
      row.style.paddingLeft = `${8 + indent}px`;

      // 展开/折叠按钮
      if (childFolders.length > 0) {
        const toggle = document.createElement('span');
        toggle.className = 'sf-toggle' + (isExpanded ? ' open' : '');
        toggle.innerHTML = isExpanded ? '▼' : '▶';
        toggle.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isExpanded) {
            this.state.expandedSidebarFolders.delete(node.id);
          } else {
            this.state.expandedSidebarFolders.add(node.id);
          }
          this.renderSidebar();
        });
        row.appendChild(toggle);
      } else {
        const sp = document.createElement('span');
        sp.className = 'sf-toggle-spacer';
        row.appendChild(sp);
      }

      // 图标
      const icon = document.createElement('span');
      icon.className = 'sf-icon';
      icon.textContent = '📁';
      row.appendChild(icon);

      // 标签
      const label = document.createElement('span');
      label.className = 'sf-label';
      label.textContent = node.title || '未命名';
      row.appendChild(label);

      // 书签数量徽章
      const bmCount = this._countBookmarksInFolder(node);
      if (bmCount > 0) {
        const badge = document.createElement('span');
        badge.className = 'sf-badge';
        badge.textContent = bmCount;
        row.appendChild(badge);
      }

      // 点击导航
      row.addEventListener('click', () => {
        this.state.currentNavMode = 'folder';
        this.navigateToFolder(node.id);
      });

      // 右键菜单
      row.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.state.selectedItem = node;
        if (this.callbacks.showContextMenu) {
          this.callbacks.showContextMenu(node, e.clientX, e.clientY, { source: 'sidebar' });
        }
      });

      // 拖拽事件
      this._bindDragDropEvents(row, node);

      li.appendChild(row);

      // 递归渲染子文件夹
      if (childFolders.length > 0 && isExpanded) {
        const children = this._renderSidebarLevel(childFolders, depth + 1);
        children.className += ' sf-children';
        li.appendChild(children);
      }

      ul.appendChild(li);
    });

    return ul;
  }

  /**
   * 绑定拖拽事件
   * @param {HTMLElement} row - 行元素
   * @param {Object} node - 节点数据
   * @private
   */
  _bindDragDropEvents(row, node) {
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
      row.closest('.sf-item')?.classList.add('drag-over');
    });

    row.addEventListener('dragleave', (e) => {
      e.stopPropagation();
      if (!e.relatedTarget || !row.contains(e.relatedTarget)) {
        row.classList.remove('drag-over');
        row.closest('.sf-item')?.classList.remove('drag-over');
      }
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.classList.remove('drag-over');
      row.closest('.sf-item')?.classList.remove('drag-over');

      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData) return;

      try {
        const { type, id, data } = JSON.parse(dragData);
        // 发送移动到文件夹的事件
        eventBus.emit(Events.MOVE_TO_FOLDER, { itemId: id, targetFolderId: node.id });
      } catch (err) {
        console.error('Drop error:', err);
      }
    });
  }

  /**
   * 计算文件夹中的书签数量（公共方法）
   * @param {Object} node - 文件夹节点
   * @returns {number}
   */
  countBookmarksInFolder(node) {
    return this._countBookmarksInFolder(node);
  }

  /**
   * 计算文件夹中的书签数量
   * @param {Object} node - 文件夹节点
   * @returns {number}
   * @private
   */
  _countBookmarksInFolder(node) {
    let count = 0;
    (node.children || []).forEach(c => {
      if (c.type === 'bookmark') count++;
      else if (c.type === 'folder') count += this._countBookmarksInFolder(c);
    });
    return count;
  }

  /**
   * 导航到指定文件夹
   * @param {string|null} folderId - 文件夹 ID，null 表示根目录
   */
  navigateToFolder(folderId) {
    this.state.currentFolderId = folderId;
    if (folderId !== null) {
      this.state.currentNavMode = 'folder';
    }

    // 重新渲染侧栏以更新激活状态
    this.renderSidebar();

    // 构建面包屑
    this._buildBreadcrumb(folderId);

    // 渲染右侧内容
    this.renderContentArea(folderId);

    // 发送导航变更事件
    eventBus.emit(Events.NAVIGATION_CHANGED, {
      mode: this.state.currentNavMode,
      folderId
    });
  }

  /**
   * 构建面包屑路径
   * @param {string|null} folderId - 文件夹 ID
   * @private
   */
  _buildBreadcrumb(folderId) {
    this.state.breadcrumb = [];

    if (folderId === null) {
      this.state.breadcrumb = [{ id: null, title: '收藏夹' }];
    } else {
      // 向上查找路径
      const catMap = new Map();
      this.state.categories.forEach(c => catMap.set(c.id, c));

      const path = [];
      let cur = catMap.get(folderId);
      while (cur) {
        path.unshift({ id: cur.id, title: cur.name });
        cur = cur.parentId ? catMap.get(cur.parentId) : null;
      }
      this.state.breadcrumb = [{ id: null, title: '收藏夹' }, ...path];
    }

    this.renderBreadcrumb();
  }

  /**
   * 渲染面包屑
   */
  renderBreadcrumb() {
    if (!this.elements.breadcrumb) return;

    this.elements.breadcrumb.innerHTML = '';
    this.state.breadcrumb.forEach((item, idx) => {
      const el = document.createElement('span');
      el.className = 'bc-item' + (idx === this.state.breadcrumb.length - 1 ? ' current' : '');
      el.textContent = item.title;
      el.title = item.title;

      if (idx < this.state.breadcrumb.length - 1) {
        el.addEventListener('click', () => this.navigateToFolder(item.id));
      }

      this.elements.breadcrumb.appendChild(el);

      // 添加分隔符
      if (idx < this.state.breadcrumb.length - 1) {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = '›';
        this.elements.breadcrumb.appendChild(sep);
      }
    });
  }

  /**
   * 渲染右侧内容区域（子文件夹 + 书签）
   * @param {string|null} folderId - 文件夹 ID
   */
  renderContentArea(folderId) {
    const container = this.elements.bookmarkList;
    container.innerHTML = '';

    const treeData = this.callbacks.buildTreeData
      ? this.callbacks.buildTreeData(this.state.bookmarks)
      : this._buildTreeData(this.state.bookmarks);

    let currentNode = null;
    let children = [];

    if (folderId === null) {
      children = treeData;
    } else {
      currentNode = this._findNodeById(treeData, folderId);
      children = currentNode ? (currentNode.children || []) : [];
    }

    let subFolders = children.filter(n => n.type === 'folder');
    let bookmarks = children.filter(n => n.type === 'bookmark');

    // 按 sortOrder 排序
    subFolders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    bookmarks.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

    // 发送内容渲染事件，让 popup.js 处理具体的渲染逻辑
    eventBus.emit(Events.CONTENT_AREA_RENDER, {
      folderId,
      subFolders,
      bookmarks,
      container
    });
  }

  /**
   * 在树中查找节点
   * @param {Array} nodes - 节点数组
   * @param {string} id - 节点 ID
   * @returns {Object|null}
   * @private
   */
  _findNodeById(nodes, id) {
    for (const n of nodes) {
      if (n.id === id) return n;
      if (n.children) {
        const found = this._findNodeById(n.children, id);
        if (found) return found;
      }
    }
    return null;
  }

  /**
   * 构建树形数据（备用实现）
   * @param {Array} bookmarks - 书签数组
   * @returns {Array}
   * @private
   */
  _buildTreeData(bookmarks) {
    const itemMap = new Map();

    // 先添加所有分类
    if (this.state.categories && this.state.categories.length > 0) {
      this.state.categories.forEach(category => {
        itemMap.set(category.id, {
          ...category,
          title: category.name,
          type: 'folder',
          children: []
        });
      });
    }

    // 添加所有书签
    bookmarks.forEach(bookmark => {
      itemMap.set(bookmark.id, {
        ...bookmark,
        type: 'bookmark',
        children: []
      });
    });

    // 构建父子关系
    const rootItems = [];

    itemMap.forEach(item => {
      let parentId = null;
      if (item.type === 'folder') {
        parentId = item.parentId;
      } else {
        parentId = item.categoryId;
      }

      if (parentId && itemMap.has(parentId)) {
        const parent = itemMap.get(parentId);
        if (!parent.children) {
          parent.children = [];
        }
        parent.children.push(item);
      } else {
        rootItems.push(item);
      }
    });

    return rootItems;
  }
}

export default NavigationManager;
