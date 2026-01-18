// Smart Bookmarks - 列表渲染器
// 负责渲染树形结构、搜索结果等

/**
 * 树形结构渲染器
 * 用于渲染带层级结构的收藏列表
 */
class TreeRenderer {
  constructor(options = {}) {
    this.container = options.container;
    this.onItemClick = options.onItemClick || null;
    this.onItemRightClick = options.onItemRightClick || null;
    this.onExpand = options.onExpand || null;
    this.onCollapse = options.onCollapse || null;
    this.expandedNodes = new Set(); // 记录展开的节点
    this.searchTerm = ''; // 搜索关键词
  }

  /**
   * 渲染树形结构
   * @param {Array} items - 树形数据（已经是构建好的树形结构）
   * @param {string} parentId - 父节点 ID（已弃用，保留用于兼容）
   * @param {number} level - 层级深度
   */
  render(items, parentId = null, level = 0) {
    const container = this.container || document.createElement('div');
    container.innerHTML = '';

    if (!items || items.length === 0) {
      return container;
    }

    // items 已经是树形结构，直接渲染
    const treeElement = this.renderTreeLevel(items, level);
    container.appendChild(treeElement);

    return container;
  }

  /**
   * 构建树形结构
   */
  buildTree(items, parentId = null) {
    return items
      .filter(item => item.parentId === parentId)
      .map(item => ({
        ...item,
        children: this.buildTree(items, item.id)
      }));
  }

  /**
   * 渲染树的某一层
   */
  renderTreeLevel(nodes, level = 0) {
    const ul = document.createElement('ul');
    ul.className = 'tree-level';
    if (level === 0) {
      ul.classList.add('tree-root');
    }

    nodes.forEach(node => {
      const li = this.renderTreeNode(node, level);
      ul.appendChild(li);
    });

    return ul;
  }

  /**
   * 渲染单个树节点
   */
  renderTreeNode(node, level = 0) {
    const li = document.createElement('li');
    li.className = 'tree-node';
    li.dataset.id = node.id;
    li.dataset.type = node.type || 'bookmark';

    // 计算缩进
    const indent = level * 20;

    const content = document.createElement('div');
    content.className = 'tree-node-content';
    content.style.paddingLeft = `${indent}px`;

    // 文件夹节点
    if (node.type === 'folder') {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = this.expandedNodes.has(node.id);

      // 展开/收起图标
      if (hasChildren) {
        const toggle = document.createElement('span');
        toggle.className = 'tree-toggle';
        toggle.textContent = isExpanded ? '▼' : '▶';
        toggle.onclick = (e) => {
          e.stopPropagation();
          this.toggleNode(node.id);
        };
        content.appendChild(toggle);
      } else {
        const spacer = document.createElement('span');
        spacer.className = 'tree-spacer';
        content.appendChild(spacer);
      }

      // 文件夹图标
      const icon = document.createElement('span');
      icon.className = 'tree-icon folder-icon';
      icon.textContent = hasChildren ? '📁' : '📂';
      content.appendChild(icon);

      // 文件夹名称和数量
      const label = document.createElement('span');
      label.className = 'tree-label';
      label.textContent = node.title || '未命名文件夹';
      content.appendChild(label);

      // 收藏数量
      const count = this.countBookmarks(node);
      if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'tree-badge';
        badge.textContent = count;
        content.appendChild(badge);
      }
    }
    // 书签节点
    else {
      const spacer = document.createElement('span');
      spacer.className = 'tree-spacer';
      content.appendChild(spacer);

      // 书签图标
      const icon = document.createElement('span');
      icon.className = 'tree-icon bookmark-icon';

      // 检查链接状态
      if (node.status === 'broken') {
        icon.textContent = '⚠️';
        icon.title = '链接失效';
      } else if (node.status === 'checked') {
        icon.textContent = '✓';
        icon.title = '链接有效';
      } else {
        icon.textContent = '🔖';
        icon.title = '未检测';
      }

      content.appendChild(icon);

      // 书签标题（支持搜索高亮）
      const label = document.createElement('span');
      label.className = 'tree-label';
      if (this.searchTerm) {
        label.innerHTML = this.highlightText(node.title || '未命名', this.searchTerm);
      } else {
        label.textContent = node.title || '未命名';
      }
      content.appendChild(label);

      // 域名显示
      if (node.url) {
        try {
          const urlObj = new URL(node.url);
          const domain = document.createElement('span');
          domain.className = 'tree-domain';
          domain.textContent = urlObj.hostname;
          content.appendChild(domain);
        } catch (e) {
          // URL 解析失败，忽略
        }
      }

      // 标签
      if (node.tags && node.tags.length > 0) {
        const tagsContainer = document.createElement('span');
        tagsContainer.className = 'tree-tags';
        node.tags.slice(0, 3).forEach(tag => {
          const tagEl = document.createElement('span');
          tagEl.className = 'tree-tag';
          tagEl.textContent = `#${tag}`;
          tagsContainer.appendChild(tagEl);
        });
        if (node.tags.length > 3) {
          const more = document.createElement('span');
          more.className = 'tree-tag-more';
          more.textContent = `+${node.tags.length - 3}`;
          tagsContainer.appendChild(more);
        }
        content.appendChild(tagsContainer);
      }
    }

