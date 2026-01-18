// Smart Bookmarks - Popup Script
// 主入口文件 - 完整版，集成 UI 组件和渲染器

import { TreeRenderer, SearchResultsRenderer, ContextMenuRenderer } from '../ui/renderers.js';
import { Toast, ProgressBar, LoadingSpinner, EmptyState, ConfirmDialog } from '../ui/components.js';

console.log('Smart Bookmarks popup loaded');

// DOM 元素引用
const elements = {
  searchInput: document.getElementById('searchInput'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  checkBrokenBtn: document.getElementById('checkBrokenBtn'),
  syncBtn: document.getElementById('syncBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  bookmarkList: document.getElementById('bookmarkList'),
  tabs: document.querySelectorAll('.tab')
};

// 应用状态
const state = {
  bookmarks: [],
  categories: [],
  tags: [],
  activeTab: 'all',
  searchTerm: '',
  isChecking: false,
  isAnalyzing: false,
  checkProgress: {
    completed: 0,
    total: 0,
    brokenCount: 0,
    percentage: 0
  },
  expandedFolders: new Set(),
  selectedItem: null
};

// 渲染器实例（将在 DOM 加载后初始化）
let treeRenderer = null;
let searchRenderer = null;
let contextMenu = null;

// 初始化
function init() {
  initRenderers();
  loadBookmarks();
  bindEvents();
  listenToMessages();
}

/**
 * 初始化渲染器
 */
function initRenderers() {
  // 树形渲染器 - 用于显示层级结构的收藏
  treeRenderer = new TreeRenderer({
    container: elements.bookmarkList,
    onItemClick: handleBookmarkClick,
    onItemRightClick: handleBookmarkRightClick,
    onExpand: handleFolderExpand,
    onCollapse: handleFolderCollapse
  });

  // 搜索结果渲染器 - 用于显示搜索结果
  searchRenderer = new SearchResultsRenderer({
    container: elements.bookmarkList,
    onItemClick: handleBookmarkClick,
    onItemRightClick: handleBookmarkRightClick
  });

  // 右键菜单渲染器
  contextMenu = new ContextMenuRenderer({
    items: getContextMenuItems(),
    onAction: handleContextMenuAction
  });
}

/**
 * 获取右键菜单项配置
 */
function getContextMenuItems() {
  return [
    { icon: '🔗', label: '打开链接', action: 'open', shortcut: 'Enter' },
    { separator: true },
    { icon: '✏️', label: '编辑', action: 'edit' },
    { icon: '📋', label: '复制链接', action: 'copy', shortcut: 'Ctrl+C' },
    { icon: '📁', label: '移动到...', action: 'move' },
    { separator: true },
    { icon: '🏷️', label: '添加标签', action: 'addTag' },
    { icon: '✅', label: '检测链接', action: 'check' },
    { separator: true },
    { icon: '🗑️', label: '删除', action: 'delete', shortcut: 'Del' }
  ];
}

/**
 * 加载收藏数据
 */
async function loadBookmarks() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_BOOKMARKS' });

    if (response.bookmarks) {
      state.bookmarks = response.bookmarks;
      renderBookmarks();
    }
  } catch (error) {
    console.error('Failed to load bookmarks:', error);
    showEmptyState('加载失败', error.message);
  }
}

/**
 * 显示空状态
 */
function showEmptyState(title = '暂无收藏', description = '点击浏览器右上角的收藏按钮添加收藏') {
  const emptyState = new EmptyState({
    icon: '📚',
    title: title,
    description: description
  });

  elements.bookmarkList.innerHTML = '';
  elements.bookmarkList.appendChild(emptyState.create());
}

/**
 * 渲染收藏列表
 * 根据 activeTab 和 searchTerm 决定渲染方式
 */
function renderBookmarks() {
  // 清空容器
  elements.bookmarkList.innerHTML = '';

  // 如果没有收藏，显示空状态
  if (state.bookmarks.length === 0) {
    showEmptyState();
    return;
  }

  // 根据当前标签页渲染不同的视图
  switch (state.activeTab) {
    case 'all':
      renderAllBookmarks();
      break;
    case 'categories':
      renderCategories();
      break;
    case 'tags':
      renderTags();
      break;
    default:
      renderAllBookmarks();
  }
}

