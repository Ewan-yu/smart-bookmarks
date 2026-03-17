// Smart Bookmarks - Popup Script
// 主入口文件 - 完整版，集成 UI 组件和渲染器

import { TreeRenderer, SearchResultsRenderer } from '../ui/renderers.js';
import { Toast, ProgressBar, LoadingSpinner, EmptyState, ConfirmDialog } from '../ui/components.js';
import {
  safeGetStorage,
  safeSetStorage,
  asyncConfirm,
  escapeHtml,        // 已移至 helpers.js（更安全，支持类型检查）
  truncateUrl,       // 已移至 helpers.js（支持类型检查）
  isValidUrl,        // 已移至 helpers.js（完全相同）
  normalizeUrl,      // 已移至 helpers.js（完全相同）
  isInBookmarksBar   // 已移至 helpers.js（完全相同）
} from './utils/helpers.js';
import FormValidator from './utils/form-validator.js';
import { createInputDialog, createSelectDialog } from './utils/dialog-builder.js';
import eventBus, { Events } from './utils/event-bus.js';
import keyboardManager from './modules/keyboard.js';
import contextMenuManager from './modules/context-menu.js';
import bookmarkManager from './modules/bookmarks.js';
import { showAnalysisResumeDialog } from './modules/analysis-resume.js';
import { showResumeDialog as showCheckResumeDialog } from './modules/check-resume.js';
import { showDebugSelectDialog, showDebugResultDialog } from './modules/debug-dialog.js';
import { createSearchManager } from './modules/search-manager.js';

console.log('Smart Bookmarks popup loaded');

// DOM 元素引用
const elements = {
  searchInput: document.getElementById('searchInput'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  mergeSuggestBtn: document.getElementById('mergeSuggestBtn'),
  deduplicateBtn: document.getElementById('deduplicateBtn'),
  debugAnalyzeBtn: document.getElementById('debugAnalyzeBtn'),
  checkBrokenBtn: document.getElementById('checkBrokenBtn'),
  syncBtn: document.getElementById('syncBtn'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  settingsBtn: document.getElementById('settingsBtn'),
  bookmarkList: document.getElementById('bookmarkList'),
  // 任务面板
  cancelCheckBtn: document.getElementById('cancelCheckBtn'),
  cancelAnalyzeBtn: document.getElementById('cancelAnalyzeBtn'),
  taskPanel: document.getElementById('taskPanel'),
  taskPanelBody: document.getElementById('taskPanelBody'),
  taskPanelToggle: document.getElementById('taskPanelToggle'),
  analyzeProgressSection: document.getElementById('analyzeProgressSection'),
  analyzeProgressCount: document.getElementById('analyzeProgressCount'),
  analyzeProgressFill: document.getElementById('analyzeProgressFill'),
  analyzeProgressSub: document.getElementById('analyzeProgressSub'),
  checkProgressSection: document.getElementById('checkProgressSection'),
  checkProgressCount: document.getElementById('checkProgressCount'),
  checkProgressFill: document.getElementById('checkProgressFill'),
  checkProgressEta: document.getElementById('checkProgressEta'),
  checkProgressSub: document.getElementById('checkProgressSub'),
  // 侧栏与主区域
  sidebarTreeContent: document.getElementById('sidebarTreeContent'),
  sidebarStats: document.getElementById('sidebarStats'),
  navAllCount: document.getElementById('navAllCount'),
  navBrokenCount: document.getElementById('navBrokenCount'),
  breadcrumb: document.getElementById('breadcrumb'),
  folderStats: document.getElementById('folderStats'),
  // 右键菜单 & 编辑对话框
  contextMenuEl: document.getElementById('contextMenuEl'),
  editDialog: document.getElementById('editDialog'),
  searchStats: document.getElementById('searchStats'),
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
  checkInitiatedLocally: false,
  checkProgress: {
    completed: 0,
    total: 0,
    brokenCount: 0,
    percentage: 0
  },
  checkStartTime: 0,
  expandedFolders: new Set(),
  selectedItem: null,
  // 新增：整屏布局状态
  currentFolderId: null,      // null = 全部视图
  currentNavMode: 'all',      // 'all'|'recent'|'broken'|'tags'|'folder'
  breadcrumb: [],             // [{id, title}, ...]
  sidebarWidth: 260,          // 左侧栏宽度（px）
  taskPanelExpanded: false,
  clipboardItem: null,        // 剪切/复制的书签
  expandedSidebarFolders: new Set(),  // 侧栏展开的文件夹
};

// 渲染器实例（将在 DOM 加载后初始化）
let treeRenderer = null;
let searchRenderer = null;
let searchManager = null;

// 初始化
function init() {
  initRenderers();
  loadSidebarWidth();
  initTaskPanel();
  initResizer();
  initEditDialog();
  initDragAndDrop();
  bindEvents();
  listenToMessages();

  // 初始化键盘导航
  keyboardManager.init();
  setupGlobalShortcuts();

  // 初始化右键菜单模块
  contextMenuManager.init();
  setupContextMenuHandler();

  // 初始化书签事件监听器
  setupBookmarkListeners();

  // 初始化搜索管理器
  searchManager = createSearchManager({
    elements: elements,
    createBookmarkRow: createBookmarkRow,
    onRender: renderBookmarks
  });

  loadBookmarks();
  restoreCheckingState();
}

/**
 * 设置全局快捷键事件监听
 * 处理来自 keyboardManager 的全局快捷键
 */
function setupGlobalShortcuts() {
  eventBus.on(Events.KEYBOARD_ACTION, ({ action, item, position, dialog }) => {
    switch (action) {
      case 'closeAll':
        // 关闭所有模态元素
        closeEditDialog();
        hideContextMenu();
        // 关闭所有手动创建的对话框（合并、去重、调试等）
        document.querySelectorAll('.confirm-dialog-overlay').forEach(d => {
          d.remove();
        });
        break;

      case 'closeDialog':
        // 关闭指定对话框
        if (dialog) {
          if (dialog.id === 'editDialog') {
            closeEditDialog();
          } else {
            dialog.remove();
          }
        }
        break;

      case 'edit':
        // 编辑当前选中项
        if (state.selectedItem) {
          showEditDialog(state.selectedItem);
        }
        break;

      case 'delete':
        // 删除当前选中项
        if (item) {
          state.selectedItem = item;
          if (item.type === 'folder') {
            deleteFolder(item);
          } else {
            deleteBookmark(item);
          }
        }
        break;

      case 'openContextMenu':
        // 打开右键菜单
        if (item && position) {
          state.selectedItem = item;
          showContextMenu(item, position.x, position.y);
        }
        break;

      case 'showHelp':
        // 显示快捷键帮助
        showShortcutHelp();
        break;

      case 'navigate':
        // 导航事件（keyboard.js 已处理焦点，这里更新选中状态）
        if (item) {
          state.selectedItem = item;
        }
        break;

      case 'focusSearch':
        // 聚焦搜索框（由 keyboardManager 直接处理）
        break;

      default:
        console.warn('Unknown keyboard action:', action);
    }
  });
}

/**
 * 设置右键菜单事件监听
 * 处理来自 contextMenuManager 的菜单操作
 */
function setupContextMenuHandler() {
  eventBus.on(Events.CONTEXT_MENU_ACTION, ({ action, item }) => {
    if (!item) return;

    // 更新选中项
    state.selectedItem = item;

    // 处理菜单操作
    handleContextMenuAction(action);
  });
}

/**
 * 设置书签事件监听器
 * 处理来自 bookmarkManager 的书签变更事件
 */
function setupBookmarkListeners() {
  // 监听书签加载事件
  eventBus.on(Events.BOOKMARKS_LOADED, ({ bookmarks, categories, tags }) => {
    console.log('[setupBookmarkListeners] Bookmarks loaded:', bookmarks.length);
  });

  // 监听书签添加事件
  eventBus.on(Events.BOOKMARK_ADDED, (bookmark) => {
    console.log('[setupBookmarkListeners] Bookmark added:', bookmark);
    // 书签添加后刷新界面
    renderBookmarks();
    updateFooterStats();
  });

  // 监听书签更新事件
  eventBus.on(Events.BOOKMARK_UPDATED, ({ id, updates }) => {
    console.log('[setupBookmarkListeners] Bookmark updated:', id, updates);
    // 书签更新后刷新界面
    renderBookmarks();
    updateFooterStats();
  });

  // 监听书签删除事件
  eventBus.on(Events.BOOKMARKS_DELETED, ({ ids, count }) => {
    console.log('[setupBookmarkListeners] Bookmarks deleted:', ids, count);
    // 书签删除后刷新界面
    renderBookmarks();
    updateFooterStats();
    Toast.success(`已删除 ${count} 个书签`);
  });
}

/**
 * 显示快捷键帮助
 */
function showShortcutHelp() {
  const helpContent = keyboardManager.createHelpContent();
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog" style="max-width: 500px;">
      ${helpContent}
      <div style="margin-top: 16px; text-align: right;">
        <button class="btn btn-primary" id="closeHelpBtn">关闭</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('closeHelpBtn').onclick = () => {
    overlay.remove();
  };

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.remove();
    }
  });
}

/**
 * 初始化渲染器
 */
function initRenderers() {
  // 搜索结果渲染器 - 用于显示搜索结果
  searchRenderer = new SearchResultsRenderer({
    container: elements.bookmarkList,
    onItemClick: handleBookmarkClick,
    onItemRightClick: handleBookmarkRightClick
  });

  // 右键菜单由 contextMenuManager 模块处理
}

/**
 * 加载收藏数据
 */
