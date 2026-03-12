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
let contextMenu = null;

// 初始化
function init() {
  initRenderers();
  loadSidebarWidth();
  initTaskPanel();
  initResizer();
  initEditDialog();
  initContextMenu();
  initDragAndDrop();
  bindEvents();
  listenToMessages();
  loadBookmarks();
  restoreCheckingState();
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
    onCollapse: handleFolderCollapse,
    onDrop: handleTreeDrop
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
  if (elements.searchInput) elements.searchInput.value = '';

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

    li.appendChild(row);

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

  const subFolders = children.filter(n => n.type === 'folder');
  const bookmarks = children.filter(n => n.type === 'bookmark');
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

    console.log('Drag started:', bm.title);
  });

  // 拖拽结束
  row.addEventListener('dragend', (e) => {
    console.log('Drag ended');

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
    // 只有当真正离开元素时才移除高亮（避免子元素触发）
    const rect = row.getBoundingClientRect();
    if (e.clientX < rect.left || e.clientX > rect.right ||
        e.clientY < rect.top || e.clientY > rect.bottom) {
      row.classList.remove('drag-over');
      removeInsertPlaceholder();
    }
  });

  // 放置（在书签之间排序）
  row.addEventListener('drop', async (e) => {
    e.preventDefault();
    row.classList.remove('drag-over');

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

  const broken = state.bookmarks.filter(b => b.status === 'broken' || b.checkStatus === 'uncertain');
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
    <span style="color: #991b1b; font-size: 13px;">发现 ${broken.length} 个失效链接</span>
    <button class="btn btn-primary" id="cleanupAllBrokenBtn" style="background: #dc2626; border-color: #dc2626; padding: 6px 12px; font-size: 13px;">🗑️ 一键清理全部</button>
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
 * 渲染搜索结果
 */
function renderSearchResults() {
  if (elements.breadcrumb) {
    elements.breadcrumb.innerHTML = `<span class="bc-item current">🔍 搜索：${escapeHtml(state.searchTerm)}</span>`;
  }

  const treeData = buildTreeData(state.bookmarks);
  const results = filterBookmarks(treeData, state.searchTerm);
  const container = elements.bookmarkList;
  container.innerHTML = '';

  if (elements.searchStats) {
    elements.searchStats.textContent = `找到 ${results.length} 项`;
    elements.searchStats.style.display = '';
  }
  if (elements.folderStats) elements.folderStats.textContent = '';

  if (results.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-state-icon">🔍</div><h3>未找到相关结果</h3><p>请尝试其他关键词</p></div>`;
    return;
  }

  const list = document.createElement('div');
  list.className = 'bm-list';
  results.forEach(bm => list.appendChild(createBookmarkRow(bm)));
  container.appendChild(list);
}

/**
 * 执行搜索
 */
function performSearch() {
  if (!state.searchTerm.trim()) {
    if (elements.searchStats) elements.searchStats.style.display = 'none';
    renderBookmarks();
    return;
  }
  renderSearchResults();
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
      performSearch();
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
  document.addEventListener('click', (e) => {
    if (!elements.contextMenuEl.contains(e.target)) {
      hideContextMenu();
    }
  });
  document.addEventListener('contextmenu', (e) => {
    // 若不是书签行触发，关闭菜单
    if (!e.target.closest('.bm-row') && !e.target.closest('.bm-folder-row')) {
      hideContextMenu();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideContextMenu();
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
      deleteBookmark(item);
      break;

    case 'openFolder':
      if (item.type === 'folder') navigateToFolder(item.id);
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
    const response = await chrome.runtime.sendMessage({
      type: 'MOVE_BOOKMARK',
      bookmarkId: id,
      targetFolderId: targetFolder.id
    });

    if (response.success) {
      Toast.success('移动成功');
      await loadBookmarks();
    } else {
      throw new Error(response.error || '移动失败');
    }
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
 * 显示续分析 / 重新全量分析 对话框
 */
function showAnalysisResumeDialog({ sessionTime, completedBatches, totalBatches, bookmarkCount, lastError, onResume, onRestart }) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';

  const reasonHtml = lastError
    ? `<p style="font-size:12px;color:#ef4444;margin:10px 0 0;padding:8px 10px;background:#fef2f2;border-radius:6px;">⚠️ 上次因错误中断：${lastError}</p>`
    : '';

  overlay.innerHTML = `
    <div class="confirm-dialog" style="max-width:440px;">
      <div class="dialog-header">
        <h2>🤖 发现未完成的分析</h2>
        <button class="dialog-close" id="aResumeClose">&times;</button>
      </div>
      <div class="dialog-content" style="padding:16px 20px;">
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:16px;">
          <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">发起时间</div>
            <div style="font-size:15px;font-weight:600;color:#334155;">${sessionTime}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">已完成批次</div>
            <div style="font-size:15px;font-weight:600;color:#22c55e;">${completedBatches}/${totalBatches}</div>
          </div>
          <div style="background:#f8fafc;border-radius:8px;padding:10px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">剩余书签</div>
            <div style="font-size:15px;font-weight:600;color:#f59e0b;">
              ~${Math.max(0, (totalBatches - completedBatches) * 10)}
            </div>
          </div>
        </div>
        <p style="font-size:13px;color:#475569;margin:0;">
          上次分析在第 <strong>${completedBatches}/${totalBatches}</strong> 批时中断。<br>
          可从中断处继续，或重新对全部 <strong>${bookmarkCount}</strong> 个收藏发起完整分析。
        </p>
        ${reasonHtml}
      </div>
      <div class="dialog-footer" style="gap:8px;">
        <button class="btn btn-cancel" id="aResumeCancel">稍后再说</button>
        <button class="btn" id="aResumeRestart"
          style="background:#f8fafc;border:1px solid #cbd5e1;color:#475569;">
          🔄 重新全量分析
        </button>
        <button class="btn btn-primary" id="aResumeResume">▶ 续分析</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay.classList.add('hide');
    setTimeout(() => overlay.remove(), 300);
  };

  overlay.querySelector('#aResumeClose').addEventListener('click', close);
  overlay.querySelector('#aResumeCancel').addEventListener('click', close);
  overlay.querySelector('#aResumeResume').addEventListener('click', () => {
    close();
    onResume();
  });
  overlay.querySelector('#aResumeRestart').addEventListener('click', () => {
    close();
    onRestart();
  });
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  setTimeout(() => overlay.classList.add('show'), 10);
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

  const catRows = sortedCats.map(cat => {
    const barW = Math.round((cat.bookmarkIds.length / maxCount) * 100);
    const badge = cat.isNew
      ? '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:4px;flex-shrink:0;">新增</span>'
      : '<span style="font-size:10px;background:#f1f5f9;color:#64748b;padding:1px 6px;border-radius:4px;flex-shrink:0;">已有</span>';
    const bookmarkItems = cat.bookmarkIds
      .map(id => bookmarkMap.get(String(id)))
      .filter(Boolean)
      .map(bm => `
        <div style="padding:5px 0;border-bottom:1px solid #f8fafc;min-width:0;">
          <div style="font-size:12px;font-weight:500;overflow:hidden;text-overflow:ellipsis;
                      white-space:nowrap;color:#374151;">${escapeHtml(bm.title)}</div>
          <div style="font-size:11px;color:#9ca3af;overflow:hidden;text-overflow:ellipsis;
                      white-space:nowrap;">${escapeHtml(bm.url)}</div>
        </div>
      `).join('');
    return `
      <details style="border-bottom:1px solid #f1f5f9;">
        <summary style="list-style:none;cursor:pointer;display:flex;align-items:center;
                        gap:8px;padding:10px 4px;user-select:none;">
          ${badge}
          <span style="font-size:13px;font-weight:600;flex:1;overflow:hidden;
                       text-overflow:ellipsis;white-space:nowrap;color:#1e293b;">
            ${escapeHtml(cat.name)}
          </span>
          <span style="font-size:12px;color:#94a3b8;flex-shrink:0;">${cat.bookmarkIds.length} 个</span>
          <div style="width:48px;height:4px;background:#e2e8f0;border-radius:2px;flex-shrink:0;">
            <div style="width:${barW}%;height:100%;background:#818cf8;border-radius:2px;"></div>
          </div>
        </summary>
        <div style="padding:4px 0 10px 56px;">
          ${bookmarkItems || '<div style="font-size:12px;color:#94a3b8;padding:4px 0;">无书签</div>'}
        </div>
      </details>
    `;
  }).join('');

  const tagsSection = uniqueTagNames.length > 0 ? `
    <div style="padding:0 16px 4px;border-top:1px solid #f1f5f9;">
      <details>
        <summary style="list-style:none;cursor:pointer;padding:10px 0;font-size:13px;
                        font-weight:600;color:#475569;user-select:none;display:flex;
                        align-items:center;gap:6px;">
          <span>🏷 标签建议</span>
          <span style="font-weight:400;font-size:12px;color:#94a3b8;">${uniqueTagNames.length} 个</span>
        </summary>
        <div style="display:flex;flex-wrap:wrap;gap:6px;padding:0 0 10px;">
          ${uniqueTagNames.map(name => `
            <span style="background:#f8fafc;color:#475569;font-size:12px;padding:3px 10px;
                         border-radius:12px;border:1px solid #e2e8f0;">${escapeHtml(name)}</span>
          `).join('')}
        </div>
      </details>
    </div>
  ` : '';

  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';
  dialog.innerHTML = `
    <div class="confirm-dialog" style="max-width:560px;">
      <div class="dialog-header">
        <h2>🤖 AI 整理建议</h2>
        <button class="dialog-close" id="dialogClose">&times;</button>
      </div>
      <div class="dialog-content" style="padding:0;">
        <!-- 概要指标 -->
        <div style="display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #f1f5f9;">
          <div style="text-align:center;padding:14px 8px;">
            <div style="font-size:22px;font-weight:700;color:#1e293b;">${summary.totalBookmarks}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">个收藏</div>
          </div>
          <div style="text-align:center;padding:14px 8px;border-left:1px solid #f1f5f9;border-right:1px solid #f1f5f9;">
            <div style="font-size:22px;font-weight:700;color:#6366f1;">${categories.length}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">
              个分类${newCatCount > 0 ? ` <span style="color:#1d4ed8;">(${newCatCount} 新增)</span>` : ''}
            </div>
          </div>
          <div style="text-align:center;padding:14px 8px;">
            <div style="font-size:22px;font-weight:700;color:#0891b2;">${uniqueTagNames.length}</div>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">个标签建议</div>
          </div>
        </div>
        <!-- 分类方案 -->
        <div style="padding:0 16px;">
          <div style="font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.05em;
                      padding:10px 4px 4px;">📁 分类整理方案</div>
          <div style="max-height:300px;overflow-y:auto;">
            ${catRows || '<div style="color:#94a3b8;font-size:13px;padding:12px 4px;">暂无分类建议</div>'}
          </div>
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
        categories: analysisResult.categories
      });
      if (response.error) throw new Error(response.error);
      Toast.success(`整理完成！已应用 ${analysisResult.categories.length} 个分类`);
      await loadBookmarks();
      closeDialog();
    } catch (error) {
      console.error('Failed to apply categories:', error);
      confirmBtn.disabled = false;
      confirmBtn.textContent = '✓ 应用整理方案';
      Toast.error(`应用失败: ${error.message}`);
    }
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

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
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_BOOKMARK',
          bookmarkId: item.id
        });

        if (response.success) {
          Toast.success('删除成功');
          await loadBookmarks();
        } else {
          throw new Error(response.error || '删除失败');
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
        const response = await chrome.runtime.sendMessage({
          type: 'DELETE_BOOKMARKS_BATCH',
          bookmarkIds
        });

        if (response.success) {
          Toast.success(response.message || `成功删除 ${response.deleted} 个失效链接`);
          await loadBookmarks();
        } else {
          throw new Error(response.error || '批量删除失败');
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
      console.log('[Popup] 书签变更通知:', message.data);
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

// ─────────────────────────── 侧栏宽度 ───────────────────────────

function loadSidebarWidth() {
  const saved = localStorage.getItem('sidebarWidth');
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
    localStorage.setItem('sidebarWidth', String(state.sidebarWidth));
  });
}

// ─────────────────────────── 右键菜单 ───────────────────────────

function initContextMenu() {
  const menu = elements.contextMenuEl;
  if (!menu) return;

  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      hideContextMenu();
      handleContextMenuAction(action);
    }
  });
}