/**
 * 渲染全部收藏（树形结构或搜索结果）
 */
function renderAllBookmarks() {
  // 构建树形数据
  const treeData = buildTreeData(state.bookmarks);

  // 如果有搜索关键词，渲染搜索结果
  if (state.searchTerm.trim()) {
    treeRenderer.setSearchTerm(state.searchTerm);
    const filteredResults = filterBookmarks(treeData, state.searchTerm);
    searchRenderer.render(filteredResults, state.searchTerm);
  } else {
    // 否则渲染树形结构
    treeRenderer.setSearchTerm('');
    treeRenderer.render(treeData);
  }
}

/**
 * 构建树形数据结构
 * 将扁平的收藏列表转换为层级结构
 */
function buildTreeData(bookmarks) {
  // 创建 ID 到节点的映射
  const itemMap = new Map();

  // 第一遍：创建所有节点
  bookmarks.forEach(bookmark => {
    itemMap.set(bookmark.id, {
      ...bookmark,
      type: 'bookmark',
      children: []
    });
  });

  // 如果有分类数据，也加入映射
  if (state.categories && state.categories.length > 0) {
    state.categories.forEach(category => {
      if (!itemMap.has(category.id)) {
        itemMap.set(category.id, {
          ...category,
          type: 'folder',
          children: []
        });
      }
    });
  }

  // 第二遍：构建父子关系
  const rootItems = [];

  itemMap.forEach(item => {
    if (item.parentId && itemMap.has(item.parentId)) {
      // 有父节点，添加到父节点的 children 中
      const parent = itemMap.get(item.parentId);
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(item);
    } else {
      // 没有父节点或父节点不存在，作为根节点
      rootItems.push(item);
    }
  });

  return rootItems;
}

/**
 * 过滤收藏（搜索功能）
 * 递归搜索所有匹配的收藏项
 */
function filterBookmarks(items, searchTerm) {
  const results = [];
  const term = searchTerm.toLowerCase().trim();

  if (!term) return results;

  // 递归搜索函数
  function searchItems(items, path = '') {
    items.forEach(item => {
      // 检查标题、URL、标签是否匹配
      const titleMatch = item.title && item.title.toLowerCase().includes(term);
      const urlMatch = item.url && item.url.toLowerCase().includes(term);
      const tagMatch = item.tags && item.tags.some(tag =>
        tag.toLowerCase().includes(term)
      );

      if (titleMatch || urlMatch || tagMatch) {
        results.push({
          ...item,
          categoryPath: path || item.categoryName || '根目录'
        });
      }

      // 递归搜索子项
      if (item.children && item.children.length > 0) {
        const childPath = path ? `${path} / ${item.title}` : (item.title || '根目录');
        searchItems(item.children, childPath);
      }
    });
  }

  searchItems(items);
  return results;
}

/**
 * 渲染分类视图
 */
function renderCategories() {
  if (!state.categories || state.categories.length === 0) {
    // 没有分类，显示全部收藏
    renderAllBookmarks();
    return;
  }

  // 按分类渲染收藏
  const categoriesContainer = document.createElement('div');
  categoriesContainer.className = 'categories-container';

  state.categories.forEach(category => {
    const categoryBookmarks = state.bookmarks.filter(b =>
      b.categoryId === category.id || b.parentId === category.id
    );

    const categoryElement = document.createElement('div');
    categoryElement.className = 'category-item';

    const categoryHeader = document.createElement('div');
    categoryHeader.className = 'category-header';
    categoryHeader.innerHTML = `
      <span class="category-icon">📁</span>
      <span class="category-name">${escapeHtml(category.name)}</span>
      <span class="category-count">${categoryBookmarks.length}</span>
    `;

    const categoryList = document.createElement('div');
    categoryList.className = 'category-list';

    categoryBookmarks.forEach(bookmark => {
      const bookmarkEl = createBookmarkElement(bookmark);
      categoryList.appendChild(bookmarkEl);
    });

    categoryElement.appendChild(categoryHeader);
    categoryElement.appendChild(categoryList);
    categoriesContainer.appendChild(categoryElement);
  });

  elements.bookmarkList.appendChild(categoriesContainer);
}