async function loadBookmarks() {
  try {
    const result = await bookmarkManager.load();

    if (!result.success) {
      showEmptyState('加载失败', result.error + '，请刷新重试');
      return;
    }

    const hasBookmarks = result.bookmarks && result.bookmarks.length > 0;

    if (hasBookmarks) {
      state.bookmarks = result.bookmarks;
      state.categories = result.categories || [];
      state.tags = result.tags || [];
      renderBookmarks();
      updateFooterStats();
    } else if (result.bookmarks && Array.isArray(result.bookmarks)) {
      // bookmarks 是空数组，说明已初始化但没有数据
      showEmptyState('暂无收藏', '您还没有添加任何收藏，点击下方按钮导入浏览器收藏', true, true);
    } else {
      // bookmarks 是 undefined 或不存在，说明首次使用
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
        const confirmed = await asyncConfirm({
          title: '清空数据',
          message: '确定要清空所有数据吗？这将删除所有收藏、分类和标签。',
          confirmText: '确认清空',
          cancelText: '取消',
          danger: true
        });

        if (!confirmed) {
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
 * 更新 footer/sidebar 统计数字
 */
function updateFooterStats() {
  const total = state.bookmarks.length;
  const broken = state.bookmarks.filter(b => b.status === 'broken').length;

  // 侧栏徽标
  if (elements.navAllCount) elements.navAllCount.textContent = total || '';
  if (elements.navBrokenCount) {
    if (broken > 0) {
      elements.navBrokenCount.textContent = broken;
      elements.navBrokenCount.style.display = '';
    } else {
      elements.navBrokenCount.style.display = 'none';
    }
  }
  if (elements.sidebarStats) {
    elements.sidebarStats.textContent = total > 0 ? `共 ${total} 条收藏${broken > 0 ? `  ⚠️ ${broken} 失效` : ''}` : '';
  }
}

/**
 * 渲染收藏列表（根据当前导航模式）
 */
function renderBookmarks() {
  if (state.bookmarks.length === 0) {
    showEmptyState();
    return;
  }
  updateFooterStats();
  renderSidebar();

  if (state.searchTerm.trim()) {
    renderSearchResults();
    return;
  }

  switch (state.currentNavMode) {
    case 'all':
      navigateToFolder(null);
      break;
    case 'recent':
      renderRecentView();
      break;
    case 'broken':
      renderBrokenView();
      break;
    case 'tags':
      renderTagsView();
      break;
    case 'folder':
      navigateToFolder(state.currentFolderId);
      break;
    default:
      navigateToFolder(null);
  }
}

/**
 * 设置左侧导航模式
 */
function setNavMode(mode) {
  state.currentNavMode = mode;
  state.searchTerm = '';
  if (searchManager) searchManager.clear();

  // 更新激活样式
  document.querySelectorAll('.sidebar-nav-item').forEach(el => el.classList.remove('active'));
  const navMap = { all: 'navAll', recent: 'navRecent', broken: 'navBroken', tags: 'navTags' };
  if (navMap[mode]) document.getElementById(navMap[mode])?.classList.add('active');

  // 清除侧栏文件夹激活状态（非 folder 模式）
  if (mode !== 'folder') {
    document.querySelectorAll('.sf-item-row.active').forEach(el => el.classList.remove('active'));
  }

  renderBookmarks();
}

/**
 * 渲染左侧文件夹树
 */
function renderSidebar() {
  if (!elements.sidebarTreeContent) return;
  const treeData = buildTreeData(state.bookmarks);
  const folders = treeData.filter(n => n.type === 'folder');
  elements.sidebarTreeContent.innerHTML = '';
  const ul = renderSidebarLevel(folders, 0);
  elements.sidebarTreeContent.appendChild(ul);
}

function renderSidebarLevel(nodes, depth) {
  const ul = document.createElement('ul');
  ul.className = 'sf-node';
  nodes.forEach(node => {
    if (node.type !== 'folder') return;
    const li = document.createElement('li');
    li.className = 'sf-item';
    li.dataset.id = node.id;
    li.dataset.type = 'folder';
    const childFolders = (node.children || []).filter(c => c.type === 'folder');
    const isExpanded = state.expandedSidebarFolders.has(node.id);
    const indent = depth * 12;

    const row = document.createElement('div');
    row.className = 'sf-item-row' + (state.currentFolderId === node.id && state.currentNavMode === 'folder' ? ' active' : '');
    row.style.paddingLeft = `${8 + indent}px`;

    if (childFolders.length > 0) {
      const toggle = document.createElement('span');
      toggle.className = 'sf-toggle' + (isExpanded ? ' open' : '');
      toggle.innerHTML = isExpanded ? '▼' : '▶';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isExpanded) state.expandedSidebarFolders.delete(node.id);
        else state.expandedSidebarFolders.add(node.id);
        renderSidebar();
      });
      row.appendChild(toggle);
    } else {
      const sp = document.createElement('span');
      sp.className = 'sf-toggle-spacer';
      row.appendChild(sp);
    }

    const icon = document.createElement('span');
    icon.className = 'sf-icon';
    icon.textContent = '📁';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'sf-label';
    label.textContent = node.title || '未命名';
    row.appendChild(label);

    const bmCount = countBookmarksInFolder(node);
    if (bmCount > 0) {
      const badge = document.createElement('span');
      badge.className = 'sf-badge';
      badge.textContent = bmCount;
      row.appendChild(badge);
    }

    row.addEventListener('click', () => {
      state.currentNavMode = 'folder';
      navigateToFolder(node.id);
    });

    // 右键菜单
    row.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      state.selectedItem = node;
      showContextMenu(node, e.clientX, e.clientY, { source: 'sidebar' });
    });

    li.appendChild(row);

    // 在 row 上添加拖拽事件监听（更精确的控制）
    row.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止冒泡到父元素
      e.dataTransfer.dropEffect = 'move';
      row.classList.add('drag-over');
      li.classList.add('drag-over');
    });

    row.addEventListener('dragleave', (e) => {
      e.stopPropagation(); // 阻止冒泡到父元素

      // 使用 relatedTarget 更准确地判断是否真正离开元素
      if (!e.relatedTarget || !row.contains(e.relatedTarget)) {
        row.classList.remove('drag-over');
        li.classList.remove('drag-over');
      }
    });

    row.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation(); // 阻止冒泡到父元素
      row.classList.remove('drag-over');
      li.classList.remove('drag-over');

      const dragData = e.dataTransfer.getData('text/plain');
      if (!dragData) return;

      try {
        const { type, id, data } = JSON.parse(dragData);
        await handleMoveToFolder(id, node.id);
      } catch (err) {
        console.error('Drop error:', err);
      }
    });

    if (childFolders.length > 0 && isExpanded) {
      const children = renderSidebarLevel(childFolders, depth + 1);
      children.className += ' sf-children';
      li.appendChild(children);
    }

    ul.appendChild(li);
  });
  return ul;
}

function countBookmarksInFolder(node) {
  let count = 0;
  (node.children || []).forEach(c => {
    if (c.type === 'bookmark') count++;
    else if (c.type === 'folder') count += countBookmarksInFolder(c);
  });
  return count;
}

/**
 * 导航到指定文件夹（null = 根）
 */
function navigateToFolder(folderId) {
  state.currentFolderId = folderId;
  if (folderId !== null) state.currentNavMode = 'folder';

  // 更新侧栏激活
  document.querySelectorAll('.sf-item-row').forEach(el => el.classList.remove('active'));
  if (folderId) {
    const allRows = elements.sidebarTreeContent?.querySelectorAll('.sf-item-row');
    allRows?.forEach(row => {
      const li = row.closest('.sf-item');
      if (li) {
        // 用 data 无法直接获取 id，通过 label 匹配比较难，改为重新渲染侧栏
      }
    });
    // 重新渲染侧栏使激活状态正确
    renderSidebar();
  }

  // 构建面包屑
  buildBreadcrumb(folderId);

  // 渲染右侧内容
  renderContentArea(folderId);
}

/**
 * 构建面包屑路径
 */
function buildBreadcrumb(folderId) {
  state.breadcrumb = [];
  if (folderId === null) {
    state.breadcrumb = [{ id: null, title: '收藏夹' }];
  } else {
    // 向上查找路径
    const catMap = new Map();
    state.categories.forEach(c => catMap.set(c.id, c));
    const path = [];
    let cur = catMap.get(folderId);
    while (cur) {
      path.unshift({ id: cur.id, title: cur.name });
      cur = cur.parentId ? catMap.get(cur.parentId) : null;
    }
    state.breadcrumb = [{ id: null, title: '收藏夹' }, ...path];
  }
  renderBreadcrumb();
}

function renderBreadcrumb() {
  if (!elements.breadcrumb) return;
  elements.breadcrumb.innerHTML = '';
  state.breadcrumb.forEach((item, idx) => {
    const el = document.createElement('span');
    el.className = 'bc-item' + (idx === state.breadcrumb.length - 1 ? ' current' : '');
    el.textContent = item.title;
    el.title = item.title;
    if (idx < state.breadcrumb.length - 1) {
      el.addEventListener('click', () => navigateToFolder(item.id));
    }
    elements.breadcrumb.appendChild(el);
    if (idx < state.breadcrumb.length - 1) {
      const sep = document.createElement('span');
      sep.className = 'bc-sep';
      sep.textContent = '›';
      elements.breadcrumb.appendChild(sep);
    }
  });
}

/**
 * 渲染右侧内容区域（子文件夹 + 书签）
 */
function renderContentArea(folderId) {
  const container = elements.bookmarkList;
  container.innerHTML = '';

  const treeData = buildTreeData(state.bookmarks);
  let currentNode = null;
  let children = [];

  if (folderId === null) {
    children = treeData;
  } else {
    currentNode = findNodeById(treeData, folderId);
    children = currentNode ? (currentNode.children || []) : [];
  }

  let subFolders = children.filter(n => n.type === 'folder');
  let bookmarks = children.filter(n => n.type === 'bookmark');

  // 按 sortOrder 排序
  subFolders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  bookmarks.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

  const total = bookmarks.length + subFolders.length;

  // 更新文件夹统计
  if (elements.folderStats) {
    elements.folderStats.textContent = total > 0 ? `${total} 项` : '';
  }

  if (total === 0 && folderId !== null) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📂</div><h3>文件夹为空</h3><p>点击左侧其他文件夹浏览内容</p></div>`;
    return;
  }
  if (total === 0) {
    showEmptyState();
    return;
  }

  const list = document.createElement('div');
  list.className = 'bm-list';

  // 渲染子文件夹
  if (subFolders.length > 0) {
    const secHeader = document.createElement('div');
    secHeader.className = 'bm-section-header';
    secHeader.textContent = '文件夹';
    list.appendChild(secHeader);

    subFolders.forEach(folder => {
      const row = createFolderRow(folder);
      list.appendChild(row);
    });
  }

  // 渲染书签
  if (bookmarks.length > 0) {
    if (subFolders.length > 0) {
      const secHeader = document.createElement('div');
      secHeader.className = 'bm-section-header';
      secHeader.textContent = '收藏';
      list.appendChild(secHeader);
    }
    bookmarks.forEach(bm => {
      const row = createBookmarkRow(bm);
      list.appendChild(row);
    });
  }

  container.appendChild(list);
}

function findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * 创建文件夹行
 */
function createFolderRow(folder) {
  const row = document.createElement('div');
  row.className = 'bm-folder-row';
  row.dataset.id = folder.id;
  row.dataset.type = 'folder';
  row.draggable = true; // 启用拖拽

  const bmCount = countBookmarksInFolder(folder);
  const subFolderCount = (folder.children || []).filter(c => c.type === 'folder').length;
  let metaText = '';
  if (bmCount > 0) metaText += `${bmCount} 个收藏`;
  if (subFolderCount > 0) metaText += (metaText ? '  ' : '') + `${subFolderCount} 个子文件夹`;

  row.innerHTML = `
    <span class="bm-folder-icon">📁</span>
    <span class="bm-folder-name">${escapeHtml(folder.title || '未命名')}</span>
    ${metaText ? `<span class="bm-folder-meta">${escapeHtml(metaText)}</span>` : ''}
    <button class="bm-menu-btn bm-folder-menu" data-id="${escapeHtml(folder.id)}" title="更多操作">⋮</button>
  `;

  row.addEventListener('click', (e) => {
    if (e.target.closest('.bm-menu-btn')) return;
    navigateToFolder(folder.id);
  });

  row.querySelector('.bm-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedItem = folder;
    showContextMenu(folder, e.clientX, e.clientY);
  });

  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.selectedItem = folder;
    showContextMenu(folder, e.clientX, e.clientY);
  });

  // 拖拽开始
  row.addEventListener('dragstart', (e) => {
    state.draggedItem = folder;
    state.draggedElement = row;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'folder',
      id: folder.id,
      data: folder
    }));
    e.dataTransfer.setDragImage(row, e.offsetX, e.offsetY);
    row.classList.add('dragging');
    row.style.opacity = '0.5';
  });

  // 拖拽结束
  row.addEventListener('dragend', (e) => {
    row.classList.remove('dragging');
    row.style.opacity = '1';
    row.style.transform = '';
    state.draggedItem = null;
    state.draggedElement = null;

    // 清除所有拖拽悬停样式
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  });

  return row;
}

/**
 * 创建书签行（新样式：带 favicon、标题、摘要、标签）
 */
function createBookmarkRow(bm) {
  const isBroken = bm.status === 'broken';
  const isUncertain = bm.checkStatus === 'uncertain';

  const row = document.createElement('div');
  row.className = 'bm-row' + (isBroken ? ' broken-row' : '');
  row.dataset.id = bm.id;
  row.dataset.type = 'bookmark';
  row.draggable = true; // 启用拖拽

  // favicon
  let faviconHtml = '';
  if (bm.url) {
    try {
      const domain = new URL(bm.url).hostname;
      faviconHtml = `<img class="bm-favicon" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" alt=""><span class="bm-favicon-fallback" style="display:none;">🔖</span>`;
    } catch {
      faviconHtml = `<span class="bm-favicon-fallback">🔖</span>`;
    }
  } else {
    faviconHtml = `<span class="bm-favicon-fallback">📁</span>`;
  }

  // 状态徽标
  let statusBadge = '';
  if (isBroken) statusBadge = `<span class="bm-status-badge broken">失效</span>`;
  else if (isUncertain) statusBadge = `<span class="bm-status-badge uncertain">不确定</span>`;

  // 标签
  const tagsHtml = (bm.tags || []).slice(0, 5).map(t => `<span class="bm-tag">${escapeHtml(t)}</span>`).join('');

  // 域名
  let domainHtml = '';
  if (bm.url) {
    try { domainHtml = `<span class="bm-domain">${new URL(bm.url).hostname}</span>`; } catch {}
  }

  // 摘要（支持 description / summary 两个字段）
  const descText = bm.description || bm.summary || '';
  const descHtml = descText ? `<div class="bm-desc">${escapeHtml(descText)}</div>` : '';

  row.innerHTML = `
    ${faviconHtml}
    <div class="bm-content">
      <div class="bm-title-row">
        <span class="bm-title" title="${escapeHtml(bm.url || '')}">${escapeHtml(bm.title || '未命名')}</span>
        ${statusBadge}
      </div>
      ${descHtml}
      <div class="bm-meta-row">
        ${tagsHtml}
        ${domainHtml}
      </div>
    </div>
    <div class="bm-actions">
      <button class="bm-menu-btn" title="更多操作">⋮</button>
    </div>
  `;

  // 标题点击 → 打开链接
  row.querySelector('.bm-title')?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (bm.url) chrome.tabs.create({ url: bm.url });
  });

  // 三点菜单
  row.querySelector('.bm-menu-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    state.selectedItem = bm;
    showContextMenu(bm, e.clientX, e.clientY);
  });

  // 右键
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    state.selectedItem = bm;
    showContextMenu(bm, e.clientX, e.clientY);
  });

  // 拖拽开始
  row.addEventListener('dragstart', (e) => {
    state.draggedItem = bm;
    state.draggedElement = row; // 保存拖拽元素的引用
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', JSON.stringify({
      type: 'bookmark',
      id: bm.id,
      data: bm
    }));

    // 设置拖拽时的影像（使用当前元素）
    e.dataTransfer.setDragImage(row, e.offsetX, e.offsetY);

    // 添加拖拽样式
    row.classList.add('dragging');
    row.style.opacity = '0.5';
    row.style.transform = 'scale(0.98)';
  });

  // 拖拽结束
  row.addEventListener('dragend', (e) => {
    // 移除拖拽样式
    row.classList.remove('dragging');
    row.style.opacity = '';

    state.draggedItem = null;
    state.draggedElement = null;

    // 清除所有拖拽高亮
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    // 清除所有占位符
    document.querySelectorAll('.drag-placeholder').forEach(el => {
      el.remove();
    });
  });

  // 拖拽悬停（用于显示放置指示器）
  row.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡
    e.dataTransfer.dropEffect = 'move';

    // 不允许拖拽到自己上面
    if (state.draggedItem && state.draggedItem.id === bm.id) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    // 添加高亮
    row.classList.add('drag-over');

    // 显示插入位置的占位符
    showInsertPlaceholder(row, e.clientY);
  });

  // 拖拽离开
  row.addEventListener('dragleave', (e) => {
    e.stopPropagation(); // 阻止冒泡

    // 使用 relatedTarget 更准确地判断是否真正离开元素
    if (!e.relatedTarget || !row.contains(e.relatedTarget)) {
      row.classList.remove('drag-over');
      removeInsertPlaceholder();
    }
  });

  // 放置（在书签之间排序）
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation(); // 阻止冒泡
    row.classList.remove('drag-over');
    removeInsertPlaceholder();

    if (!state.draggedItem || state.draggedItem.id === bm.id) {
      return;
    }

    // 处理重新排序
    await handleReorderBookmark(state.draggedItem.id, bm.id, e.clientY);
  });

  return row;
}

