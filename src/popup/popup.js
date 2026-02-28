// Smart Bookmarks - Popup Script
// 主入口文件 - 完整版，集成 UI 组件和渲染器

import { TreeRenderer, SearchResultsRenderer, ContextMenuRenderer } from '../ui/renderers.js';
import { Toast, ProgressBar, LoadingSpinner, EmptyState, ConfirmDialog } from '../ui/components.js';

console.log('Smart Bookmarks popup loaded');

// DOM 元素引用
const elements = {
  searchInput: document.getElementById('searchInput'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  debugAnalyzeBtn: document.getElementById('debugAnalyzeBtn'),
  checkBrokenBtn: document.getElementById('checkBrokenBtn'),
  syncBtn: document.getElementById('syncBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  bookmarkList: document.getElementById('bookmarkList'),
  cancelCheckBtn: document.getElementById('cancelCheckBtn'),
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
  checkInitiatedLocally: false,  // 本实例是否是发起检测的一方
  checkProgress: {
    completed: 0,
    total: 0,
    brokenCount: 0,
    percentage: 0
  },
  checkStartTime: 0,      // 检测开始时间，用于计算 ETA
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
  restoreCheckingState(); // 如果后台正在检测，恢复 UI 状态
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

    // response.bookmarks 可能是 undefined（未初始化）、[]（已初始化但无数据）、或有数据
    const hasBookmarks = response && response.bookmarks && response.bookmarks.length > 0;

    if (response && response.error) {
      showEmptyState('加载失败', response.error + '，请刷新重试');
      return;
    }

    if (hasBookmarks) {
      state.bookmarks = response.bookmarks;
      state.categories = response.categories || [];
      state.tags = response.tags || [];
      renderBookmarks();
      updateFooterStats();
    } else if (response && Array.isArray(response.bookmarks)) {
      // bookmarks 是空数组，说明已初始化但没有数据
      showEmptyState('暂无收藏', '您还没有添加任何收藏，点击下方按钮导入浏览器收藏', true, true);
    } else {
      // bookmarks 是 undefined 或 response 不存在，说明首次使用
      showWelcomeState();
    }
  } catch (error) {
    console.error('Failed to load bookmarks:', error);
    showEmptyState('加载失败', error.message);
  }
}

/**
 * 显示欢迎/首次使用状态
 */
function showWelcomeState() {
  const welcomeContainer = document.createElement('div');
  welcomeContainer.className = 'welcome-container';

  welcomeContainer.innerHTML = `
    <div class="welcome-content">
      <div class="welcome-icon">📚</div>
      <h2>欢迎使用 Smart Bookmarks!</h2>
      <p class="welcome-desc">这是您第一次使用，让我们先导入浏览器收藏吧</p>

      <div class="welcome-actions">
        <button id="welcomeImportBtn" class="btn btn-primary">
          📥 导入浏览器收藏
        </button>
        <p class="welcome-note">
          💡 <strong>不会覆盖</strong>您现有的浏览器收藏，只会创建一个副本
        </p>
      </div>
    </div>
  `;

  elements.bookmarkList.innerHTML = '';
  elements.bookmarkList.appendChild(welcomeContainer);

  // 绑定导入按钮事件
  const welcomeImportBtn = document.getElementById('welcomeImportBtn');
  welcomeImportBtn.addEventListener('click', async () => {
    welcomeImportBtn.textContent = '正在导入...';
    welcomeImportBtn.disabled = true;

    try {
      const response = await chrome.runtime.sendMessage({ type: 'IMPORT_FROM_BROWSER' });

      if (response.success) {
        Toast.success(response.message || `成功导入 ${response.imported || 0} 个收藏！`);
        await loadBookmarks();
      } else if (response.error) {
        Toast.error('导入失败：' + response.error);
      }
    } catch (error) {
      Toast.error('导入失败：' + error.message);
    } finally {
      welcomeImportBtn.textContent = '📥 导入浏览器收藏';
      welcomeImportBtn.disabled = false;
    }
  });
}

/**
 * 显示空状态
 */
function showEmptyState(title = '暂无收藏', description = '点击浏览器右上角的收藏按钮添加收藏', showImportButton = true, showClearButton = false) {
  elements.bookmarkList.innerHTML = '';

  const emptyContainer = document.createElement('div');
  emptyContainer.className = 'welcome-container';

  let buttonsHtml = '';
  if (showImportButton) {
    buttonsHtml = `
      <div class="welcome-actions">
        <button id="emptyImportBtn" class="btn btn-primary">
          📥 导入浏览器收藏
        </button>
        ${showClearButton ? `<button id="emptyClearBtn" class="btn" style="margin-top: 8px; font-size: 12px; color: var(--text-secondary);">🗑️ 清空数据并重新导入</button>` : ''}
      </div>
    `;
  }

  emptyContainer.innerHTML = `
    <div class="welcome-content">
      <div class="welcome-icon">📚</div>
      <h2>${title}</h2>
      <p class="welcome-desc">${description}</p>
      ${buttonsHtml}
    </div>
  `;

  elements.bookmarkList.appendChild(emptyContainer);

  // 如果有导入按钮，绑定事件
  if (showImportButton) {
    const importBtn = document.getElementById('emptyImportBtn');
    if (importBtn) {
      importBtn.addEventListener('click', async () => {
        importBtn.textContent = '正在导入...';
        importBtn.disabled = true;

        try {
          const response = await chrome.runtime.sendMessage({ type: 'IMPORT_FROM_BROWSER' });

          if (response.success) {
            Toast.success(response.message || `成功导入 ${response.imported || 0} 个收藏！`);
            await loadBookmarks();
          } else if (response.error) {
            Toast.error('导入失败：' + response.error);
          }
        } catch (error) {
          Toast.error('导入失败：' + error.message);
        } finally {
          importBtn.textContent = '📥 导入浏览器收藏';
          importBtn.disabled = false;
        }
      });
    }
  }

  // 如果有清空按钮，绑定事件
  if (showClearButton) {
    const clearBtn = document.getElementById('emptyClearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', async () => {
        if (!confirm('确定要清空所有数据吗？这将删除所有收藏、分类和标签。')) {
          return;
        }

        clearBtn.textContent = '正在清空...';
        clearBtn.disabled = true;

        try {
          const response = await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });

          if (response.success) {
            Toast.success('数据已清空，正在重新导入...');
            // 自动重新导入
            setTimeout(async () => {
              const importResponse = await chrome.runtime.sendMessage({ type: 'IMPORT_FROM_BROWSER' });
              if (importResponse.success) {
                Toast.success(importResponse.message || '导入成功！');
                await loadBookmarks();
              }
            }, 500);
          } else if (response.error) {
            Toast.error('清空失败：' + response.error);
          }
        } catch (error) {
          Toast.error('清空失败：' + error.message);
        } finally {
          clearBtn.textContent = '🗑️ 清空数据并重新导入';
          clearBtn.disabled = false;
        }
      });
    }
  }
}