/**
 * 渲染标签视图
 */
function renderTags() {
  if (!state.tags || state.tags.length === 0) {
    const emptyState = new EmptyState({
      icon: '🏷️',
      title: '暂无标签',
      description: '为收藏添加标签以便更好地组织'
    });
    elements.bookmarkList.appendChild(emptyState.create());
    return;
  }

  // 渲染标签列表
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'tags-container';

  state.tags.forEach(tag => {
    const tagBookmarks = state.bookmarks.filter(b =>
      b.tags && b.tags.includes(tag.name)
    );

    const tagElement = document.createElement('div');
    tagElement.className = 'tag-item';
    tagElement.innerHTML = `
      <span class="tag-icon">🏷️</span>
      <span class="tag-name">${escapeHtml(tag.name)}</span>
      <span class="tag-count">${tagBookmarks.length}</span>
    `;

    tagElement.onclick = () => {
      // 显示该标签下的所有收藏
      const filteredResults = tagBookmarks.map(b => ({
        ...b,
        categoryPath: `标签: ${tag.name}`
      }));
      searchRenderer.render(filteredResults, '');
    };

    tagsContainer.appendChild(tagElement);
  });

  elements.bookmarkList.appendChild(tagsContainer);
}

/**
 * 创建收藏元素（用于分类视图）
 */
function createBookmarkElement(bookmark) {
  const element = document.createElement('div');
  element.className = 'bookmark-item';
  element.dataset.id = bookmark.id;

  const statusIcon = bookmark.status === 'broken' ? '⚠️' : '🔖';
  const statusClass = bookmark.status === 'broken' ? 'broken' : '';

  element.innerHTML = `
    <span class="bookmark-icon ${statusClass}">${statusIcon}</span>
    <span class="bookmark-title">${escapeHtml(bookmark.title || '未命名')}</span>
    ${bookmark.url ? `<span class="bookmark-url">${escapeHtml(truncateUrl(bookmark.url, 40))}</span>` : ''}
  `;

  // 点击事件
  element.onclick = () => handleBookmarkClick(bookmark);

  // 右键菜单
  element.oncontextmenu = (e) => handleBookmarkRightClick(bookmark, e);

  return element;
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 搜索
  elements.searchInput.addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    filterBookmarks();
  });

  // 标签切换
  elements.tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      elements.tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      state.activeTab = tab.dataset.tab;
      state.searchTerm = '';
      elements.searchInput.value = '';
      renderBookmarks();
    });
  });

  // 一键分析
  elements.analyzeBtn.addEventListener('click', handleAnalyze);

  // 失效检测
  elements.checkBrokenBtn.addEventListener('click', handleCheckBrokenLinks);

  // 同步
  elements.syncBtn.addEventListener('click', handleSync);

  // 导出
  elements.exportBtn.addEventListener('click', handleExport);

  // 导入
  elements.importBtn.addEventListener('click', handleImport);

  // 设置
  elements.settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
}

/**
 * 处理收藏点击事件
 */
function handleBookmarkClick(item) {
  if (item.type === 'folder') {
    // 点击文件夹，切换展开/收起状态
    return;
  }

  if (item.url) {
    // 打开链接
    chrome.tabs.create({ url: item.url });
    Toast.success('正在打开链接...');
  }
}

/**
 * 处理收藏右键点击事件
 */
function handleBookmarkRightClick(item, event) {
  state.selectedItem = item;
  contextMenu.show(event.clientX, event.clientY);
}

/**
 * 处理右键菜单操作
 */