/**
 * 渲染最近添加视图
 */
function renderRecentView() {
  buildBreadcrumb(null);
  if (elements.breadcrumb) {
    elements.breadcrumb.innerHTML = '<span class="bc-item current">🕐 最近添加</span>';
  }

  const recent = [...state.bookmarks]
    .filter(b => b.dateAdded || b.createdAt)
    .sort((a, b) => (b.dateAdded || b.createdAt || 0) - (a.dateAdded || a.createdAt || 0))
    .slice(0, 50);

  const container = elements.bookmarkList;
  container.innerHTML = '';
  if (recent.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🕐</div><h3>暂无最近收藏</h3></div>`;
    return;
  }
  const list = document.createElement('div');
  list.className = 'bm-list';
  recent.forEach(bm => list.appendChild(createBookmarkRow(bm)));
  container.appendChild(list);
  if (elements.folderStats) elements.folderStats.textContent = `${recent.length} 项`;
}

/**
 * 渲染失效链接视图
 */
function renderBrokenView() {
  buildBreadcrumb(null);
  if (elements.breadcrumb) {
    elements.breadcrumb.innerHTML = '<span class="bc-item current">⚠️ 失效链接</span>';
  }

  const broken = state.bookmarks.filter(b => b.status === 'broken');
  const uncertain = state.bookmarks.filter(b => b.checkStatus === 'uncertain');
  const container = elements.bookmarkList;
  container.innerHTML = '';
  if (broken.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">✅</div><h3>暂无失效链接</h3><p>所有收藏链接均正常</p></div>`;
    return;
  }

  // 添加批量删除按钮
  const header = document.createElement('div');
  header.className = 'broken-view-header';
  header.style.cssText = 'padding: 12px 16px; background: #fef2f2; border-bottom: 1px solid #fecaca; display: flex; align-items: center; justify-content: space-between;';
  header.innerHTML = `
    <div>
      <span style="color: #991b1b; font-size: 13px;">发现 ${broken.length} 个失效链接</span>
      ${uncertain.length > 0 ? `<span style="color: #f59e0b; font-size: 11px; margin-left: 12px;">（另有 ${uncertain.length} 个不确定的书签未被包含）</span>` : ''}
    </div>
    <button class="btn btn-primary" id="cleanupAllBrokenBtn" style="background: #dc2626; border-color: #dc2626; padding: 6px 12px; font-size: 13px;">🗑️ 一键清理全部失效</button>
  `;
  container.appendChild(header);

  const list = document.createElement('div');
  list.className = 'bm-list';
  broken.forEach(bm => list.appendChild(createBookmarkRow(bm)));
  container.appendChild(list);
  if (elements.folderStats) elements.folderStats.textContent = `${broken.length} 项`;

  // 绑定批量删除按钮事件
  const cleanupBtn = document.getElementById('cleanupAllBrokenBtn');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', () => {
      cleanupBrokenLinks(broken);
    });
  }
}

/**
 * 渲染标签视图
 */
function renderTagsView() {
  buildBreadcrumb(null);
  if (elements.breadcrumb) {
    elements.breadcrumb.innerHTML = '<span class="bc-item current">🏷️ 标签视图</span>';
  }

  const container = elements.bookmarkList;
  container.innerHTML = '';

  // 统计所有标签
  const tagMap = new Map();
  state.bookmarks.forEach(bm => {
    (bm.tags || []).forEach(tag => {
      if (!tagMap.has(tag)) tagMap.set(tag, []);
      tagMap.get(tag).push(bm);
    });
  });

  if (tagMap.size === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🏷️</div><h3>暂无标签</h3><p>为收藏添加标签以便更好地组织</p></div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'tags-grid';

  [...tagMap.entries()].sort((a, b) => b[1].length - a[1].length).forEach(([tag, bms]) => {
    const chip = document.createElement('button');
    chip.className = 'tag-chip';
    chip.innerHTML = `<span>${escapeHtml(tag)}</span><span class="tag-chip-count">${bms.length}</span>`;
    chip.addEventListener('click', () => {
      // 显示该标签下的所有书签
      if (elements.breadcrumb) {
        elements.breadcrumb.innerHTML = `<span class="bc-item" style="cursor:pointer;" id="bcTagBack">🏷️ 标签视图</span><span class="bc-sep">›</span><span class="bc-item current">${escapeHtml(tag)}</span>`;
        document.getElementById('bcTagBack')?.addEventListener('click', () => setNavMode('tags'));
      }
      container.innerHTML = '';
      const list = document.createElement('div');
      list.className = 'bm-list';
      bms.forEach(bm => list.appendChild(createBookmarkRow(bm)));
      container.appendChild(list);
      if (elements.folderStats) elements.folderStats.textContent = `${bms.length} 项`;
    });
    grid.appendChild(chip);
  });

  container.appendChild(grid);
  if (elements.folderStats) elements.folderStats.textContent = `${tagMap.size} 个标签`;
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
 * 渲染分类视图
 */
function renderCategories() {
  if (!state.categories || state.categories.length === 0) {
    renderContentArea(state.currentFolderId);
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
      state.searchTerm = '';
      state.currentNavMode = 'tags';
      const list = document.createElement('div');
      list.className = 'bm-list';
      tagBookmarks.forEach(bm => list.appendChild(createBookmarkRow(bm)));
      elements.bookmarkList.innerHTML = '';
      elements.bookmarkList.appendChild(list);
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
  // 搜索（debounce 150ms）
  let searchDebounce = null;
  elements.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      state.searchTerm = e.target.value;
      searchManager.search(e.target.value, state.bookmarks);
    }, 150);
  });

  // 左侧固定导航项
  document.getElementById('navAll').addEventListener('click', () => setNavMode('all'));
  document.getElementById('navRecent').addEventListener('click', () => setNavMode('recent'));
  document.getElementById('navBroken').addEventListener('click', () => setNavMode('broken'));
  document.getElementById('navTags').addEventListener('click', () => setNavMode('tags'));

  // 任务面板折叠/展开（点击标题栏）
  document.getElementById('taskPanelHeader').addEventListener('click', toggleTaskPanel);

  // 分析
  elements.analyzeBtn.addEventListener('click', handleAnalyze);
  elements.mergeSuggestBtn.addEventListener('click', handleMergeSuggestions);
  elements.deduplicateBtn.addEventListener('click', handleDeduplicate);
  elements.debugAnalyzeBtn.addEventListener('click', handleDebugAnalyze);
  elements.checkBrokenBtn.addEventListener('click', handleCheckBrokenLinks);

  // 工具栏
  elements.syncBtn.addEventListener('click', handleSync);
  elements.exportBtn.addEventListener('click', handleExport);
  elements.importBtn.addEventListener('click', handleImport);
  elements.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());

  // 取消分析（任务面板内）
  if (elements.cancelAnalyzeBtn) {
    elements.cancelAnalyzeBtn.addEventListener('click', async () => {
      elements.cancelAnalyzeBtn.disabled = true;
      elements.cancelAnalyzeBtn.textContent = '正在取消...';
      await chrome.runtime.sendMessage({ type: 'CANCEL_ANALYSIS' }).catch(() => {});
    });
  }

  // 点击其他地方关闭上下文菜单
  // 注意：contextMenuManager 模块已经处理了点击外部关闭菜单的逻辑
  document.addEventListener('click', (e) => {
    if (!elements.contextMenuEl.contains(e.target)) {
      hideContextMenu();
    }
  });
}

/**
 * 关闭编辑对话框
 */
function closeEditDialog() {
  const dialog = elements.editDialog;
  if (dialog && dialog.style.display !== 'none') {
    dialog.style.display = 'none';
    // 恢复之前的焦点
    const previousFocusSelector = dialog.dataset.previousFocus;
    if (previousFocusSelector) {
      try {
        // 尝试通过 id 查找
        let previousFocus = document.getElementById(previousFocusSelector);
        // 如果没找到，尝试通过选择器查找
        if (!previousFocus) {
          previousFocus = document.querySelector(previousFocusSelector);
        }
        previousFocus?.focus();
      } catch (e) {
        // 焦点恢复失败不是关键错误，忽略
      }
    }
    // 清除表单错误
    FormValidator.clearFormErrors(dialog);
  }
}

// FormValidator.showFieldError 和 FormValidator.clearFormErrors 已移至 utils/form-validator.js
// isValidUrl() 已移至 utils/helpers.js（功能完全相同）

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
  showContextMenu(item, event.clientX, event.clientY);
}

/**
 * 处理右键菜单操作
 */