/**
 * 更新 footer 统计数字
 */
function updateFooterStats() {
  const el = document.getElementById('footerStats');
  if (!el) return;
  const total = state.bookmarks.length;
  if (total === 0) { el.textContent = ''; return; }
  // 以 status === 'broken' 为统一口径（与 待清理 分类保持一致）
  const broken = state.bookmarks.filter(b => b.status === 'broken').length;
  const uncertain = state.bookmarks.filter(b => b.checkStatus === 'uncertain').length;
  let statsText = `共 ${total} 条`;
  if (broken > 0) statsText += `  ⚠️ ${broken} 失效`;
  if (uncertain > 0) statsText += `  ❓ ${uncertain} 不确定`;
  el.textContent = statsText || `共 ${total} 条收藏`;
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

  // 先添加所有分类
  if (state.categories && state.categories.length > 0) {
    state.categories.forEach(category => {
      itemMap.set(category.id, {
        ...category,
        title: category.name, // 统一使用 title 字段
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
    // 确定父节点ID
    let parentId = null;
    if (item.type === 'folder') {
      // 分类使用 parentId
      parentId = item.parentId;
    } else {
      // 书签使用 categoryId
      parentId = item.categoryId;
    }

    if (parentId && itemMap.has(parentId)) {
      // 有父节点，添加到父节点的 children 中
      const parent = itemMap.get(parentId);
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
    categoryHeader.style.cursor = 'pointer';
    categoryHeader.innerHTML = `
      <span class="category-toggle">▶</span>
      <span class="category-icon">📁</span>
      <span class="category-name">${escapeHtml(category.name)}</span>
      <span class="category-count">${categoryBookmarks.length}</span>
    `;

    const categoryList = document.createElement('div');
    categoryList.className = 'category-list';
    categoryList.style.display = 'none'; // 默认折叠

    categoryBookmarks.forEach(bookmark => {
      const bookmarkEl = createBookmarkElement(bookmark);
      categoryList.appendChild(bookmarkEl);
    });

    // 点击标题展开/收起
    categoryHeader.onclick = () => {
      const toggle = categoryHeader.querySelector('.category-toggle');
      if (categoryList.style.display === 'none') {
        categoryList.style.display = 'block';
        toggle.textContent = '▼';
      } else {
        categoryList.style.display = 'none';
        toggle.textContent = '▶';
      }
    };

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

  const statusIcon = bookmark.status === 'broken' ? '⚠️'
    : bookmark.checkStatus === 'uncertain' ? '❓'
    : '🔖';
  const statusClass = bookmark.status === 'broken' ? 'broken'
    : bookmark.checkStatus === 'uncertain' ? 'uncertain'
    : '';

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
    performSearch();
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

  // 调试分析
  elements.debugAnalyzeBtn.addEventListener('click', handleDebugAnalyze);

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
    elements.analyzeBtn.textContent = '🤖 分析';
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
 * 处理调试分析
 */
async function handleDebugAnalyze() {
  if (state.bookmarks.length === 0) {
    Toast.warning('请先导入收藏');
    return;
  }

  // 弹出选择对话框
  showDebugSelectDialog();
}

/**
 * 显示调试分析的书签选择对话框
 */
function showDebugSelectDialog() {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';

  // 取前 20 个书签供选择（默认勾选前 3 个）
  const candidates = state.bookmarks.slice(0, 20);

  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width: 600px;">
      <div class="dialog-header">
        <h2>🔬 调试分析 — 选择书签</h2>
        <button class="dialog-close" id="debugDialogClose">&times;</button>
      </div>
      <div class="dialog-content" style="max-height: 400px; overflow-y: auto;">
        <p style="margin-bottom: 12px; font-size: 13px; color: #666;">
          选择 1-5 个书签进行试分析，系统将记录完整的 API 交互报文。
        </p>
        <div id="debugBookmarkList">
          ${candidates.map((bm, i) => `
            <label style="display: flex; align-items: flex-start; gap: 8px; padding: 6px 0;
                          border-bottom: 1px solid #f1f5f9; cursor: pointer; font-size: 13px;">
              <input type="checkbox" value="${escapeHtml(bm.id)}"
                     ${i < 3 ? 'checked' : ''}
                     style="margin-top: 3px; flex-shrink: 0;" />
              <div style="min-width: 0;">
                <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis;
                            white-space: nowrap;">${escapeHtml(bm.title)}</div>
                <div style="font-size: 11px; color: #94a3b8; overflow: hidden;
                            text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(bm.url)}</div>
              </div>
            </label>
          `).join('')}
        </div>
      </div>
      <div class="dialog-footer">
        <span id="debugSelectedCount" style="font-size: 12px; color: #64748b;">已选 3 个</span>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-cancel" id="debugDialogCancel">取消</button>
          <button class="btn btn-primary" id="debugDialogStart"
                  style="background: #059669; border-color: #059669;">🔬 开始分析</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => dialog.remove(), 300);
  };

  // 更新选中计数
  const updateCount = () => {
    const checked = dialog.querySelectorAll('#debugBookmarkList input[type="checkbox"]:checked');
    const countEl = dialog.querySelector('#debugSelectedCount');
    const startBtn = dialog.querySelector('#debugDialogStart');
    countEl.textContent = `已选 ${checked.length} 个`;
    startBtn.disabled = checked.length === 0 || checked.length > 5;
    if (checked.length > 5) {
      countEl.textContent += '（最多选 5 个）';
      countEl.style.color = '#ef4444';
    } else {
      countEl.style.color = '#64748b';
    }
  };

  dialog.querySelector('#debugBookmarkList').addEventListener('change', updateCount);
  dialog.querySelector('#debugDialogClose').addEventListener('click', closeDialog);
  dialog.querySelector('#debugDialogCancel').addEventListener('click', closeDialog);

  dialog.querySelector('#debugDialogStart').addEventListener('click', async () => {
    const checked = dialog.querySelectorAll('#debugBookmarkList input[type="checkbox"]:checked');
    const selectedIds = Array.from(checked).map(cb => cb.value);

    if (selectedIds.length === 0) {
      Toast.warning('请至少选择 1 个书签');
      return;
    }

    closeDialog();
    await executeDebugAnalyze(selectedIds);
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  setTimeout(() => dialog.classList.add('show'), 10);
}

/**
 * 执行调试分析
 */
async function executeDebugAnalyze(bookmarkIds) {
  elements.debugAnalyzeBtn.disabled = true;
  elements.debugAnalyzeBtn.textContent = '⏳ 分析中...';
  showProgress('调试分析中...', 0, 0);

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE_DEBUG',
      bookmarkIds
    });

    hideProgress();

    if (response.error) {
      throw new Error(response.error);
    }

    showDebugResultDialog(response.result);
  } catch (error) {
    console.error('Debug analysis failed:', error);
    hideProgress();
    Toast.error(`调试分析失败: ${error.message}`);
  } finally {
    elements.debugAnalyzeBtn.disabled = false;
    elements.debugAnalyzeBtn.textContent = '🔬 调试';
  }
}

/**
 * 显示调试分析结果对话框
 */
function showDebugResultDialog(debugLog) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';

  const hasError = !!debugLog.error;
  const warningCount = debugLog.validation?.warnings?.length || 0;
  const usage = debugLog.response?.usage;

  // 格式化 JSON（安全转义）
  const formatJson = (obj) => {
    if (!obj) return '<span style="color: #94a3b8;">null</span>';
    try {
      return escapeHtml(JSON.stringify(obj, null, 2));
    } catch {
      return escapeHtml(String(obj));
    }
  };

  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width: 750px; max-height: 85vh;">
      <div class="dialog-header">
        <h2>${hasError ? '❌' : '✅'} 调试分析结果</h2>
        <button class="dialog-close" id="debugResultClose">&times;</button>
      </div>
      <div class="dialog-content" style="max-height: calc(85vh - 120px); overflow-y: auto;">

        <!-- 概要信息 -->
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
                    gap: 8px; margin-bottom: 16px;">
          <div style="background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #94a3b8;">书签数</div>
            <div style="font-size: 18px; font-weight: 600; color: #334155;">${debugLog.bookmarkCount}</div>
          </div>
          <div style="background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #94a3b8;">耗时</div>
            <div style="font-size: 18px; font-weight: 600; color: #334155;">${(debugLog.duration / 1000).toFixed(1)}s</div>
          </div>
          <div style="background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #94a3b8;">状态</div>
            <div style="font-size: 18px; font-weight: 600; color: ${hasError ? '#ef4444' : '#22c55e'};">
              ${hasError ? '失败' : '成功'}
            </div>
          </div>
          ${usage ? `
          <div style="background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #94a3b8;">Token 用量</div>
            <div style="font-size: 14px; font-weight: 600; color: #334155;">
              ${usage.prompt_tokens || '?'} + ${usage.completion_tokens || '?'}
            </div>
          </div>` : ''}
          ${debugLog.summaryExtraction ? `
          <div style="background: #f8fafc; border-radius: 8px; padding: 10px; text-align: center;">
            <div style="font-size: 11px; color: #94a3b8;">摘要提取</div>
            <div style="font-size: 14px; font-weight: 600; color: ${debugLog.summaryExtraction.success > 0 ? '#22c55e' : '#f59e0b'};">
              ${debugLog.summaryExtraction.success}/${debugLog.summaryExtraction.total}
            </div>
          </div>` : ''}
        </div>

        ${hasError ? `
          <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px;
                      padding: 12px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #dc2626; margin-bottom: 4px;">❌ 错误</div>
            <div style="font-size: 13px; color: #991b1b; word-break: break-all;">${escapeHtml(debugLog.error)}</div>
          </div>
        ` : ''}

        ${warningCount > 0 ? `
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px;
                      padding: 12px; margin-bottom: 12px;">
            <div style="font-weight: 600; color: #d97706; margin-bottom: 4px;">⚠️ 校验警告 (${warningCount})</div>
            <ul style="font-size: 12px; color: #92400e; margin: 0; padding-left: 20px;">
              ${debugLog.validation.warnings.map(w => `<li>${escapeHtml(w)}</li>`).join('')}
            </ul>
          </div>
        ` : ''}

        <!-- 输入书签 -->
        <details style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            📋 输入书签 (${debugLog.bookmarkCount})
          </summary>
          <div style="background: #f8fafc; border-radius: 6px; padding: 8px 12px; font-size: 12px;">
            ${debugLog.bookmarks.map(b => `
              <div style="padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
                <div style="font-weight: 500;">[${escapeHtml(b.id)}] ${escapeHtml(b.title)}</div>
                <div style="color: #94a3b8; font-size: 11px;">${escapeHtml(b.url)}</div>
                ${b.hasSummary ? `<div style="color: #22c55e; font-size: 11px;">✅ 已提取摘要${b.summaryPreview ? ': ' + escapeHtml(b.summaryPreview) : ''}</div>` : '<div style="color: #f59e0b; font-size: 11px;">⚠️ 未提取到摘要</div>'}
              </div>
            `).join('')}
          </div>
        </details>

        <!-- 页面摘要提取详情 -->
        ${debugLog.summaryExtraction ? `
        <details style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            🌍 页面摘要提取 (${debugLog.summaryExtraction.success}/${debugLog.summaryExtraction.total} 成功)
          </summary>
          <pre style="background: #1e293b; color: #86efac; border-radius: 6px; padding: 12px;
                      font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 300px;
                      overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${formatJson(debugLog.summaryExtraction.details)}</pre>
        </details>
        ` : ''}

        <!-- 请求报文 -->
        <details style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            📤 请求报文 (Request)
          </summary>
          <pre style="background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 12px;
                      font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 300px;
                      overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${formatJson(debugLog.request)}</pre>
        </details>

        <!-- 原始响应 -->
        <details style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            📥 原始响应 (Raw Response)
          </summary>
          <pre style="background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 12px;
                      font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 300px;
                      overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${debugLog.rawContent ? escapeHtml(debugLog.rawContent) : '<span style="color: #94a3b8;">无响应内容</span>'}</pre>
        </details>

        <!-- HTTP 响应详情 -->
        <details style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            🌐 HTTP 响应详情 (${debugLog.response?.status || '?'} ${debugLog.response?.statusText || ''})
          </summary>
          <pre style="background: #1e293b; color: #e2e8f0; border-radius: 6px; padding: 12px;
                      font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 300px;
                      overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${formatJson(debugLog.response)}</pre>
        </details>

        <!-- 解析结果 -->
        <details ${!hasError ? 'open' : ''} style="margin-bottom: 8px;">
          <summary style="cursor: pointer; font-size: 13px; font-weight: 600; color: #475569;
                          padding: 8px 0; user-select: none;">
            🧩 解析后的结构化数据 (Parsed Result)
          </summary>
          <pre style="background: #1e293b; color: #a5f3fc; border-radius: 6px; padding: 12px;
                      font-size: 11px; line-height: 1.5; overflow-x: auto; max-height: 400px;
                      overflow-y: auto; white-space: pre-wrap; word-break: break-all;">${formatJson(debugLog.parsed)}</pre>
        </details>

      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" id="debugResultOk">关闭</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => dialog.remove(), 300);
  };

  dialog.querySelector('#debugResultClose').addEventListener('click', closeDialog);
  dialog.querySelector('#debugResultOk').addEventListener('click', closeDialog);
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  setTimeout(() => dialog.classList.add('show'), 10);
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

  // 隐藏取消按钮
  if (elements.cancelCheckBtn) {
    elements.cancelCheckBtn.style.display = 'none';
  }

  // 清空附加信息
  const etaEl = document.getElementById('progressEta');
  const subEl = document.getElementById('progressSub');
  if (etaEl) etaEl.textContent = '';
  if (subEl) subEl.textContent = '';
}

/**
 * 处理失效链接检测（自动检测上次是否有中断会话）
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

  // 检查是否有中断的会话
  let interruptedSession = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_CHECK_SESSION' });
    if (res && res.session && res.session.cancelled) {
      interruptedSession = res.session;
    }
  } catch (_) { /* 忽略 */ }

  if (interruptedSession) {
    // 计算已检测数量（已更新 lastChecked 的书签）
    const checkedCount = state.bookmarks.filter(
      b => b.lastChecked && b.lastChecked >= interruptedSession.startTime
    ).length;
    const remaining = state.bookmarks.length - checkedCount;
    const sessionTime = new Date(interruptedSession.startTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    // 自定义双按钮对话框：续检 / 重新全检
    showResumeDialog({
      sessionTime,
      checkedCount,
      remaining,
      total: state.bookmarks.length,
      onResume: () => startBrokenLinkCheck(true),
      onFresh: async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_CHECK_SESSION' }).catch(() => {});
        startBrokenLinkCheck(false);
      }
    });
  } else {
    const confirm = new ConfirmDialog({
      title: '检测失效链接',
      message: `即将检测 ${state.bookmarks.length} 个收藏链接的有效性。\n\n是否开始检测？`,
      confirmText: '开始检测',
      cancelText: '取消',
      onConfirm: () => startBrokenLinkCheck(false)
    });
    confirm.show();
  }
}