function handleContextMenuAction(action) {
  const item = state.selectedItem;
  if (!item) return;

  switch (action) {
    case 'open':
      if (item.url) {
        chrome.tabs.create({ url: item.url });
        Toast.success('正在打开链接...');
      }
      break;

    case 'edit':
      Toast.info('编辑功能开发中');
      break;

    case 'copy':
      if (item.url) {
        navigator.clipboard.writeText(item.url).then(() => {
          Toast.success('链接已复制到剪贴板');
        }).catch(() => {
          Toast.error('复制失败');
        });
      }
      break;

    case 'move':
      Toast.info('移动功能开发中');
      break;

    case 'addTag':
      Toast.info('添加标签功能开发中');
      break;

    case 'check':
      checkSingleLink(item);
      break;

    case 'delete':
      deleteBookmark(item);
      break;
  }
}

/**
 * 处理文件夹展开事件
 */
function handleFolderExpand(folderId) {
  state.expandedFolders.add(folderId);
}

/**
 * 处理文件夹收起事件
 */
function handleFolderCollapse(folderId) {
  state.expandedFolders.delete(folderId);
}

/**
 * 处理一键分析
 */
async function handleAnalyze() {
  // 防止重复点击
  if (state.isAnalyzing) {
    Toast.warning('正在分析中，请稍候...');
    return;
  }

  // 检查是否有收藏
  if (state.bookmarks.length === 0) {
    Toast.warning('请先导入收藏');
    return;
  }

  state.isAnalyzing = true;
  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = '⏳ 分析中...';

  try {
    // 显示进度
    showProgress('准备分析...', 0, 0);

    // 调用 background 进行 AI 分析
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      bookmarkIds: state.bookmarks.map(bm => bm.id)
    });

    if (response.error) {
      throw new Error(response.error);
    }

    // 隐藏进度
    hideProgress();

    // 显示确认对话框
    showAnalysisConfirmDialog(response.result);

  } catch (error) {
    console.error('Analysis failed:', error);
    hideProgress();
    Toast.error(`分析失败: ${error.message}`);
  } finally {
    state.isAnalyzing = false;
    elements.analyzeBtn.disabled = false;
    elements.analyzeBtn.textContent = '🤖 一键分析';
  }
}

/**
 * 显示分析结果确认对话框
 */
function showAnalysisConfirmDialog(analysisResult) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog">
      <div class="dialog-header">
        <h2>AI 智能分类建议</h2>
        <button class="dialog-close" id="dialogClose">&times;</button>
      </div>

      <div class="dialog-content">
        <!-- 分析摘要 -->
        <div class="analysis-summary">
          <div class="summary-item">
            <span class="summary-label">待分类收藏:</span>
            <span class="summary-value">${analysisResult.summary.totalBookmarks}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">已分类:</span>
            <span class="summary-value">${analysisResult.summary.categorizedCount}</span>
          </div>
          <div class="summary-item">
            <span class="summary-label">建议新增分类:</span>
            <span class="summary-value highlight">${analysisResult.summary.newCategories.length}</span>
          </div>
        </div>

        <!-- 新增分类列表 -->
        ${analysisResult.summary.newCategories.length > 0 ? `
          <div class="new-categories-section">
            <h3>建议新增分类</h3>
            <div class="categories-list">
              ${analysisResult.summary.newCategories.map(name => `
                <div class="category-tag category-tag-new">${escapeHtml(name)}</div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 现有分类调整 -->
        ${analysisResult.summary.adjustedCategories.length > 0 ? `
          <div class="existing-categories-section">
            <h3>现有分类调整</h3>
            <div class="categories-list">
              ${analysisResult.summary.adjustedCategories.map(cat => `
                <div class="category-adjustment">
                  <div class="category-name">${escapeHtml(cat.name)}</div>
                  <div class="category-count">
                    <span class="count-label">新增:</span>
                    <span class="count-value">${cat.addedCount}</span>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- 分类明细 -->
        <details class="category-details">
          <summary>查看分类明细</summary>
          <div class="details-content">
            ${renderCategoryDetails(analysisResult.categories)}
          </div>
        </details>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-cancel" id="dialogCancel">取消</button>
        <button class="btn btn-primary" id="dialogConfirm">应用分类</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  // 绑定事件
  const closeBtn = dialog.querySelector('#dialogClose');
  const cancelBtn = dialog.querySelector('#dialogCancel');
  const confirmBtn = dialog.querySelector('#dialogConfirm');

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => {
      if (dialog.parentNode) {
        dialog.parentNode.removeChild(dialog);
      }
    }, 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  confirmBtn.addEventListener('click', async () => {
    try {
      Toast.info('正在应用分类...');
      const response = await chrome.runtime.sendMessage({
        type: 'APPLY_CATEGORIES',
        categories: analysisResult.categories
      });

      if (response.error) {
        throw new Error(response.error);
      }

      Toast.success('分类已应用！');
      await loadBookmarks();
      closeDialog();
    } catch (error) {
      console.error('Failed to apply categories:', error);
      Toast.error(`应用分类失败: ${error.message}`);
    }
  });

  // 点击遮罩层关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      closeDialog();
    }
  });

  // 显示对话框
  setTimeout(() => {
    dialog.classList.add('show');
  }, 10);
}