function handleContextMenuAction(action) {
  const item = state.selectedItem;
  if (!item) return;

  switch (action) {
    case 'open':
      if (item.url) chrome.tabs.create({ url: item.url });
      break;

    case 'openIncognito':
      if (item.url) chrome.windows.create({ url: item.url, incognito: true });
      break;

    case 'openNewWindow':
      if (item.url) chrome.windows.create({ url: item.url });
      break;

    case 'edit':
      showEditDialog(item);
      break;

    case 'copy':
      if (item.url) {
        navigator.clipboard.writeText(item.url).then(() => {
          Toast.success('链接已复制到剪贴板');
        }).catch(() => Toast.error('复制失败'));
      }
      break;

    case 'cut':
      state.clipboardItem = { ...item, _clipAction: 'cut' };
      Toast.info('已剪切，可粘贴到目标文件夹');
      break;

    case 'paste':
      if (state.clipboardItem) {
        Toast.info('粘贴功能开发中');
      } else {
        Toast.warning('剪贴板为空');
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

    case 'regenerateSummary':
      regenerateSummary(item);
      break;

    case 'delete':
      if (item.type === 'folder') {
        deleteFolder(item);
      } else {
        deleteBookmark(item);
      }
      break;

    case 'openFolder':
      if (item.type === 'folder') navigateToFolder(item.id);
      break;

    case 'mergeFolder':
      if (item.type === 'folder') showMergeFolderDialog(item);
      break;

    case 'addSubFolder':
      if (item.type === 'folder') showAddSubFolderDialog(item);
      break;

    case 'renameFolder':
      if (item.type === 'folder') showRenameFolderDialog(item);
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
 * 移动书签到指定文件夹
 */
async function handleMoveToFolder(bookmarkId, targetFolderId) {
  try {
    // 不允许移动到自身
    if (bookmarkId === targetFolderId) {
      Toast.warning('不能移动到自身');
      return;
    }

    // 移动书签
    const response = await chrome.runtime.sendMessage({
      type: 'MOVE_BOOKMARK',
      bookmarkId: bookmarkId,
      targetFolderId: targetFolderId
    });

    if (response.success) {
      Toast.success('移动成功');
      await loadBookmarks();
    } else {
      throw new Error(response.error || '移动失败');
    }
  } catch (error) {
    console.error('Move error:', error);
    Toast.error('移动失败：' + error.message);
  }
}

/**
 * 处理拖拽放置到文件夹
 */
async function handleTreeDrop(dragData, targetFolder) {
  try {
    const { type, id, data } = dragData;

    // 不允许拖拽到自己或自己的子文件夹中
    if (id === targetFolder.id) {
      Toast.warning('不能移动到自身');
      return;
    }

    // 检查是否是父文件夹
    const isParent = await checkIsParentFolder(id, targetFolder.id);
    if (isParent) {
      Toast.warning('不能移动到自己的子文件夹');
      return;
    }

    // 移动书签/文件夹
    await handleMoveToFolder(id, targetFolder.id);
  } catch (error) {
    console.error('Drop error:', error);
    Toast.error('移动失败：' + error.message);
  }
}

/**
 * 检查是否是父文件夹（避免循环）
 */
async function checkIsParentFolder(parentId, childId) {
  // 获取所有分类
  const categories = state.categories;
  const childCategory = categories.find(c => c.id === childId);

  if (!childCategory) return false;

  // 递归检查父级
  let currentCategory = childCategory;
  while (currentCategory && currentCategory.parentId) {
    if (currentCategory.parentId === parentId) {
      return true;
    }
    currentCategory = categories.find(c => c.id === currentCategory.parentId);
  }

  return false;
}

/**
 * 处理去重功能
 * 检测重复的书签和目录，优先保留书签栏中的内容
 */
async function handleDeduplicate() {
  if (state.bookmarks.length === 0 && state.categories.length === 0) {
    Toast.info('暂无数据，无需去重');
    return;
  }

  Toast.info('正在检测重复项...');

  try {
    const duplicates = {
      bookmarks: findDuplicateBookmarks(),
      categories: findDuplicateCategories()
    };

    if (duplicates.bookmarks.length === 0 && duplicates.categories.length === 0) {
      Toast.info('未检测到重复项');
      return;
    }

    showDeduplicateDialog(duplicates);
  } catch (error) {
    console.error('Deduplicate error:', error);
    Toast.error('去重检测失败：' + error.message);
  }
}

/**
 * 查找重复的书签（相同URL）
 * 优先保留书签栏中的书签
 */
function findDuplicateBookmarks() {
  const urlMap = new Map();
  const duplicates = [];

  for (const bookmark of state.bookmarks) {
    if (!bookmark.url) continue;

    const normalizedUrl = normalizeUrl(bookmark.url);

    if (!urlMap.has(normalizedUrl)) {
      urlMap.set(normalizedUrl, []);
    }
    urlMap.get(normalizedUrl).push(bookmark);
  }

  // 找出有重复的URL
  for (const [url, bookmarkList] of urlMap) {
    if (bookmarkList.length > 1) {
      // 按优先级排序：书签栏 > 其他
      bookmarkList.sort((a, b) => {
        const aInBookmarksBar = isInBookmarksBar(a);
        const bInBookmarksBar = isInBookmarksBar(b);
        if (aInBookmarksBar && !bInBookmarksBar) return -1;
        if (!aInBookmarksBar && bInBookmarksBar) return 1;
        return 0;
      });

      const keep = bookmarkList[0]; // 保留第一个（优先级最高的）
      const remove = bookmarkList.slice(1); // 删除其余的

      duplicates.push({
        type: 'bookmark',
        url: url,
        keep: keep,
        remove: remove,
        reason: remove.length > 0 ? `重复URL，保留书签栏中的书签` : `重复书签`
      });
    }
  }

  return duplicates;
}

/**
 * 查找重复的目录
 * 优先保留书签栏中的目录
 */
function findDuplicateCategories() {
  const nameMap = new Map();
  const duplicates = [];

  for (const category of state.categories) {
    if (!nameMap.has(category.name)) {
      nameMap.set(category.name, []);
    }
    nameMap.get(category.name).push(category);
  }

  // 找出有重复名称的目录
  for (const [name, categoryList] of nameMap) {
    if (categoryList.length > 1) {
      // 按优先级排序：书签栏 > 其他
      categoryList.sort((a, b) => {
        const aInBookmarksBar = isInBookmarksBar(a);
        const bInBookmarksBar = isInBookmarksBar(b);
        if (aInBookmarksBar && !bInBookmarksBar) return -1;
        if (!aInBookmarksBar && bInBookmarksBar) return 1;
        return 0;
      });

      const keep = categoryList[0];
      const remove = categoryList.slice(1);

      duplicates.push({
        type: 'category',
        name: name,
        keep: keep,
        remove: remove,
        reason: `重复目录名称，保留书签栏中的目录`
      });
    }
  }

  return duplicates;
}

// normalizeUrl() 已移至 utils/helpers.js（功能完全相同）
// isInBookmarksBar() 已移至 utils/helpers.js（功能完全相同）

/**
 * 显示去重对话框
 */
function showDeduplicateDialog(duplicates) {
  const bookmarkCount = duplicates.bookmarks.length;
  const categoryCount = duplicates.categories.length;
  const totalRemove = duplicates.bookmarks.reduce((sum, d) => sum + d.remove.length, 0) +
                     duplicates.categories.reduce((sum, d) => sum + d.remove.length, 0);

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width: 700px;">
      <div class="dialog-header">
        <h2>🗑️ 去重建议</h2>
        <button class="dialog-close" id="dialogClose" aria-label="关闭">&times;</button>
      </div>
      <div class="dialog-content">
        <p style="margin-bottom: 16px; color: var(--c-text-2);">
          检测到 <strong>${bookmarkCount}</strong> 组重复书签，<strong>${categoryCount}</strong> 组重复目录。
          共可删除 <strong>${totalRemove}</strong> 项。
        </p>

        ${duplicates.bookmarks.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 14px; font-weight: 600; color: var(--c-text); margin-bottom: 10px;">重复书签</h3>
            <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--c-border); border-radius: 8px; padding: 8px;">
              ${duplicates.bookmarks.map((item, index) => `
                <div class="dedup-item" data-type="bookmark" data-index="${index}" style="padding: 10px; border: 1px solid var(--c-border); border-radius: 6px; margin-bottom: 8px; background: var(--c-bg-alt);">
                  <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <input type="checkbox" checked style="flex-shrink: 0; margin-top: 2px;" />
                    <div style="flex: 1; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #10b981; font-size: 13px;">✓ 保留</span>
                        <span style="font-weight: 600; color: var(--c-text); font-size: 13px;">${escapeHtml(item.keep.title)}</span>
                        ${isInBookmarksBar(item.keep) ? '<span style="font-size: 10px; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">书签栏</span>' : ''}
                      </div>
                      <div style="font-size: 11px; color: var(--c-muted); margin-bottom: 6px;">${escapeHtml(truncateUrl(item.keep.url, 50))}</div>
                      <div style="font-size: 11px; color: var(--c-text-2);">删除 ${item.remove.length} 个重复：</div>
                      ${item.remove.map(r => `
                        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: var(--c-muted);">
                          <span style="color: #ef4444;">✗</span>
                          <span style="text-decoration: line-through;">${escapeHtml(r.title)}</span>
                          ${isInBookmarksBar(r) ? '<span style="font-size: 10px; background: #fef2f2; color: #991b1b; padding: 2px 6px; border-radius: 4px;">书签栏</span>' : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${duplicates.categories.length > 0 ? `
          <div style="margin-bottom: 20px;">
            <h3 style="font-size: 14px; font-weight: 600; color: var(--c-text); margin-bottom: 10px;">重复目录</h3>
            <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--c-border); border-radius: 8px; padding: 8px;">
              ${duplicates.categories.map((item, index) => `
                <div class="dedup-item" data-type="category" data-index="${index}" style="padding: 10px; border: 1px solid var(--c-border); border-radius: 6px; margin-bottom: 8px; background: var(--c-bg-alt);">
                  <div style="display: flex; align-items: flex-start; gap: 10px;">
                    <input type="checkbox" checked style="flex-shrink: 0; margin-top: 2px;" />
                    <div style="flex: 1; min-width: 0;">
                      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-weight: 600; color: #10b981; font-size: 13px;">✓ 保留</span>
                        <span style="font-weight: 600; color: var(--c-text); font-size: 13px;">📁 ${escapeHtml(item.keep.name)}</span>
                        ${isInBookmarksBar(item.keep) ? '<span style="font-size: 10px; background: #dcfce7; color: #166534; padding: 2px 6px; border-radius: 4px;">书签栏</span>' : ''}
                      </div>
                      <div style="font-size: 11px; color: var(--c-text-2);">删除 ${item.remove.length} 个重复目录：</div>
                      ${item.remove.map(r => `
                        <div style="display: flex; align-items: center; gap: 6px; padding: 4px 0; font-size: 12px; color: var(--c-muted);">
                          <span style="color: #ef4444;">✗</span>
                          <span style="text-decoration: line-through;">📁 ${escapeHtml(r.name)}</span>
                          ${isInBookmarksBar(r) ? '<span style="font-size: 10px; background: #fef2f2; color: #991b1b; padding: 2px 6px; border-radius: 4px;">书签栏</span>' : ''}
                        </div>
                      `).join('')}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div style="padding: 12px; background: #fef3c7; border-radius: 6px; font-size: 12px; color: #92400e;">
          ⚠️ 去重操作将永久删除选中的项目，请确认后再执行。书签栏中的内容具有更高的保留优先级。
        </div>
      </div>
      <div class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 10px;">
          <button class="btn" id="dialogSelectAll" style="padding: 6px 12px; font-size: 13px;">全选</button>
          <button class="btn" id="dialogDeselectAll" style="padding: 6px 12px; font-size: 13px;">取消全选</button>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-cancel" id="dialogCancel">取消</button>
          <button class="btn btn-primary" id="dialogConfirm">执行去重</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector('#dialogClose');
  const cancelBtn = dialog.querySelector('#dialogCancel');
  const confirmBtn = dialog.querySelector('#dialogConfirm');
  const selectAllBtn = dialog.querySelector('#dialogSelectAll');
  const deselectAllBtn = dialog.querySelector('#dialogDeselectAll');

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }, 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  selectAllBtn.addEventListener('click', () => {
    dialog.querySelectorAll('.dedup-item input[type="checkbox"]').forEach(cb => cb.checked = true);
  });

  deselectAllBtn.addEventListener('click', () => {
    dialog.querySelectorAll('.dedup-item input[type="checkbox"]').forEach(cb => cb.checked = false);
  });

  confirmBtn.addEventListener('click', async () => {
    const selectedItems = {
      bookmarks: [],
      categories: []
    };

    dialog.querySelectorAll('.dedup-item input[type="checkbox"]:checked').forEach(cb => {
      const item = cb.closest('.dedup-item');
      const type = item.dataset.type;
      const index = parseInt(item.dataset.index);

      if (type === 'bookmark') {
        selectedItems.bookmarks.push(duplicates.bookmarks[index]);
      } else if (type === 'category') {
        selectedItems.categories.push(duplicates.categories[index]);
      }
    });

    if (selectedItems.bookmarks.length === 0 && selectedItems.categories.length === 0) {
      Toast.warning('请至少选择一项');
      return;
    }

    await executeDeduplicate(selectedItems, closeDialog);
  });

  setTimeout(() => dialog.classList.add('show'), 10);
}

/**
 * 执行去重操作
 */
async function executeDeduplicate(selectedItems, closeDialog) {
  try {
    const toRemove = {
      bookmarkIds: [],
      categoryIds: []
    };

    // 收集需要删除的项
    for (const item of selectedItems.bookmarks) {
      for (const bookmark of item.remove) {
        toRemove.bookmarkIds.push(bookmark.id);
      }
    }

    for (const item of selectedItems.categories) {
      for (const category of item.remove) {
        toRemove.categoryIds.push(category.id);
      }
    }

    // 调用后台删除
    const result = await chrome.runtime.sendMessage({
      type: 'BATCH_DELETE',
      bookmarkIds: toRemove.bookmarkIds,
      categoryIds: toRemove.categoryIds
    });

    if (result && result.success) {
      Toast.success(`已删除 ${toRemove.bookmarkIds.length} 个书签，${toRemove.categoryIds.length} 个目录`);
      closeDialog();
      // 刷新数据
      await loadBookmarks();
    } else {
      Toast.error('删除失败：' + (result?.error || '未知错误'));
    }
  } catch (error) {
    console.error('Execute deduplicate error:', error);
    Toast.error('执行去重失败：' + error.message);
  }
}

// truncateUrl() 已移至 utils/helpers.js（功能一致，支持类型检查）

/**
 * 处理合并建议
 * 检测重复分类并显示合并建议
 */
async function handleMergeSuggestions() {
  if (state.categories.length < 2) {
    Toast.info('分类数量不足，无需合并');
    return;
  }

  Toast.info('正在分析重复分类...');

  try {
    // 动态导入 CategoryMerger
    const { default: CategoryMerger } = await import('../utils/category-merger.js');
    const merger = new CategoryMerger();

    // 构建分类路径的辅助函数
    const buildCategoryPath = (category) => {
      const path = [category.name];
      let currentCat = category;

      // 向上遍历父分类
      while (currentCat.parentId) {
        const parentCat = state.categories.find(c => c.id === currentCat.parentId);
        if (!parentCat) break;
        path.unshift(parentCat.name);
        currentCat = parentCat;

        // 防止无限循环（最多10层）
        if (path.length > 10) break;
      }

      return path;
    };

    // 生成合并建议（带路径信息）
    const suggestions = merger.generateMergeSuggestions(state.categories, buildCategoryPath);

    if (suggestions.length === 0) {
      Toast.info('未检测到需要合并的重复分类');
      return;
    }

    // 显示合并建议对话框
    showMergeSuggestionsDialog(suggestions, state.categories);
  } catch (error) {
    console.error('Merge suggestions error:', error);
    Toast.error('生成合并建议失败：' + error.message);
  }
}

/**
 * 处理一键分析（检查是否有可续分析的会话）
 */
async function handleAnalyze() {
  if (state.isAnalyzing) {
    Toast.warning('正在分析中，请稍候...');
    return;
  }
  if (state.bookmarks.length === 0) {
    Toast.warning('请先导入收藏');
    return;
  }

  // 查询是否有未完成的分析会话
  let resumeSession = null;
  try {
    const res = await chrome.runtime.sendMessage({ type: 'GET_ANALYSIS_SESSION' });
    if (res?.session && !res.session.completed) {
      const currentIds = state.bookmarks.map(b => b.id).sort().join(',');
      const sessionIds = [...(res.session.bookmarkIds || [])].sort().join(',');
      const completedCount = res.session.completedBatches?.length ?? 0;
      if (currentIds === sessionIds && completedCount > 0) {
        resumeSession = res.session;
      }
    }
  } catch (_) {}

  if (resumeSession) {
    const completed = resumeSession.completedBatches?.length ?? 0;
    const total = resumeSession.totalBatches ?? 0;
    const sessionTime = new Date(resumeSession.startTime).toLocaleTimeString('zh-CN', {
      hour: '2-digit', minute: '2-digit'
    });
    showAnalysisResumeDialog({
      sessionTime,
      completedBatches: completed,
      totalBatches: total,
      bookmarkCount: state.bookmarks.length,
      lastError: resumeSession.lastError || null,
      onResume: () => startAnalysis(false),
      onRestart: async () => {
        await chrome.runtime.sendMessage({ type: 'CLEAR_ANALYSIS_SESSION' }).catch(() => {});
        startAnalysis(true);
      }
    });
  } else {
    startAnalysis(false);
  }
}

/**
 * 执行 AI 分析
 * @param {boolean} forceRestart - true 表示忽略缓存，重新全量分析
 */
async function startAnalysis(forceRestart) {
  state.isAnalyzing = true;
  elements.analyzeBtn.disabled = true;
  elements.analyzeBtn.textContent = '⏳ 分析中...';

  // 展开任务面板并显示分析进度区
  if (elements.analyzeProgressSection) {
    elements.analyzeProgressSection.style.display = '';
    if (elements.analyzeProgressCount) elements.analyzeProgressCount.textContent = '0/0';
    if (elements.analyzeProgressFill) elements.analyzeProgressFill.style.width = '0%';
  }
  if (elements.taskPanel && !state.taskPanelExpanded) {
    state.taskPanelExpanded = true;
    elements.taskPanel.classList.add('expanded'); elements.taskPanel.classList.remove('collapsed');
  }

  // 显示取消分析按钮
  if (elements.cancelAnalyzeBtn) {
    elements.cancelAnalyzeBtn.style.display = '';
    elements.cancelAnalyzeBtn.disabled = false;
    elements.cancelAnalyzeBtn.textContent = '✕ 取消分析';
    elements.cancelAnalyzeBtn.onclick = async () => {
      elements.cancelAnalyzeBtn.disabled = true;
      elements.cancelAnalyzeBtn.textContent = '正在取消...';
      await chrome.runtime.sendMessage({ type: 'CANCEL_ANALYSIS' }).catch(() => {});
    };
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'AI_ANALYZE',
      bookmarkIds: state.bookmarks.map(bm => bm.id),
      forceRestart
    });

    if (response?.error) {
      throw new Error(response.error);
    }
  } catch (error) {
    console.error('启动分析失败:', error);
    Toast.error(`启动分析失败: ${error.message}`);
    finishAnalysisUI();
  }
}

/** 清理分析中的 UI 状态 */
function finishAnalysisUI() {
  state.isAnalyzing = false;
  elements.analyzeBtn.disabled = false;
  elements.analyzeBtn.textContent = '🤖 分析';

  if (elements.analyzeProgressSection) {
    elements.analyzeProgressSection.style.display = 'none';
  }
  if (elements.cancelAnalyzeBtn) {
    elements.cancelAnalyzeBtn.style.display = 'none';
  }
  hideProgress();
}

/**
 * 显示分析结果确认对话框（聚焦整理方案）
 */
function showAnalysisConfirmDialog(analysisResult) {
  const { categories, tags, summary } = analysisResult;

  // bookmarkId → 书签对象
  const bookmarkMap = new Map();
  state.bookmarks.forEach(bm => bookmarkMap.set(String(bm.id), bm));

  const newCatCount = summary.newCategories.length;
  const uniqueTagNames = [...new Set(tags.map(t => t.name))];

  // 分类按书签数量降序排列
  const sortedCats = [...categories].sort((a, b) => b.bookmarkIds.length - a.bookmarkIds.length);
  const maxCount = sortedCats[0]?.bookmarkIds.length || 1;

  // 生成分类列表 HTML
  const catRows = sortedCats.map(cat => {
    const progressWidth = Math.round((cat.bookmarkIds.length / maxCount) * 100);
    const badgeClass = cat.isNew ? 'new' : 'existing';
    const badgeText = cat.isNew ? '新增' : '已有';

    const bookmarkItems = cat.bookmarkIds
      .map(id => bookmarkMap.get(String(id)))
      .filter(Boolean)
      .map(bm => `
        <div class="analysis-bookmark-item">
          <div class="analysis-bookmark-title">${escapeHtml(bm.title)}</div>
          <div class="analysis-bookmark-url">${escapeHtml(bm.url)}</div>
        </div>
      `).join('');

    return `
      <details class="analysis-category-item">
        <summary class="analysis-category-header">
          <span class="analysis-category-badge ${badgeClass}">${badgeText}</span>
          <span class="analysis-category-name">${escapeHtml(cat.name)}</span>
          <span class="analysis-category-count">${cat.bookmarkIds.length} 个</span>
          <div class="analysis-category-progress">
            <div class="analysis-category-progress-fill" style="width: ${progressWidth}%"></div>
          </div>
        </summary>
        <div class="analysis-bookmark-list">
          ${bookmarkItems || '<div class="analysis-empty-state">暂无书签</div>'}
        </div>
      </details>
    `;
  }).join('');

  // 生成标签部分 HTML
  const tagsSection = uniqueTagNames.length > 0 ? `
    <div class="analysis-tags-section">
      <details>
        <summary class="analysis-tags-header">
          <span class="analysis-tags-title">🏷 标签建议</span>
          <span class="analysis-tags-count">${uniqueTagNames.length} 个</span>
        </summary>
        <div class="analysis-tags-list">
          ${uniqueTagNames.map(name => `
            <span class="analysis-tag-item">${escapeHtml(name)}</span>
          `).join('')}
        </div>
      </details>
    </div>
  ` : '';

  // 生成对话框 HTML
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog analysis-dialog">
      <div class="dialog-header analysis-dialog-header">
        <h2>🤖 AI 整理建议</h2>
        <button class="dialog-close" id="dialogClose" aria-label="关闭">&times;</button>
      </div>
      <div class="dialog-content analysis-dialog-content">
        <!-- 概要指标 -->
        <div class="analysis-summary">
          <div class="analysis-summary-item">
            <div class="analysis-summary-value">${summary.totalBookmarks}</div>
            <div class="analysis-summary-label">个收藏</div>
          </div>
          <div class="analysis-summary-item">
            <div class="analysis-summary-value primary">${categories.length}</div>
            <div class="analysis-summary-label">
              个分类${newCatCount > 0 ? ` <span class="analysis-summary-highlight">(${newCatCount} 新增)</span>` : ''}
            </div>
          </div>
          <div class="analysis-summary-item">
            <div class="analysis-summary-value success">${uniqueTagNames.length}</div>
            <div class="analysis-summary-label">个标签建议</div>
          </div>
        </div>

        <!-- 分类方案 -->
        <div class="analysis-categories-header">📁 分类整理方案</div>
        <div class="analysis-categories-list">
          ${catRows || '<div class="analysis-empty-state">暂无分类建议</div>'}
        </div>

        ${tagsSection}
      </div>
      <div class="dialog-footer">
        <button class="btn btn-cancel" id="dialogCancel">取消</button>
        <button class="btn btn-primary" id="dialogConfirm">✓ 应用整理方案</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector('#dialogClose');
  const cancelBtn = dialog.querySelector('#dialogCancel');
  const confirmBtn = dialog.querySelector('#dialogConfirm');

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }, 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  confirmBtn.addEventListener('click', async () => {
    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '整理中...';
      const response = await chrome.runtime.sendMessage({
        type: 'APPLY_CATEGORIES',
        categories: analysisResult.categories,
        tags: analysisResult.tags || []
      });
      if (response.error) throw new Error(response.error);
      const tagCount = analysisResult.tags?.length || 0;
      Toast.success(`整理完成！已应用 ${analysisResult.categories.length} 个分类${tagCount > 0 ? `，${tagCount} 个标签` : ''}`);
      await loadBookmarks();
      closeDialog();
    } catch (error) {
      console.error('Failed to apply categories:', error);
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✓ 应用整理方案';
      Toast.error(`应用失败: ${error.message}`);
    }
  });

  // 注意：移除了点击遮罩关闭的功能，防止误关闭
  // 用户必须明确点击"取消"或"✓"按钮才能关闭

  setTimeout(() => dialog.classList.add('show'), 10);
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
  showDebugSelectDialog({
    bookmarks: state.bookmarks,
    onAnalyze: async (selectedIds) => {
      elements.debugAnalyzeBtn.disabled = true;
      elements.debugAnalyzeBtn.textContent = '⏳ 分析中...';
      showProgress('调试分析中...', 0, 0);

      try {
        const response = await chrome.runtime.sendMessage({
          type: 'AI_ANALYZE_DEBUG',
          bookmarkIds: selectedIds
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
  });
}

/**
 * 显示进度（适配新任务面板）
 */
function showProgress(message, current, total) {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  // 新任务面板 - 检测进度区
  if (elements.checkProgressSection) {
    elements.checkProgressSection.style.display = '';
    const msgEl = elements.checkProgressSection.querySelector('.task-progress-label');
    if (msgEl) msgEl.textContent = message || '检测中...';
    if (elements.checkProgressCount) elements.checkProgressCount.textContent = `${current}/${total}`;
    if (elements.checkProgressFill) elements.checkProgressFill.style.width = `${percentage}%`;
  }

  // 展开任务面板
  if (elements.taskPanel && !state.taskPanelExpanded) {
    state.taskPanelExpanded = true;
    elements.taskPanel.classList.add('expanded'); elements.taskPanel.classList.remove('collapsed');
  }

  // 兼容旧 progressSection（隐藏层，仍保留引用）
  const progressSection = document.getElementById('progressSection');
  const progressMessage = document.getElementById('progressMessage');
  const progressCount = document.getElementById('progressCount');
  const progressFill = document.getElementById('progressFill');
  if (progressSection) {
    if (progressMessage) progressMessage.textContent = message;
    if (progressCount) progressCount.textContent = `${current}/${total}`;
    if (progressFill) progressFill.style.width = `${percentage}%`;
  }
}

/**
 * 隐藏进度（适配新任务面板）
 */
function hideProgress() {
  // 新任务面板 - 隐藏检测进度区
  if (elements.checkProgressSection) {
    elements.checkProgressSection.style.display = 'none';
  }
  if (elements.checkProgressFill) {
    elements.checkProgressFill.style.width = '0%';
  }
  if (elements.checkProgressCount) elements.checkProgressCount.textContent = '';
  if (elements.checkProgressEta) elements.checkProgressEta.textContent = '';
  if (elements.checkProgressSub) elements.checkProgressSub.textContent = '';

  // 如果分析进度也已隐藏，则收起任务面板
  const analyzeVisible = elements.analyzeProgressSection?.style.display !== 'none' &&
    elements.analyzeProgressSection?.style.display !== '';
  if (!analyzeVisible && state.taskPanelExpanded) {
    // 不自动收起，留给用户手动操作
  }

  // 兼容旧 progressSection
  const progressSection = document.getElementById('progressSection');
  const progressFill = document.getElementById('progressFill');
  if (progressSection) progressSection.style.display = 'none';
  if (progressFill) progressFill.style.width = '0%';

  if (elements.cancelCheckBtn) {
    elements.cancelCheckBtn.style.display = 'none';
  }

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
    showCheckResumeDialog({
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

  updateFooterStats();

  // 展开任务面板并显示检测进度区
  if (elements.checkProgressSection) {
    elements.checkProgressSection.style.display = '';
    if (elements.checkProgressCount) elements.checkProgressCount.textContent = `0/${state.bookmarks.length}`;
    if (elements.checkProgressFill) elements.checkProgressFill.style.width = '0%';
    if (elements.checkProgressEta) elements.checkProgressEta.textContent = '';
    if (elements.checkProgressSub) elements.checkProgressSub.textContent = '';
  }
  if (elements.taskPanel && !state.taskPanelExpanded) {
    state.taskPanelExpanded = true;
    elements.taskPanel.classList.add('expanded'); elements.taskPanel.classList.remove('collapsed');
  }

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
    message: `确定要删除"${item.title}"吗？此操作将同时从本地数据库和浏览器收藏夹中删除，无法撤销。`,
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        const result = await bookmarkManager.delete(item.id);

        if (result.success) {
          Toast.success('删除成功');
          await loadBookmarks();
        } else {
          throw new Error(result.error || '删除失败');
        }
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
  header.innerHTML = `
    <h3>失效链接详情 (${brokenLinks.length})</h3>
    <button class="btn btn-primary" id="cleanupBrokenBtn">🗑️ 一键清理全部</button>
  `;
  detailsContainer.appendChild(header);

  const list = document.createElement('div');
  list.className = 'broken-links-list';

  brokenLinks.forEach(link => {
    const item = document.createElement('div');
    item.className = 'broken-link-item';
    item.dataset.id = link.id;
    item.innerHTML = `
      <div class="link-header">
        <span class="link-icon">${getStatusIcon(link.checkStatus)}</span>
        <span class="link-title">${escapeHtml(link.title || '未命名')}</span>
        <button class="btn-delete-single" data-id="${escapeHtml(link.id)}" title="删除此书签">✕</button>
      </div>
      <div class="link-url">${escapeHtml(truncateUrl(link.url, 50))}</div>
      <div class="link-error">原因: ${escapeHtml(link.error || '未知错误')}</div>
    `;
    list.appendChild(item);
  });

  detailsContainer.appendChild(list);
  elements.bookmarkList.innerHTML = '';
  elements.bookmarkList.appendChild(detailsContainer);

  // 绑定一键清理按钮事件
  const cleanupBtn = document.getElementById('cleanupBrokenBtn');
  if (cleanupBtn) {
    cleanupBtn.addEventListener('click', () => {
      cleanupBrokenLinks(brokenLinks);
    });
  }

  // 绑定单个删除按钮事件
  list.querySelectorAll('.btn-delete-single').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const bookmarkId = btn.dataset.id;
      const bookmark = brokenLinks.find(b => b.id === bookmarkId);
      if (bookmark) {
        deleteBookmark(bookmark);
      }
    });
  });
}

/**
 * 批量清理失效链接
 */
function cleanupBrokenLinks(brokenLinks) {
  const confirm = new ConfirmDialog({
    title: '确认批量删除',
    message: `确定要删除这 ${brokenLinks.length} 个失效链接吗？\n\n此操作将同时从本地数据库和浏览器收藏夹中删除，无法撤销。`,
    confirmText: '确认删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        Toast.info('正在删除失效链接...');

        const bookmarkIds = brokenLinks.map(link => link.id);
        const result = await bookmarkManager.delete(bookmarkIds);

        if (result.success) {
          Toast.success(`成功删除 ${result.deletedCount} 个失效链接`);
          await loadBookmarks();
        } else {
          throw new Error(result.error || '批量删除失败');
        }
      } catch (error) {
        Toast.error('批量删除失败：' + error.message);
      }
    }
  });

  confirm.show();
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
      const pct = total > 0 ? (current / total) * 100 : 0;
      if (elements.analyzeProgressSection) elements.analyzeProgressSection.style.display = '';
      if (elements.analyzeProgressCount) elements.analyzeProgressCount.textContent = `${current}/${total}`;
      if (elements.analyzeProgressFill) elements.analyzeProgressFill.style.width = `${pct}%`;
      if (elements.analyzeProgressSub) elements.analyzeProgressSub.textContent = msg || '';
      if (elements.taskPanel && !state.taskPanelExpanded) {
        state.taskPanelExpanded = true;
        elements.taskPanel.classList.add('expanded'); elements.taskPanel.classList.remove('collapsed');
      }
    } else if (message.type === 'ANALYSIS_BATCH_DONE') {
      const { batchIndex, totalBatches, fromCache } = message.data;
      if (elements.analyzeProgressSub) {
        const note = fromCache ? '（已缓存）' : '';
        elements.analyzeProgressSub.textContent = `已完成 ${batchIndex + 1}/${totalBatches} 批${note}`;
      }
    } else if (message.type === 'ANALYSIS_COMPLETE') {
      finishAnalysisUI();
      showAnalysisConfirmDialog(message.data.result);
    } else if (message.type === 'ANALYSIS_CANCELLED') {
      finishAnalysisUI();
      Toast.info('分析已取消，进度已保存，下次可继续');
    } else if (message.type === 'ANALYSIS_FAILED') {
      finishAnalysisUI();
      Toast.error(`分析失败: ${message.data.error}`);
    } else if (message.type === 'BOOKMARK_CHANGED') {
      // 浏览器书签变更（用户在浏览器中新增/删除/移动书签），刷新列表
      loadBookmarks();
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
    if (state.isChecking) return;
    if (!res || !res.isRunning || !res.progress) return;

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

    // 展开任务面板显示进度
    if (elements.checkProgressSection) elements.checkProgressSection.style.display = '';
    if (elements.taskPanel && !state.taskPanelExpanded) {
      state.taskPanelExpanded = true;
      elements.taskPanel.classList.add('expanded'); elements.taskPanel.classList.remove('collapsed');
    }
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

  // 新任务面板进度区
  if (elements.checkProgressFill) elements.checkProgressFill.style.width = `${percentage}%`;
  if (elements.checkProgressCount) elements.checkProgressCount.textContent = `${completed}/${total}`;
  if (elements.checkProgressSub && brokenCount > 0) {
    elements.checkProgressSub.textContent = `已发现 ${brokenCount} 个失效`;
  }

  // 计算并显示预计剩余时间
  if (elements.checkProgressEta && completed > 0 && state.checkStartTime > 0) {
    const elapsed = Date.now() - state.checkStartTime;
    const rate = completed / elapsed;
    const remaining = total - completed;
    const etaMs = remaining / rate;
    if (etaMs < 60000) {
      elements.checkProgressEta.textContent = `约 ${Math.ceil(etaMs / 1000)} 秒`;
    } else {
      const mins = Math.ceil(etaMs / 60000);
      elements.checkProgressEta.textContent = `约 ${mins} 分钟`;
    }
  }

  // 兼容旧 compat 层
  const progressFill = document.getElementById('progressFill');
  const progressCount = document.getElementById('progressCount');
  if (progressFill) progressFill.style.width = `${percentage}%`;
  if (progressCount) progressCount.textContent = `${completed}/${total}`;
}

// escapeHtml() 已移至 utils/helpers.js（更安全，支持类型检查）

// ─────────────────────────── 侧栏宽度 ───────────────────────────

function loadSidebarWidth() {
  const saved = safeGetStorage('sidebarWidth');
  if (saved) {
    const w = parseInt(saved, 10);
    if (w >= 180 && w <= 480) {
      state.sidebarWidth = w;
      const sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.style.width = `${w}px`;
    }
  }
}

// ─────────────────────────── 任务面板 ───────────────────────────

function initTaskPanel() {
  const toggle = elements.taskPanelToggle;
  if (!toggle) return;
  toggle.addEventListener('click', toggleTaskPanel);
}

function toggleTaskPanel() {
  state.taskPanelExpanded = !state.taskPanelExpanded;
  if (elements.taskPanel) {
    elements.taskPanel.classList.toggle('expanded', state.taskPanelExpanded);
    elements.taskPanel.classList.toggle('collapsed', !state.taskPanelExpanded);
  }
}

// ─────────────────────────── 侧栏拖动 ───────────────────────────

function initResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('sidebar');
  if (!resizer || !sidebar) return;

  let startX = 0;
  let startW = 0;
  let dragging = false;

  resizer.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = sidebar.offsetWidth;
    resizer.classList.add('dragging');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const delta = e.clientX - startX;
    const newW = Math.min(480, Math.max(180, startW + delta));
    sidebar.style.width = `${newW}px`;
    state.sidebarWidth = newW;
  });

  document.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizer.classList.remove('dragging');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    safeSetStorage('sidebarWidth', String(state.sidebarWidth));
  });
}