function showContextMenu(item, x, y) {
  const menu = elements.contextMenuEl;
  if (!menu) return;

  // 根据 item 类型显示/隐藏相关项目
  const isFolder = item.type === 'folder';
  menu.querySelectorAll('[data-for-folder]').forEach(el => {
    el.style.display = isFolder ? '' : 'none';
  });
  menu.querySelectorAll('[data-for-bookmark]').forEach(el => {
    el.style.display = isFolder ? 'none' : '';
  });

  // 显示菜单
  menu.style.display = 'block';

  // 确保不超出视口
  const vpW = window.innerWidth;
  const vpH = window.innerHeight;
  const mW = menu.offsetWidth || 180;
  const mH = menu.offsetHeight || 240;
  const left = (x + mW > vpW) ? Math.max(0, vpW - mW - 4) : x;
  const top = (y + mH > vpH) ? Math.max(0, vpH - mH - 4) : y;
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function hideContextMenu() {
  if (elements.contextMenuEl) {
    elements.contextMenuEl.style.display = 'none';
  }
}

// ─────────────────────────── 编辑对话框 ─────────────────────────

function initEditDialog() {
  const dialog = elements.editDialog;
  if (!dialog) return;

  // 关闭按钮
  dialog.querySelector('#editDialogClose')?.addEventListener('click', () => {
    dialog.style.display = 'none';
  });
  dialog.querySelector('#editDialogCancel')?.addEventListener('click', () => {
    dialog.style.display = 'none';
  });

  // 点击遮罩关闭
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.style.display = 'none';
  });

  // 保存
  dialog.querySelector('#editDialogSave')?.addEventListener('click', async () => {
    const item = state.selectedItem;
    if (!item) return;

    const title = dialog.querySelector('#editTitle')?.value.trim();
    const url = dialog.querySelector('#editUrl')?.value.trim();
    const summary = dialog.querySelector('#editSummary')?.value.trim();
    const tagsRaw = dialog.querySelector('#editTags')?.value.trim();
    const tags = tagsRaw ? tagsRaw.split(/[,，\s]+/).filter(Boolean) : [];

    try {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        id: item.id,
        data: { title, url, summary, tags }
      });
      Toast.success('保存成功');
      dialog.style.display = 'none';
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

  // 拖拽离开容器
  container.addEventListener('dragleave', (e) => {
    // 清除所有高亮
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
  });

  // 在容器上放置（用于排序）
  container.addEventListener('drop', async (e) => {
    e.preventDefault();

    // 清除所有高亮
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });

    // 获取拖拽数据
    const dragData = e.dataTransfer.getData('text/plain');
    if (!dragData) return;

    try {
      const { type, id, data } = JSON.parse(dragData);

      // 查找放置目标（最近的书签行）
      const targetRow = e.target.closest('.bm-row');
      if (targetRow && targetRow.dataset.id !== id) {
        // 在书签之间排序
        await handleReorderBookmark(id, targetRow.dataset.id, e.clientY);
      }
    } catch (err) {
      console.error('Drop error:', err);
    }
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
    margin: ${insertBefore ? '8px 0 4px' : '4px 0 8px'};
    box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
    transition: all 0.2s ease;
  `;

  // 插入占位符
  if (insertBefore) {
    targetRow.parentNode.insertBefore(placeholder, targetRow);
  } else {
    targetRow.parentNode.insertBefore(placeholder, targetRow.nextSibling);
  }
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

    if (!draggedItem || !targetItem) return;

    // 获取目标元素的位置
    const targetEl = document.querySelector(`.bm-row[data-id="${targetId}"]`);
    if (!targetEl) return;

    const targetRect = targetEl.getBoundingClientRect();
    const targetMiddle = targetRect.top + targetRect.height / 2;

    // 判断是插入到目标之前还是之后
    const insertBefore = clientY < targetMiddle;

    // 获取当前文件夹中的所有书签
    const currentFolderId = state.currentFolderId;
    const folderBookmarks = state.bookmarks.filter(b => b.parentCategoryId === currentFolderId);

    // 计算新的排序索引
    const targetIndex = folderBookmarks.findIndex(b => b.id === targetId);
    const draggedIndex = folderBookmarks.findIndex(b => b.id === draggedId);

    if (targetIndex === -1 || draggedIndex === -1) return;

    // 重新排序数组
    const newBookmarks = [...folderBookmarks];
    newBookmarks.splice(draggedIndex, 1);
    const newIndex = insertBefore ? targetIndex : (targetIndex > draggedIndex ? targetIndex - 1 : targetIndex);
    newBookmarks.splice(newIndex, 0, draggedItem);

    // 更新排序索引（使用时间戳作为排序依据）
    const now = Date.now();
    const updates = [];

    for (let i = 0; i < newBookmarks.length; i++) {
      newBookmarks[i].sortOrder = now + i * 1000;
      newBookmarks[i].updatedAt = now;

      // 收集更新（不立即发送，减少消息数量）
      updates.push({
        id: newBookmarks[i].id,
        sortOrder: newBookmarks[i].sortOrder
      });
    }

    // 批量更新到数据库
    for (const update of updates) {
      await chrome.runtime.sendMessage({
        type: 'UPDATE_BOOKMARK',
        id: update.id,
        data: { sortOrder: update.sortOrder }
      });
    }

    Toast.success('排序已更新');
    await loadBookmarks();
  } catch (error) {
    console.error('Reorder error:', error);
    Toast.error('排序失败：' + error.message);
  }
}

function showEditDialog(item) {
  const dialog = elements.editDialog;
  if (!dialog) return;
  state.selectedItem = item;

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
function highlightKeywords(text, searchTerm) {
  if (!text || !searchTerm) return escapeHtml(text || '');
  const keywords = searchTerm
    .toLowerCase()
    .replace(/tag:\S+/gi, '')
    .replace(/site:\S+/gi, '')
    .replace(/"/g, '')
    .trim()
    .split(/\s+/)
    .filter(k => k);
  if (keywords.length === 0) return escapeHtml(text);
  const regex = new RegExp(`(${keywords.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return escapeHtml(text).replace(regex, '<mark>$1</mark>');
}

// 启动应用
init();