/**
 * 显示续检 / 重新全检对话框
 */
function showResumeDialog({ sessionTime, checkedCount, remaining, total, onResume, onFresh }) {
  // 复用 confirm-dialog 的遮罩，自己构造两按钮内容
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';

  overlay.innerHTML = `
    <div class="confirm-dialog">
      <div class="confirm-dialog-header">
        <h3>⏸️ 上次检测未完成</h3>
      </div>
      <div class="confirm-dialog-body">
        <p>上次检测（${sessionTime}）被中断。</p>
        <p>已完成 <strong>${checkedCount}</strong> 个，剩余 <strong>${remaining}</strong> 个未检测。</p>
        <p style="margin-top:8px;color:var(--text-secondary);font-size:12px;">
          续检将跳过已完成的 ${checkedCount} 个，只检测剩余部分。
        </p>
      </div>
      <div class="confirm-dialog-footer" style="display:flex;gap:8px;justify-content:flex-end;">
        <button class="btn btn-secondary" id="resumeDialogFresh">🔄 重新全检</button>
        <button class="btn btn-primary" id="resumeDialogResume">▶️ 继续上次（${remaining} 个）</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));

  function close() {
    overlay.classList.remove('show');
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 300);
  }

  overlay.querySelector('#resumeDialogResume').addEventListener('click', () => { close(); onResume(); });
  overlay.querySelector('#resumeDialogFresh').addEventListener('click', () => { close(); onFresh(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
}

/**
 * 开始失效链接检测
 * @param {boolean} resume - true=续检（跳过已检测），false=全新检测
 */
async function startBrokenLinkCheck(resume = false) {
  state.isChecking = true;
  state.checkInitiatedLocally = true;
  state.checkStartTime = Date.now();
  state.checkProgress = {
    completed: 0,
    total: state.bookmarks.length,
    brokenCount: 0,
    percentage: 0
  };

  elements.checkBrokenBtn.disabled = true;
  elements.checkBrokenBtn.textContent = '⏳ 检测中...';

  // 更新 footer 统计
  updateFooterStats();

  // 显示取消按钮
  if (elements.cancelCheckBtn) {
    elements.cancelCheckBtn.style.display = '';
    elements.cancelCheckBtn.disabled = false;
    elements.cancelCheckBtn.textContent = '✕ 取消';

    elements.cancelCheckBtn.onclick = async () => {
      elements.cancelCheckBtn.disabled = true;
      elements.cancelCheckBtn.textContent = '正在取消...';
      await chrome.runtime.sendMessage({ type: 'CANCEL_CHECK' }).catch(() => {});
    };
  }

  showProgress('正在检测链接...', 0, state.bookmarks.length);

  let preventFinallyReset = false;

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CHECK_BROKEN_LINKS',
      resume   // 传递续检标志给 background
    });

    if (!response.success && response.alreadyRunning) {
      // 后台已有检测在运行（竞态： restoreCheckingState 尚未完成）
      // 保持 UI 为“检测中”状态，由 CHECK_DONE 广播负责重置
      state.checkInitiatedLocally = false;
      preventFinallyReset = true;
      Toast.info('检测已在后台运行中，请等待完成...');
      return;
    }

    if (response.success) {
      const { total, brokenCount, brokenLinks, cancelled, skippedCount, uncertainCount = 0 } = response;

      if (cancelled) {
        Toast.info(`检测已取消，已完成 ${state.checkProgress.completed}/${total} 个。`);
      } else if (brokenCount === 0 && uncertainCount === 0) {
        const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
        Toast.success(`检测完成！所有 ${total} 个收藏链接均有效。${skipNote}`);
      } else {
        const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
        const uncertainNote = uncertainCount > 0 ? `，${uncertainCount} 个被 WAF/反爬拦截（标记为 \u2753，内容可能正常）` : '';
        if (brokenCount > 0) {
          Toast.warning(`检测完成！发现 ${brokenCount} 个失效链接，已移至「待清理」${uncertainNote}。${skipNote}`);
        } else {
          Toast.info(`检测完成！未发现失效链接${uncertainNote}。${skipNote}`);
        }
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
    if (!preventFinallyReset) {
      state.isChecking = false;
      state.checkInitiatedLocally = false;
      elements.checkBrokenBtn.disabled = false;
      elements.checkBrokenBtn.textContent = '⚠️ 检测';
      hideProgress();
    }
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
    } else if (message.type === 'CHECK_DONE') {
      // 后台广播：检测完成（供重新打开的 popup 实例使用）
      handleCheckDone(message.data);
    } else if (message.type === 'ANALYSIS_PROGRESS') {
      // 更新分析进度
      const { current, total, message: msg } = message.data;
      showProgress(msg || '正在分析...', current, total);
    }
  });
}

/**
 * popup 重新打开时，查询后台是否正在检测，若是则恢复 UI 状态
 */
async function restoreCheckingState() {
  if (state.isChecking) return;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_CHECK_STATUS' });
    if (state.isChecking) return; // 竞态双重检查
    if (!res || !res.isRunning || !res.progress) return;

    // 恢复检测中的 UI
    state.isChecking = true;
    state.checkInitiatedLocally = false;
    state.checkStartTime = res.progress.startTime || Date.now();
    state.checkProgress = {
      completed:  res.progress.completed,
      total:      res.progress.total,
      brokenCount:res.progress.brokenCount,
      percentage: res.progress.percentage
    };

    elements.checkBrokenBtn.disabled = true;
    elements.checkBrokenBtn.textContent = '⏳ 检测中...';

    if (elements.cancelCheckBtn) {
      elements.cancelCheckBtn.style.display = '';
      elements.cancelCheckBtn.disabled = false;
      elements.cancelCheckBtn.textContent = '✕ 取消';
      elements.cancelCheckBtn.onclick = async () => {
        elements.cancelCheckBtn.disabled = true;
        elements.cancelCheckBtn.textContent = '正在取消...';
        await chrome.runtime.sendMessage({ type: 'CANCEL_CHECK' }).catch(() => {});
      };
    }

    const progressSection = document.getElementById('progressSection');
    if (progressSection) progressSection.style.display = '';
    updateCheckProgress();
  } catch (_) { /* 忽略 */ }
}

/**
 * 处理后台广播的检测完成事件
 * 仅用于"重新打开的 popup"场景；本实例发起的检测由 startBrokenLinkCheck.finally 处理
 */
function handleCheckDone({ cancelled, total, brokenCount, skippedCount }) {
  // 本实例发起的检测，由 startBrokenLinkCheck 自己处理，此处跳过
  if (state.checkInitiatedLocally) return;
  // 若本实例并未处于检测中（正常不会触发），直接忽略
  if (!state.isChecking) return;

  state.isChecking = false;
  state.checkInitiatedLocally = false;
  elements.checkBrokenBtn.disabled = false;
  elements.checkBrokenBtn.textContent = '⚠️ 检测';
  hideProgress();
  updateFooterStats();

  if (cancelled) {
    Toast.info('检测已取消。');
  } else if (brokenCount === 0) {
    const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
    Toast.success(`检测完成！所有 ${total} 个收藏链接均有效。${skipNote}`);
  } else {
    const skipNote = skippedCount > 0 ? `（跳过 ${skippedCount} 个已检测）` : '';
    Toast.warning(`检测完成！发现 ${brokenCount} 个失效链接，已移至「待清理」。${skipNote}`);
  }
  loadBookmarks();
}

/**
 * 更新检测进度（响应 background 推送的 CHECK_PROGRESS 消息）
 */
function updateCheckProgress() {
  const { completed, total, brokenCount, percentage } = state.checkProgress;

  // 更新进度条
  const progressFill = document.getElementById('progressFill');
  const progressCount = document.getElementById('progressCount');
  const progressMessage = document.getElementById('progressMessage');
  const progressSection = document.getElementById('progressSection');
  const progressEta = document.getElementById('progressEta');
  const progressSub = document.getElementById('progressSub');

  if (!progressSection) return;
  progressSection.style.display = 'block';

  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressCount) progressCount.textContent = `${completed}/${total}`;
  if (progressMessage) progressMessage.textContent = '正在检测链接有效性...';
  if (progressSub && brokenCount > 0) {
    progressSub.textContent = `已发现 ${brokenCount} 个失效链接`;
  }

  // 计算并显示预计剩余时间
  if (progressEta && completed > 0 && state.checkStartTime > 0) {
    const elapsed = Date.now() - state.checkStartTime;
    const rate = completed / elapsed; // 条/ms
    const remaining = total - completed;
    const etaMs = remaining / rate;

    if (etaMs < 60000) {
      progressEta.textContent = `约 ${Math.ceil(etaMs / 1000)} 秒`;
    } else {
      const mins = Math.ceil(etaMs / 60000);
      progressEta.textContent = `约 ${mins} 分钟`;
    }
  }
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
async function performSearch() {
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