// ─────────────────────────── 右键菜单 ───────────────────────────

function showContextMenu(item, x, y, options = {}) {
  // 委托给 contextMenuManager
  contextMenuManager.show(item, x, y, options);
}

function hideContextMenu() {
  // 委托给 contextMenuManager
  contextMenuManager.hide();
}

// ─────────────────────────── 编辑对话框 ─────────────────────────

function initEditDialog() {
  const dialog = elements.editDialog;
  if (!dialog) return;

  // 关闭按钮
  dialog.querySelector('#editDialogClose')?.addEventListener('click', () => {
    closeEditDialog();
  });
  dialog.querySelector('#editDialogCancel')?.addEventListener('click', () => {
    closeEditDialog();
  });

  // 点击遮罩关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeEditDialog();
  });

  // 保存按钮
  dialog.querySelector('#editDialogSave')?.addEventListener('click', async () => {
    // 清除之前的错误
    FormValidator.clearFormErrors(dialog);

    const item = state.selectedItem;
    if (!item) return;

    const titleEl = dialog.querySelector('#editTitle');
    const urlEl = dialog.querySelector('#editUrl');
    const summaryEl = dialog.querySelector('#editSummary');
    const tagsEl = dialog.querySelector('#editTags');

    const title = titleEl?.value.trim();
    const url = urlEl?.value.trim();
    const summary = summaryEl?.value.trim();
    const tagsRaw = tagsEl?.value.trim();
    const tags = tagsRaw ? tagsRaw.split(/[,，\s]+/).filter(Boolean) : [];

    // 表单验证
    let hasError = false;

    // 验证标题
    if (!title) {
      FormValidator.showFieldError(titleEl, '请输入名称');
      hasError = true;
    }

    // 验证 URL（仅书签需要）
    if (item.type !== 'folder' && !url) {
      FormValidator.showFieldError(urlEl, '请输入网址');
      hasError = true;
    } else if (url && !isValidUrl(url)) {
      FormValidator.showFieldError(urlEl, '请输入有效的网址（以 http:// 或 https:// 开头）');
      hasError = true;
    }

    if (hasError) {
      // 聚焦到第一个错误字段
      const firstError = dialog.querySelector('[aria-invalid="true"]');
      firstError?.focus();
      return;
    }

    try {
      // 根据类型发送不同的消息
      if (item.type === 'folder') {
        // 文件夹：只更新名称
        await chrome.runtime.sendMessage({
          type: 'UPDATE_CATEGORY',
          id: item.id,
          name: title
        });
      } else {
        // 书签：更新所有字段（使用 bookmarkManager）
        const result = await bookmarkManager.update(item.id, { title, url, summary, tags });
        if (!result.success) {
          throw new Error(result.error || '更新失败');
        }
      }
      Toast.success('保存成功');
      closeEditDialog();
      await loadBookmarks();
    } catch (err) {
      Toast.error('保存失败：' + err.message);
    }
  });

  // 重新生成摘要
  dialog.querySelector('#editRegenerateBtn')?.addEventListener('click', async () => {
    const item = state.selectedItem;
    if (!item) return;
    Toast.info('正在重新生成摘要...');
    try {
      const res = await chrome.runtime.sendMessage({
        type: 'REGENERATE_SUMMARY',
        bookmarkId: item.id
      });
      if (res?.summary) {
        dialog.querySelector('#editSummary').value = res.summary;
        Toast.success('摘要已更新');
      }
    } catch (err) {
      Toast.error('生成失败：' + err.message);
    }
  });
}