    li.appendChild(content);

    // 绑定点击事件
    li.onclick = () => {
      if (this.onItemClick) {
        this.onItemClick(node);
      }
    };

    // 绑定右键菜单事件
    li.oncontextmenu = (e) => {
      e.preventDefault();
      if (this.onItemRightClick) {
        this.onItemRightClick(node, e);
      }
    };

    // 渲染子节点
    if (node.children && node.children.length > 0) {
      const childrenContainer = document.createElement('div');
      childrenContainer.className = 'tree-children';
      if (!this.expandedNodes.has(node.id)) {
        childrenContainer.style.display = 'none';
      }

      const childrenUl = this.renderTreeLevel(node.children, level + 1);
      childrenContainer.appendChild(childrenUl);
      li.appendChild(childrenContainer);
    }

    return li;
  }

  /**
   * 切换节点展开/收起状态
   */
  toggleNode(nodeId) {
    const nodeEl = this.container?.querySelector(`[data-id="${nodeId}"]`);
    if (!nodeEl) return;

    const childrenContainer = nodeEl.querySelector('.tree-children');
    const toggle = nodeEl.querySelector('.tree-toggle');

    if (this.expandedNodes.has(nodeId)) {
      // 收起
      this.expandedNodes.delete(nodeId);
      if (childrenContainer) {
        childrenContainer.style.display = 'none';
      }
      if (toggle) {
        toggle.textContent = '▶';
      }
      if (this.onCollapse) {
        this.onCollapse(nodeId);
      }
    } else {
      // 展开
      this.expandedNodes.add(nodeId);
      if (childrenContainer) {
        childrenContainer.style.display = 'block';
      }
      if (toggle) {
        toggle.textContent = '▼';
      }
      if (this.onExpand) {
        this.onExpand(nodeId);
      }
    }
  }

  /**
   * 展开所有节点
   */
  expandAll(items) {
    items.forEach(item => {
      if (item.type === 'folder') {
        this.expandedNodes.add(item.id);
      }
    });
  }

  /**
   * 收起所有节点
   */
  collapseAll() {
    this.expandedNodes.clear();
  }

  /**
   * 计算文件夹内的收藏数量
   */
  countBookmarks(node) {
    let count = 0;

    if (node.type === 'bookmark') {
      return 1;
    }

    if (node.children) {
      node.children.forEach(child => {
        count += this.countBookmarks(child);
      });
    }

    return count;
  }

  /**
   * 高亮搜索关键词
   */
  highlightText(text, searchTerm) {
    if (!searchTerm) {
      return this.escapeHtml(text);
    }

    const escapedText = this.escapeHtml(text);
    const escapedSearchTerm = this.escapeHtml(searchTerm);
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    return escapedText.replace(regex, '<mark>$1</mark>');
  }

  /**
   * 转义 HTML 特殊字符
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 设置搜索关键词
   */
  setSearchTerm(term) {
    this.searchTerm = term;
  }
}

/**
 * 搜索结果渲染器
 * 用于渲染搜索结果列表
 */