/**
 * 渲染分类明细
 */
function renderCategoryDetails(categories) {
  // 创建收藏 ID 到标题的映射
  const bookmarkMap = new Map();
  state.bookmarks.forEach(bm => {
    bookmarkMap.set(bm.id, bm);
  });

  // 按分类分组
  const newCategories = categories.filter(cat => cat.isNew);
  const existingCategories = categories.filter(cat => !cat.isNew);

  let html = '';

  // 新增分类明细
  if (newCategories.length > 0) {
    html += '<div class="detail-section"><h4>新增分类明细</h4>';
    newCategories.forEach(cat => {
      html += `
        <div class="detail-category">
          <div class="detail-category-header">
            <span class="detail-category-name">${escapeHtml(cat.name)}</span>
            <span class="detail-category-confidence">
              置信度: ${Math.round(cat.confidence * 100)}%
            </span>
          </div>
          <div class="detail-bookmarks">
            ${cat.bookmarkIds.map(id => {
              const bm = bookmarkMap.get(id);
              return bm ? `
                <div class="detail-bookmark">
                  <div class="bookmark-title">${escapeHtml(bm.title)}</div>
                  <div class="bookmark-url">${escapeHtml(truncateUrl(bm.url, 50))}</div>
                </div>
              ` : '';
            }).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  // 现有分类明细
  if (existingCategories.length > 0) {
    html += '<div class="detail-section"><h4>现有分类明细</h4>';
    existingCategories.forEach(cat => {
      html += `
        <div class="detail-category">
          <div class="detail-category-header">
            <span class="detail-category-name">${escapeHtml(cat.name)}</span>
            <span class="detail-category-confidence">
              置信度: ${Math.round(cat.confidence * 100)}%
            </span>
          </div>
          <div class="detail-bookmarks">
            ${cat.bookmarkIds.map(id => {
              const bm = bookmarkMap.get(id);
              return bm ? `
                <div class="detail-bookmark">
                  <div class="bookmark-title">${escapeHtml(bm.title)}</div>
                  <div class="bookmark-url">${escapeHtml(truncateUrl(bm.url, 50))}</div>
                </div>
              ` : '';
            }).join('')}
          </div>
        </div>
      `;
    });
    html += '</div>';
  }

  return html;
}

/**
 * 显示进度
 */
function showProgress(message, current, total) {
  const progressSection = document.getElementById('progressSection');
  const progressMessage = document.getElementById('progressMessage');
  const progressCount = document.getElementById('progressCount');
  const progressFill = document.getElementById('progressFill');

  if (progressSection) {
    progressSection.style.display = 'block';
    if (progressMessage) progressMessage.textContent = message;
    if (progressCount) progressCount.textContent = `${current}/${total}`;

    const percentage = total > 0 ? (current / total) * 100 : 0;
    if (progressFill) progressFill.style.width = `${percentage}%`;
  }
}

/**
 * 隐藏进度
 */
function hideProgress() {
  const progressSection = document.getElementById('progressSection');
  const progressFill = document.getElementById('progressFill');

  if (progressSection) {
    progressSection.style.display = 'none';
  }
  if (progressFill) {
    progressFill.style.width = '0%';
  }
}

/**
 * 处理失效链接检测
 */
async function handleCheckBrokenLinks() {
  if (state.isChecking) {
    Toast.warning('正在检测中，请稍候...');
    return;
  }

  if (state.bookmarks.length === 0) {
    Toast.warning('暂无收藏可检测');
    return;
  }

  const confirm = new ConfirmDialog({
    title: '检测失效链接',
    message: `即将检测 ${state.bookmarks.length} 个收藏链接的有效性。\n\n检测可能需要一些时间，建议收藏数量较多时在后台运行。\n\n是否开始检测？`,
    confirmText: '开始检测',
    cancelText: '取消',
    onConfirm: async () => {
      startBrokenLinkCheck();
    }
  });

  confirm.show();
}

/**
 * 开始失效链接检测
 */
async function startBrokenLinkCheck() {
  state.isChecking = true;
  state.checkProgress = {
    completed: 0,
    total: state.bookmarks.length,
    brokenCount: 0,
    percentage: 0
  };

  elements.checkBrokenBtn.disabled = true;
  elements.checkBrokenBtn.textContent = '⏳ 检测中...';

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_BROKEN_LINKS',
      concurrency: 3,
      timeout: 10000,
      delay: 500
    });

    if (response.success) {
      const { total, brokenCount, brokenLinks } = response;

      if (brokenCount === 0) {
        Toast.success(`检测完成！所有 ${total} 个收藏链接均有效。`);
      } else {
        Toast.warning(`检测完成！发现 ${brokenCount} 个失效链接。`);
        if (brokenLinks && brokenLinks.length > 0) {
          showBrokenLinksDetails(brokenLinks);
        }
      }

      await loadBookmarks();
    } else {
      Toast.error(`检测失败：${response.error}`);
    }
  } catch (error) {
    console.error('Failed to check broken links:', error);
    Toast.error(`检测失败：${error.message}`);
  } finally {
    state.isChecking = false;
    elements.checkBrokenBtn.disabled = false;
    elements.checkBrokenBtn.textContent = '⚠️ 失效检测';
  }
}

/**
 * 检测单个链接
 */
function checkSingleLink(item) {
  Toast.info(`正在检测: ${item.title}`);
  // TODO: 实现单个链接检测逻辑
}

/**
 * 删除收藏
 */
function deleteBookmark(item) {
  const confirm = new ConfirmDialog({
    title: '确认删除',
    message: `确定要删除"${item.title}"吗？此操作无法撤销。`,
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        // TODO: 调用删除 API
        Toast.success('删除成功');
        await loadBookmarks();
      } catch (error) {
        Toast.error('删除失败：' + error.message);
      }
    }
  });

  confirm.show();
}

/**
 * 显示失效链接详情
 */
function showBrokenLinksDetails(brokenLinks) {
  const detailsContainer = document.createElement('div');
  detailsContainer.className = 'broken-links-details';

  const header = document.createElement('div');
  header.className = 'details-header';
  header.innerHTML = `<h3>失效链接详情 (${brokenLinks.length})</h3>`;
  detailsContainer.appendChild(header);

  const list = document.createElement('div');
  list.className = 'broken-links-list';

  brokenLinks.forEach(link => {
    const item = document.createElement('div');
    item.className = 'broken-link-item';
    item.innerHTML = `
      <div class="link-header">
        <span class="link-icon">${getStatusIcon(link.checkStatus)}</span>
        <span class="link-title">${escapeHtml(link.title || '未命名')}</span>
      </div>
      <div class="link-url">${escapeHtml(truncateUrl(link.url, 50))}</div>
      <div class="link-error">原因: ${escapeHtml(link.error || '未知错误')}</div>
    `;
    list.appendChild(item);
  });

  detailsContainer.appendChild(list);
  elements.bookmarkList.innerHTML = '';
  elements.bookmarkList.appendChild(detailsContainer);
}

/**
 * 获取状态图标
 */
function getStatusIcon(status) {
  const icons = {
    'broken': '❌',
    'timeout': '⏱️',
    'dns_error': '🌐',
    'network_error': '🔌',
    'unknown': '❓'
  };
  return icons[status] || '⚠️';
}

/**
 * 处理同步
 */
async function handleSync() {
  Toast.info('同步功能开发中');
}

/**
 * 处理导出
 */
async function handleExport() {
  try {
    const data = {
      bookmarks: state.bookmarks,
      categories: state.categories,
      tags: state.tags,
      exportDate: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const timestamp = new Date().toISOString().slice(0, 10);
    const filename = `smart-bookmarks-${timestamp}.json`;

    await chrome.downloads.download({
      url: url,
      filename: filename,
      saveAs: true
    });

    Toast.success('导出成功');
  } catch (error) {
    Toast.error('导出失败：' + error.message);
  }
}

/**
 * 处理导入
 */
async function handleImport() {
  try {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';

    fileInput.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);

          if (!data.bookmarks) {
            throw new Error('无效的导入文件格式');
          }

          // TODO: 导入数据到数据库

          Toast.success(`导入成功：${data.bookmarks.length} 个收藏`);
          await loadBookmarks();
        } catch (error) {
          Toast.error('导入失败：' + error.message);
        }
      };

      reader.readAsText(file);
    };

    fileInput.click();
  } catch (error) {
    Toast.error('导入失败：' + error.message);
  }
}

/**
 * 监听来自 background 的消息
 */
function listenToMessages() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'CHECK_PROGRESS') {
      state.checkProgress = message.data;
      updateCheckProgress();
    } else if (message.type === 'ANALYSIS_PROGRESS') {
      // 更新分析进度
      const { current, total, message: msg } = message.data;
      showProgress(msg || '正在分析...', current, total);
    }
  });
}

/**
 * 更新检测进度
 */
function updateCheckProgress() {
  // TODO: 实现进度更新逻辑
}

/**
 * HTML 转义
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 截断 URL
 */
function truncateUrl(url, maxLength) {
  if (url.length <= maxLength) {
    return url;
  }
  return url.substring(0, maxLength) + '...';
}

// 过滤收藏（搜索入口）
async function filterBookmarks() {
  const searchTerm = state.searchTerm.trim();

  // 如果没有搜索词，显示所有收藏
  if (!searchTerm) {
    renderBookmarks();
    return;
  }

  // 使用搜索模块进行搜索
  try {
    // 动态导入搜索模块
    const { quickSearch, search } = await import('../search/index.js');

    // 实时搜索使用快速搜索（本地）
    const results = await quickSearch(searchTerm, state.bookmarks);

    if (results.length === 0) {
      showNoSearchResults(searchTerm);
      return;
    }

    // 渲染搜索结果
    renderSearchResults(results, searchTerm);

  } catch (error) {
    console.error('Search failed:', error);
    // 如果搜索模块加载失败，使用简单的过滤
    fallbackSearch(searchTerm);
  }
}

/**
 * 显示无搜索结果
 */
function showNoSearchResults(searchTerm) {
  elements.bookmarkList.innerHTML = `
    <div class="empty-state">
      <p>未找到匹配"${escapeHtml(searchTerm)}"的收藏</p>
      <p style="font-size: 13px; margin-top: 8px; color: var(--text-secondary);">
        尝试使用其他关键词或高级搜索语法
      </p>
      <div style="margin-top: 16px; font-size: 12px; text-align: left; max-width: 300px; margin-left: auto; margin-right: auto; background: var(--bg-color); padding: 12px; border-radius: 8px;">
        <strong>高级搜索语法：</strong><br>
        • <code>tag:标签名</code> - 按标签搜索<br>
        • <code>site:域名</code> - 按站点搜索<br>
        • <code>"关键词"</code> - 精确匹配<br>
        • <code>排除:关键词</code> - 排除结果
      </div>
    </div>
  `;
}

/**
 * 渲染搜索结果
 */
function renderSearchResults(results, searchTerm) {
  if (!results || results.length === 0) {
    showNoSearchResults(searchTerm);
    return;
  }

  // 创建搜索结果容器
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'search-results-container';

  // 添加搜索统计
  const stats = document.createElement('div');
  stats.className = 'search-stats';
  stats.innerHTML = `
    <span class="stats-text">找到 <strong>${results.length}</strong> 个结果</span>
    <span class="stats-query" title="${escapeHtml(searchTerm)}">"${escapeHtml(truncateUrl(searchTerm, 30))}"</span>
  `;
  resultsContainer.appendChild(stats);

  // 渲染结果列表
  const list = document.createElement('div');
  list.className = 'search-results-list';

  results.forEach(bookmark => {
    const item = createSearchResultItem(bookmark, searchTerm);
    list.appendChild(item);
  });

  resultsContainer.appendChild(list);

  // 更新容器
  elements.bookmarkList.innerHTML = '';
  elements.bookmarkList.appendChild(resultsContainer);
}

/**
 * 创建搜索结果项
 */
function createSearchResultItem(bookmark, searchTerm) {
  const item = document.createElement('div');
  item.className = 'search-result-item';
  item.dataset.id = bookmark.id;

  // 高亮匹配的关键词
  const highlightedTitle = highlightKeywords(bookmark.title || '未命名', searchTerm);
  const highlightedUrl = highlightKeywords(bookmark.url || '', searchTerm);

  // 获取得分（如果有）
  const scoreBadge = bookmark._score !== undefined
    ? `<span class="score-badge" title="相关性得分: ${bookmark._score}">${Math.min(100, Math.round(bookmark._score))}%</span>`
    : '';

  // 搜索类型标识
  const typeBadge = bookmark._searchType
    ? `<span class="search-type-badge" title="${bookmark._searchType === 'ai' ? 'AI 搜索' : '本地搜索'}">${bookmark._searchType === 'ai' ? '🤖' : '🔍'}</span>`
    : '';

  // 状态图标
  const statusIcon = bookmark.status === 'broken'
    ? '<span class="status-icon broken" title="失效链接">⚠️</span>'
    : '';

  // 标签
  const tagsHtml = bookmark.tags && bookmark.tags.length > 0
    ? `<div class="result-tags">
        ${bookmark.tags.map(tag => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}
      </div>`
    : '';

  item.innerHTML = `
    <div class="result-header">
      <div class="result-title" data-url="${bookmark.url}">
        ${statusIcon}
        <span class="title-text">${highlightedTitle}</span>
        ${typeBadge}
        ${scoreBadge}
      </div>
    </div>
    <div class="result-url">${highlightedUrl}</div>
    ${tagsHtml}
  `;

  // 点击事件
  item.querySelector('.result-title').addEventListener('click', () => {
    if (bookmark.url) {
      chrome.tabs.create({ url: bookmark.url });
    }
  });

  // 右键菜单
  item.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    handleBookmarkRightClick(bookmark, e);
  });

  return item;
}

/**
 * 高亮关键词
 */
function highlightKeywords(text, searchTerm) {
  if (!text) return '';

  // 提取关键词（移除搜索语法）
  const keywords = searchTerm
    .toLowerCase()
    .replace(/tag:\S+/gi, '')
    .replace(/site:\S+/gi, '')
    .replace(/排除:\S+/gi, '')
    .replace(/"/g, '')
    .trim()
    .split(/\s+/)
    .filter(k => k);

  if (keywords.length === 0) {
    return escapeHtml(text);
  }

  // 构建正则表达式
  const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

  // 高亮匹配
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

/**
 * 回退搜索（简单的关键词匹配）
 */
function fallbackSearch(searchTerm) {
  const term = searchTerm.toLowerCase();
  const results = state.bookmarks.filter(bm =>
    (bm.title && bm.title.toLowerCase().includes(term)) ||
    (bm.url && bm.url.toLowerCase().includes(term)) ||
    (bm.tags && bm.tags.some(tag => tag.toLowerCase().includes(term)))
  );

  renderSearchResults(results, searchTerm);
}

// 启动应用
init();