// ─────────────────────────── 拖拽功能 ─────────────────────────

function initDragAndDrop() {
  const container = elements.bookmarkList;
  if (!container) return;

  // 拖拽悬停在容器上
  container.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  // 拖拽结束（清除所有状态）
  container.addEventListener('dragend', () => {
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    removeInsertPlaceholder();
  });
}

/**
 * 显示插入位置占位符
 */
function showInsertPlaceholder(targetRow, clientY) {
  // 先移除旧的占位符
  removeInsertPlaceholder();

  const rect = targetRow.getBoundingClientRect();
  const middle = rect.top + rect.height / 2;
  const insertBefore = clientY < middle;

  // 创建占位符
  const placeholder = document.createElement('div');
  placeholder.className = 'drag-placeholder';
  placeholder.style.cssText = `
    height: 4px;
    background: #6366f1;
    border-radius: 2px;
    margin: ${insertBefore ? '4px 0' : '4px 0'};
    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    transition: all 0.2s ease;
    pointer-events: none;
  `;

  // 插入占位符
  if (insertBefore) {
    targetRow.parentNode.insertBefore(placeholder, targetRow);
  } else {
    targetRow.parentNode.insertBefore(placeholder, targetRow.nextSibling);
  }

  console.log('Placeholder shown:', insertBefore ? 'before' : 'after', targetRow.dataset.id);
}