class SearchResultsRenderer {
  constructor(options = {}) {
    this.container = options.container;
    this.onItemClick = options.onItemClick || null;
    this.onItemRightClick = options.onItemRightClick || null;
    this.searchTerm = '';
  }

  /**
   * 渲染搜索结果
   * @param {Array} results - 搜索结果数组
   * @param {string} searchTerm - 搜索关键词
   */
  render(results, searchTerm = '') {
    this.searchTerm = searchTerm;
    const container = this.container || document.createElement('div');
    container.innerHTML = '';

    if (!results || results.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'search-empty';
      emptyState.innerHTML = `
        <div class="search-empty-icon">🔍</div>
        <div class="search-empty-title">未找到相关结果</div>
        <div class="search-empty-desc">请尝试其他关键词</div>
      `;
      container.appendChild(emptyState);
      return container;
    }

    // 显示结果数量
    const count = document.createElement('div');
    count.className = 'search-count';
    count.textContent = `找到 ${results.length} 个结果`;
    container.appendChild(count);

    // 渲染结果列表
    const list = document.createElement('div');
    list.className = 'search-results';

    results.forEach((result, index) => {
      const item = this.renderResultItem(result, index);
      list.appendChild(item);
    });

    container.appendChild(list);

    return container;
  }

  /**
   * 渲染单个搜索结果
   */
  renderResultItem(result, index) {
    const item = document.createElement('div');
    item.className = 'search-result-item';
    item.dataset.id = result.id;

    // 序号
    const indexBadge = document.createElement('span');
    indexBadge.className = 'search-result-index';
    indexBadge.textContent = index + 1;
    item.appendChild(indexBadge);

    // 内容区域
    const content = document.createElement('div');
    content.className = 'search-result-content';

    // 标题（高亮搜索词）
    const title = document.createElement('div');
    title.className = 'search-result-title';
    title.innerHTML = this.highlightText(result.title || '未命名', this.searchTerm);
    content.appendChild(title);

    // URL
    if (result.url) {
      const url = document.createElement('div');
      url.className = 'search-result-url';
      url.innerHTML = this.highlightText(result.url, this.searchTerm);
      content.appendChild(url);
    }

    // 分类路径
    if (result.categoryPath) {
      const path = document.createElement('div');
      path.className = 'search-result-path';
      path.innerHTML = `<span class="path-icon">📁</span>${this.escapeHtml(result.categoryPath)}`;
      content.appendChild(path);
    }

    // 标签
    if (result.tags && result.tags.length > 0) {
      const tags = document.createElement('div');
      tags.className = 'search-result-tags';
      result.tags.forEach(tag => {
        const tagEl = document.createElement('span');
        tagEl.className = 'search-result-tag';
        tagEl.textContent = `#${tag}`;
        tags.appendChild(tagEl);
      });
      content.appendChild(tags);
    }

    item.appendChild(content);

    // 状态图标
    if (result.status === 'broken') {
      const statusIcon = document.createElement('span');
      statusIcon.className = 'search-result-status broken';
      statusIcon.textContent = '⚠️';
      statusIcon.title = '链接失效';
      item.appendChild(statusIcon);
    }

    // 绑定事件
    item.onclick = () => {
      if (this.onItemClick) {
        this.onItemClick(result);
      }
    };

    item.oncontextmenu = (e) => {
      e.preventDefault();
      if (this.onItemRightClick) {
        this.onItemRightClick(result, e);
      }
    };

    return item;
  }

  /**
   * 高亮搜索关键词
   */
  highlightText(text, searchTerm) {
    if (!searchTerm) {
      return this.escapeHtml(text);
    }

    const escapedText = this.escapeHtml(text);
    const escapedSearchTerm = this.escapeHtml(searchTerm);
    const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
    return escapedText.replace(regex, '<mark class="search-highlight">$1</mark>');
  }

  /**
   * 转义 HTML 特殊字符
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

/**
 * 虚拟滚动渲染器（可选实现）
 * 用于处理大量数据时的性能优化
 */
class VirtualScrollRenderer {
  constructor(options = {}) {
    this.container = options.container;
    this.itemHeight = options.itemHeight || 50;
    this.items = [];
    this.visibleItems = [];
    this.scrollTop = 0;
    this.containerHeight = 0;

    // 绑定滚动事件
    if (this.container) {
      this.container.addEventListener('scroll', () => this.onScroll());
    }
  }