/**
 * 移除插入位置占位符
 */
function removeInsertPlaceholder() {
  document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
}

/**
 * 处理书签重新排序
 */
async function handleReorderBookmark(draggedId, targetId, clientY) {
  try {
    const draggedItem = state.bookmarks.find(b => b.id === draggedId);
    const targetItem = state.bookmarks.find(b => b.id === targetId);

    if (!draggedItem || !targetItem) {
      console.error('Items not found:', { draggedItem, targetItem });
      return;
    }
    if (draggedId === targetId) return;

    // 获取目标元素
    const draggedEl = document.querySelector(`.bm-row[data-id="${draggedId}"]`);
    const targetEl = document.querySelector(`.bm-row[data-id="${targetId}"]`);
    if (!draggedEl || !targetEl) {
      console.error('Elements not found:', { draggedEl, targetEl });
      return;
    }

    const targetRect = targetEl.getBoundingClientRect();
    const targetMiddle = targetRect.top + targetRect.height / 2;
    const insertBefore = clientY < targetMiddle;

    // 获取当前文件夹中的所有书签
    const currentFolderId = state.currentFolderId;
    const folderBookmarks = state.bookmarks.filter(b => b.parentCategoryId === currentFolderId);

    // 计算新的排序索引
    const targetIndex = folderBookmarks.findIndex(b => b.id === targetId);
    const draggedIndex = folderBookmarks.findIndex(b => b.id === draggedId);

    if (targetIndex === -1 || draggedIndex === -1) {
      console.error('Index not found:', { targetIndex, draggedIndex });
      return;
    }

    // 重新排序数组
    const newBookmarks = [...folderBookmarks];
    newBookmarks.splice(draggedIndex, 1);
    const newIndex = insertBefore ? targetIndex : (targetIndex > draggedIndex ? targetIndex - 1 : targetIndex);
    newBookmarks.splice(newIndex, 0, draggedItem);

    // 更新排序索引（使用时间戳作为排序依据）
    const now = Date.now();
    for (let i = 0; i < newBookmarks.length; i++) {
      newBookmarks[i].sortOrder = now + i * 1000;

      // 更新 state 中的数据
      const stateIndex = state.bookmarks.findIndex(b => b.id === newBookmarks[i].id);
      if (stateIndex !== -1) {
        state.bookmarks[stateIndex] = newBookmarks[i];
      }
    }

    // 移除占位符
    removeInsertPlaceholder();

    // 立即在 DOM 中移动元素（视觉反馈）
    if (insertBefore) {
      targetEl.parentNode.insertBefore(draggedEl, targetEl);
    } else {
      targetEl.parentNode.insertBefore(draggedEl, targetEl.nextSibling);
    }

    // 异步保存到数据库
    setTimeout(async () => {
      for (let i = 0; i < newBookmarks.length; i++) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_BOOKMARK',
          id: newBookmarks[i].id,
          data: { sortOrder: newBookmarks[i].sortOrder }
        });
      }
      Toast.success('排序已更新');
    }, 100);

  } catch (error) {
    console.error('Reorder error:', error);
    Toast.error('排序失败：' + error.message);
    // 失败时重新加载以恢复正确顺序
    await loadBookmarks();
  }
}

function showEditDialog(item) {
  const dialog = elements.editDialog;
  if (!dialog) return;
  state.selectedItem = item;

  // 保存当前获得焦点的元素，以便关闭时恢复
  const activeElement = document.activeElement;
  if (activeElement && activeElement.id) {
    dialog.dataset.previousFocus = activeElement.id;
  }
  if (activeElement && activeElement.dataset && activeElement.dataset.bookmarkId) {
    dialog.dataset.previousBookmarkId = activeElement.dataset.bookmarkId;
  }

  const titleEl = dialog.querySelector('#editTitle');
  const urlEl = dialog.querySelector('#editUrl');
  const summaryEl = dialog.querySelector('#editSummary');
  const tagsEl = dialog.querySelector('#editTags');

  if (titleEl) titleEl.value = item.title || '';
  if (urlEl) {
    urlEl.value = item.url || '';
    urlEl.style.display = item.type === 'folder' ? 'none' : '';
    const urlLabel = dialog.querySelector('label[for="editUrl"]');
    if (urlLabel) urlLabel.style.display = item.type === 'folder' ? 'none' : '';
  }
  if (summaryEl) summaryEl.value = item.summary || '';
  if (tagsEl) tagsEl.value = (item.tags || []).join(', ');

  // 重新生成按钮仅书签时显示
  const regenBtn = dialog.querySelector('#editRegenerateBtn');
  if (regenBtn) regenBtn.style.display = item.type === 'folder' ? 'none' : '';

  dialog.style.display = 'flex';

  // 设置焦点到第一个输入框
  setTimeout(() => {
    if (titleEl && item.type !== 'folder') {
      titleEl.focus();
      titleEl.select();
    } else if (urlEl && item.url) {
      urlEl.focus();
      urlEl.select();
    }
  }, 100);
}

// ─────────────────────────── 重新生成摘要 ───────────────────────

async function regenerateSummary(item) {
  Toast.info('正在重新生成摘要...');
  try {
    const res = await chrome.runtime.sendMessage({
      type: 'REGENERATE_SUMMARY',
      bookmarkId: item.id
    });
    if (res?.summary) {
      Toast.success('摘要已更新');
      await loadBookmarks();
    } else {
      Toast.error('生成失败，请检查 API 设置');
    }
  } catch (err) {
    Toast.error('生成失败：' + err.message);
  }
}

/**
 * 高亮关键词（搜索结果使用）
 */
// ─────────────────────────── 文件夹管理 ───────────────────────────

/**
 * 显示合并文件夹对话框
 */
function showMergeFolderDialog(sourceFolder) {
  // 获取所有同级文件夹作为目标选项
  const siblings = state.bookmarks.filter(bm =>
    bm.type === 'folder' &&
    bm.parentId === sourceFolder.parentId &&
    bm.id !== sourceFolder.id
  );

  if (siblings.length === 0) {
    Toast.warning('没有同级文件夹可以合并');
    return;
  }

  // 构建选项列表
  const items = siblings.map(folder => {
    const childCount = state.bookmarks.filter(bm => bm.parentCategoryId === folder.id).length;
    return {
      value: folder.id,
      label: `📁 ${folder.title}`,
      description: `${childCount} 项内容`
    };
  });

  createSelectDialog({
    title: '合并文件夹',
    message: `将 <strong>${escapeHtml(sourceFolder.title)}</strong> 合并到：`,
    items: items,
    confirmText: '合并',
    onConfirm: async (targetId) => {
      const targetFolder = siblings.find(f => f.id === targetId);

      const response = await chrome.runtime.sendMessage({
        type: 'MERGE_FOLDERS',
        sourceId: sourceFolder.id,
        targetId: targetId
      });

      if (response.error) throw new Error(response.error);

      Toast.success(`已将 ${sourceFolder.title} 合并到 ${targetFolder.title}`);
      await loadBookmarks();
    }
  });
}

/**
 * 显示删除文件夹确认对话框
 */
function showDeleteFolderDialog(folder) {
  // 计算子项数量
  const childBookmarks = state.bookmarks.filter(bm => bm.parentCategoryId === folder.id);
  const childFolders = state.bookmarks.filter(bm => bm.type === 'folder' && bm.parentId === folder.id);
  const totalChildren = childBookmarks.length + childFolders.length;

  const message = totalChildren > 0
    ? `删除 "${escapeHtml(folder.title)}" 后，其中的 ${totalChildren} 项内容将移动到上级文件夹。确定要删除吗？`
    : `确定要删除 "${escapeHtml(folder.title)}" 吗？`;

  const dialog = new ConfirmDialog({
    title: '确认删除文件夹',
    message: message,
    confirmText: '删除',
    cancelText: '取消',
    onConfirm: async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_FOLDER',
          folderId: folder.id
        });

        if (response.error) throw new Error(response.error);

        const movedMsg = response.movedCount > 0
          ? `（已移动 ${response.movedCount} 项内容）`
          : '';
        Toast.success(`文件夹已删除${movedMsg}`);
        await loadBookmarks();
      } catch (error) {
        console.error('Delete folder failed:', error);
        Toast.error(`删除失败: ${error.message}`);
      }
    }
  });

  dialog.show();
}