  /**
   * 设置数据
   */
  setItems(items) {
    this.items = items;
    this.updateContainerHeight();
    this.render();
  }

  /**
   * 更新容器高度
   */
  updateContainerHeight() {
    const totalHeight = this.items.length * this.itemHeight;
    const content = this.container.querySelector('.virtual-content');
    if (content) {
      content.style.height = `${totalHeight}px`;
    }
  }

  /**
   * 渲染可见项
   */
  render() {
    const viewport = this.container;
    this.containerHeight = viewport.clientHeight;

    // 计算可见范围
    const startIndex = Math.floor(this.scrollTop / this.itemHeight);
    const endIndex = Math.min(
      startIndex + Math.ceil(this.containerHeight / this.itemHeight) + 1,
      this.items.length
    );

    this.visibleItems = this.items.slice(startIndex, endIndex);

    // 清空容器
    viewport.innerHTML = '';

    // 创建内容容器
    const content = document.createElement('div');
    content.className = 'virtual-content';
    content.style.height = `${this.items.length * this.itemHeight}px`;
    content.style.position = 'relative';

    // 渲染可见项
    this.visibleItems.forEach((item, index) => {
      const itemElement = this.renderItem(item, startIndex + index);
      itemElement.style.position = 'absolute';
      itemElement.style.top = `${(startIndex + index) * this.itemHeight}px`;
      itemElement.style.height = `${this.itemHeight}px`;
      content.appendChild(itemElement);
    });

    viewport.appendChild(content);
  }

  /**
   * 渲染单个项（子类实现）
   */
  renderItem(item, index) {
    const div = document.createElement('div');
    div.className = 'virtual-item';
    div.textContent = item.title || '未命名';
    return div;
  }

  /**
   * 滚动事件处理
   */
  onScroll() {
    this.scrollTop = this.container.scrollTop;
    requestAnimationFrame(() => this.render());
  }
}

/**
 * 右键菜单渲染器
 */
class ContextMenuRenderer {
  constructor(options = {}) {
    this.items = options.items || [];
    this.onAction = options.onAction || null;
    this.element = null;
  }

  /**
   * 显示菜单
   * @param {number} x - 鼠标 X 坐标
   * @param {number} y - 鼠标 Y 坐标
   */
  show(x, y) {
    this.hide();

    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;

    this.items.forEach(item => {
      const menuItem = this.renderMenuItem(item);
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);
    this.element = menu;

    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', this.handleClickOutside);
    }, 0);
  }

  /**
   * 渲染菜单项
   */
  renderMenuItem(item) {
    const menuItem = document.createElement('div');
    menuItem.className = 'context-menu-item';

    if (item.separator) {
      menuItem.classList.add('separator');
      return menuItem;
    }

    const icon = document.createElement('span');
    icon.className = 'menu-item-icon';
    icon.textContent = item.icon || '';
    menuItem.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'menu-item-label';
    label.textContent = item.label;
    menuItem.appendChild(label);

    if (item.shortcut) {
      const shortcut = document.createElement('span');
      shortcut.className = 'menu-item-shortcut';
      shortcut.textContent = item.shortcut;
      menuItem.appendChild(shortcut);
    }

    menuItem.onclick = () => {
      if (this.onAction) {
        this.onAction(item.action);
      }
      this.hide();
    };

    if (item.disabled) {
      menuItem.classList.add('disabled');
    }

    return menuItem;
  }

  /**
   * 隐藏菜单
   */
  hide() {
    if (this.element && this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
      this.element = null;
    }
    document.removeEventListener('click', this.handleClickOutside);
  }

  /**
   * 处理点击外部关闭
   */
  handleClickOutside = (e) => {
    if (this.element && !this.element.contains(e.target)) {
      this.hide();
    }
  }
}

// 导出所有渲染器
export {
  TreeRenderer,
  SearchResultsRenderer,
  VirtualScrollRenderer,
  ContextMenuRenderer
};