/**
 * 删除文件夹（入口函数）
 */
function deleteFolder(folder) {
  showDeleteFolderDialog(folder);
}

// ─────────────────────────── 合并建议 ───────────────────────────

/**
 * 显示合并建议对话框
 * @param {Array} mergeSuggestions - 合并建议列表
 * @param {Array} categories - 所有分类列表
 */
function showMergeSuggestionsDialog(mergeSuggestions, categories) {
  if (!mergeSuggestions || mergeSuggestions.length === 0) {
    Toast.info('未检测到需要合并的重复分类');
    return;
  }

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay ai-merge-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog ai-merge-dialog">
      <div class="dialog-header">
        <h2>🔀 合并建议</h2>
        <button class="dialog-close" id="dialogClose" aria-label="关闭">&times;</button>
      </div>
      <div class="dialog-content">
        <p style="margin-bottom: 16px; color: var(--c-text-2);">
          检测到 ${mergeSuggestions.length} 组可能重复的分类，建议合并：
        </p>
        <div class="merge-suggestions-list">
          ${mergeSuggestions.map((suggestion, index) => {
            const confidencePercent = Math.round(suggestion.confidence * 100);
            const confidenceLevel = confidencePercent >= 85 ? 'high' : confidencePercent >= 70 ? 'medium' : 'low';
            const confidenceColor = confidenceLevel === 'high' ? '#10b981' : confidenceLevel === 'medium' ? '#f59e0b' : '#6b7280';

            // 构建源文件夹路径显示
            const sourcePath = suggestion.sourcePath || [suggestion.source];
            const targetPath = suggestion.targetPath || [suggestion.target];

            const sourcePathDisplay = sourcePath.map((part, i) => {
              const isLast = i === sourcePath.length - 1;
              return `<span style="${isLast ? 'font-weight: 600; color: #ef4444;' : 'color: var(--c-text-2);'}">${escapeHtml(part)}</span>`;
            }).join('<span style="color: var(--c-text-2); margin: 0 4px;">›</span>');

            const targetPathDisplay = targetPath.map((part, i) => {
              const isLast = i === targetPath.length - 1;
              return `<span style="${isLast ? 'font-weight: 600; color: #10b981;' : 'color: var(--c-text-2);'}">${escapeHtml(part)}</span>`;
            }).join('<span style="color: var(--c-text-2); margin: 0 4px;">›</span>');

            return `
              <label class="merge-suggestion-item" style="display: block; padding: 14px; border: 1px solid var(--c-border); border-radius: 10px; margin-bottom: 12px; cursor: pointer; transition: all 0.2s;">
                <div style="display: flex; align-items: flex-start; gap: 12px;">
                  <input type="checkbox" checked data-index="${index}" style="flex-shrink: 0; margin-top: 2px; width: 18px; height: 18px;" />
                  <div style="flex: 1; min-width: 0;">
                    <!-- 路径显示区域 -->
                    <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px;">
                      <!-- 源文件夹路径 -->
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; color: var(--c-text-2); font-weight: 600; text-transform: uppercase; white-space: nowrap; min-width: 60px;">合并源:</span>
                        <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 13px;">
                          ${sourcePathDisplay}
                        </div>
                      </div>
                      <!-- 合并指示箭头 -->
                      <div style="display: flex; align-items: center; gap: 8px; padding-left: 68px;">
                        <div style="flex: 1; height: 1px; background: linear-gradient(to right, var(--c-border), transparent);"></div>
                        <span style="color: var(--c-primary); font-weight: 600; font-size: 14px; padding: 2px 8px; background: var(--c-primary); color: white; border-radius: 4px; white-space: nowrap;">合并到</span>
                        <div style="flex: 1; height: 1px; background: linear-gradient(to left, var(--c-border), transparent);"></div>
                      </div>
                      <!-- 目标文件夹路径 -->
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 11px; color: var(--c-text-2); font-weight: 600; text-transform: uppercase; white-space: nowrap; min-width: 60px;">目标:</span>
                        <div style="flex: 1; display: flex; align-items: center; flex-wrap: wrap; gap: 4px; font-size: 13px;">
                          ${targetPathDisplay}
                        </div>
                      </div>
                    </div>
                    <!-- 原因和置信度 -->
                    <div style="display: flex; align-items: center; gap: 12px; padding-top: 8px; border-top: 1px dashed var(--c-border);">
                      <div style="flex: 1; font-size: 12px; color: var(--c-text-2);">
                        ${escapeHtml(suggestion.reason)}
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; white-space: nowrap;">
                        <span style="font-size: 11px; color: var(--c-text-2);">置信度</span>
                        <div style="width: 60px; height: 4px; background: var(--c-bg-3); border-radius: 2px; overflow: hidden;">
                          <div style="width: ${confidencePercent}%; height: 100%; background: ${confidenceColor}; border-radius: 2px; transition: width 0.3s;"></div>
                        </div>
                        <span style="font-size: 12px; font-weight: 700; color: ${confidenceColor};">${confidencePercent}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </label>
            `;
          }).join('')}
        </div>
      </div>
      <div class="dialog-footer" style="display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; gap: 10px;">
          <button class="btn" id="dialogSelectAll" style="padding: 6px 12px; font-size: 13px;">全选</button>
          <button class="btn" id="dialogDeselectAll" style="padding: 6px 12px; font-size: 13px;">取消全选</button>
        </div>
        <div style="display: flex; gap: 10px;">
          <button class="btn btn-cancel" id="dialogCancel">取消</button>
          <button class="btn btn-primary" id="dialogConfirm">应用选中合并</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);

  const closeBtn = dialog.querySelector('#dialogClose');
  const cancelBtn = dialog.querySelector('#dialogCancel');
  const confirmBtn = dialog.querySelector('#dialogConfirm');
  const selectAllBtn = dialog.querySelector('#dialogSelectAll');
  const deselectAllBtn = dialog.querySelector('#dialogDeselectAll');

  const closeDialog = () => {
    dialog.classList.add('hide');
    setTimeout(() => {
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
    }, 300);
  };

  closeBtn.addEventListener('click', closeDialog);
  cancelBtn.addEventListener('click', closeDialog);

  // 全选/取消全选
  selectAllBtn.addEventListener('click', () => {
    dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
    });
  });

  deselectAllBtn.addEventListener('click', () => {
    dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
  });

  // 添加选项悬停效果
  dialog.querySelectorAll('.merge-suggestion-item').forEach(item => {
    item.addEventListener('mouseenter', () => {
      item.style.borderColor = 'var(--c-primary)';
      item.style.backgroundColor = 'var(--c-bg-2)';
    });
    item.addEventListener('mouseleave', () => {
      item.style.borderColor = 'var(--c-border)';
      item.style.backgroundColor = '';
    });
  });

  confirmBtn.addEventListener('click', async () => {
    const selected = [];
    dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]:checked').forEach(cb => {
      const index = parseInt(cb.dataset.index);
      selected.push(mergeSuggestions[index]);
    });

    if (selected.length === 0) {
      Toast.warning('请至少选择一个合并建议');
      return;
    }

    // 确认对话框
    const confirmMerge = await asyncConfirm({
      title: '合并分类',
      message: `确定要合并 ${selected.length} 组分类吗？此操作不可撤销。`,
      confirmText: '确认合并',
      cancelText: '取消',
      danger: false
    });

    if (!confirmMerge) return;

    try {
      confirmBtn.disabled = true;
      confirmBtn.textContent = '合并中...';

      // 执行合并操作
      for (const suggestion of selected) {
        // 查找源和目标分类的 ID
        const sourceCat = categories.find(c => c.name === suggestion.source);
        const targetCat = categories.find(c => c.name === suggestion.target);

        if (sourceCat && targetCat) {
          const response = await chrome.runtime.sendMessage({
            type: 'MERGE_FOLDERS',
            sourceId: sourceCat.id,
            targetId: targetCat.id
          });

          if (response.error) {
            console.error(`合并 ${suggestion.source} → ${suggestion.target} 失败:`, response.error);
          }
        }
      }

      Toast.success(`已合并 ${selected.length} 组分类`);
      await loadBookmarks();
      closeDialog();
    } catch (error) {
      console.error('Batch merge failed:', error);
      Toast.error(`批量合并失败: ${error.message}`);
      confirmBtn.disabled = false;
      confirmBtn.textContent = '应用选中合并';
    }
  });

  // 更新按钮文本显示选中的数量
  const updateButtonText = () => {
    const selectedCount = dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]:checked').length;
    confirmBtn.textContent = selectedCount > 0 ? `应用选中合并 (${selectedCount})` : '应用选中合并';
  };

  dialog.querySelectorAll('.merge-suggestion-item input[type="checkbox"]').forEach(cb => {
    cb.addEventListener('change', updateButtonText);
  });

  setTimeout(() => dialog.classList.add('show'), 10);
}

/**
 * 从 AI 分析结果生成合并建议
 * @param {Object} analysisResult - AI 分析结果
 */
function generateMergeSuggestionsFromResult(analysisResult) {
  // 如果分析结果中已有合并报告，使用它
  if (analysisResult.summary?.mergeReport?.details?.length > 0) {
    const suggestions = [];
    const processed = new Set();

    for (const detail of analysisResult.summary.mergeReport.details) {
      if (detail.mergedCount < 2) continue;

      const cats = detail.categories.map(c => analysisResult.categories[c.index]);
      if (!cats || cats.length < 2) continue;

      // 选择名称最短的作为目标（通常最精确）
      const sortedCats = [...cats].sort((a, b) => a.name.length - b.name.length);
      const target = sortedCats[0];
      const source = sortedCats[1];

      const key = `${source.name}|${target.name}`;
      if (processed.has(key)) continue;
      processed.add(key);

      suggestions.push({
        source: source.name,
        target: target.name,
        confidence: 0.8, // 默认置信度
        reason: 'AI 检测到语义重复'
      });
    }

    return suggestions;
  }

  // 否则使用 CategoryMerger 生成建议
  // 这里需要动态导入，因为 CategoryMerger 可能在 background 中
  return [];
}

// ─────────────────────────── 左侧边栏文件夹管理 ───────────────────────────

/**
 * 显示新建子文件夹对话框
 */
function showAddSubFolderDialog(parentFolder) {
  createInputDialog({
    title: '➕ 新建子文件夹',
    message: `在 <strong>${escapeHtml(parentFolder.title)}</strong> 下创建新文件夹：`,
    placeholder: '例如: 前端开发',
    confirmText: '创建',
    validator: (value) => {
      if (!value || value.trim().length === 0) {
        return { valid: false, error: '请输入文件夹名称' };
      }
      if (value.trim().length > 50) {
        return { valid: false, error: '文件夹名称不能超过 50 个字符' };
      }
      return { valid: true };
    },
    onConfirm: async (name) => {
      const response = await chrome.runtime.sendMessage({
        type: 'CREATE_CATEGORY',
        name: name,
        parentId: parentFolder.id
      });

      if (response.error) throw new Error(response.error);

      Toast.success('文件夹已创建');
      await loadBookmarks();
    }
  });
}

/**
 * 显示重命名文件夹对话框
 */
function showRenameFolderDialog(folder) {
  createInputDialog({
    title: '✏️ 重命名文件夹',
    message: '',
    placeholder: '输入新的名称',
    confirmText: '保存',
    defaultValue: folder.title || '',
    validator: (value) => {
      if (!value || value.trim().length === 0) {
        return { valid: false, error: '请输入文件夹名称' };
      }
      if (value === folder.title) {
        return { valid: false, error: '新名称与原名称相同' };
      }
      if (value.trim().length > 50) {
        return { valid: false, error: '文件夹名称不能超过 50 个字符' };
      }
      return { valid: true };
    },
    onConfirm: async (name) => {
      const response = await chrome.runtime.sendMessage({
        type: 'UPDATE_CATEGORY',
        id: folder.id,
        name: name
      });

      if (response.error) throw new Error(response.error);

      Toast.success('文件夹已重命名');
      await loadBookmarks();
    }
  });
}

// 启动应用（确保 DOM 已加载）
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
