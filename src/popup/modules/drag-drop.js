/**
 * 拖拽模块
 * 负责书签拖拽重排、文件夹拖拽、侧边栏调整
 */

import eventBus from '../utils/event-bus.js';
import stateManager from './state.js';

/**
 * 拖拽管理器
 */
class DragDropManager {
  constructor() {
    this.dragState = {
      isDragging: false,
      draggedItem: null,
      draggedElement: null,
      draggedType: null, // 'bookmark' | 'folder'
      dragData: null
    };

    this.sidebarState = {
      isResizing: false,
      startX: 0,
      startWidth: 0
    };

    this.config = {
      minSidebarWidth: 180,
      maxSidebarWidth: 480,
      placeholderHeight: 4,
      placeholderColor: '#6366f1'
    };
  }

  /**
   * 初始化拖拽
   */
  init() {
    this._initContainer();
    this._initSidebarResizer();
  }

  /**
   * 初始化容器拖拽
   * @private
   */
  _initContainer() {
    const container = document.getElementById('bookmarkList');
    if (!container) return;

    // 允许在容器上拖放
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });

    // 拖拽结束时清理状态
    container.addEventListener('dragend', () => {
      this._cleanup();
    });
  }

  /**
   * 初始化侧边栏调整大小
   * @private
   */
  _initSidebarResizer() {
    const resizer = document.getElementById('sidebarResizer');
    const sidebar = document.getElementById('sidebar');
    if (!resizer || !sidebar) return;

    resizer.addEventListener('mousedown', (e) => {
      this.sidebarState.isResizing = true;
      this.sidebarState.startX = e.clientX;
      this.sidebarState.startWidth = sidebar.offsetWidth;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      eventBus.emit(eventBus.Events.SIDEBAR_RESIZE_STARTED);
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.sidebarState.isResizing) return;

      const delta = e.clientX - this.sidebarState.startX;
      const newWidth = Math.min(
        this.config.maxSidebarWidth,
        Math.max(this.config.minSidebarWidth, this.sidebarState.startWidth + delta)
      );

      sidebar.style.width = `${newWidth}px`;
      stateManager.set('sidebarWidth', newWidth);

      eventBus.emit(eventBus.Events.SIDEBAR_RESIZING, { width: newWidth });
    });

    document.addEventListener('mouseup', () => {
      if (!this.sidebarState.isResizing) return;

      this.sidebarState.isResizing = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // 保存侧边栏宽度
      localStorage.setItem('sidebarWidth', String(stateManager.get('sidebarWidth')));

      eventBus.emit(eventBus.Events.SIDEBAR_RESIZE_ENDED, {
        width: stateManager.get('sidebarWidth')
      });
    });
  }

  /**
   * 为书签行绑定拖拽事件
   * @param {HTMLElement} row - 书签行元素
   * @param {Object} bookmark - 书签数据
   */
  bindBookmarkRow(row, bookmark) {
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
      this._onBookmarkDragStart(e, bookmark, row);
    });

    row.addEventListener('dragend', (e) => {
      this._onBookmarkDragEnd(e, row);
    });

    row.addEventListener('dragover', (e) => {
      this._onBookmarkDragOver(e, bookmark, row);
    });

    row.addEventListener('dragleave', (e) => {
      this._onBookmarkDragLeave(e, row);
    });

    row.addEventListener('drop', (e) => {
      this._onBookmarkDrop(e, bookmark, row);
    });
  }

  /**
   * 为文件夹行绑定拖拽事件
   * @param {HTMLElement} row - 文件夹行元素
   * @param {Object} folder - 文件夹数据
   */
  bindFolderRow(row, folder) {
    row.draggable = true;

    row.addEventListener('dragstart', (e) => {
      this._onFolderDragStart(e, folder, row);
    });

    row.addEventListener('dragend', (e) => {
      this._onFolderDragEnd(e, row);
    });

    row.addEventListener('dragover', (e) => {
      this._onFolderDragOver(e, row);
    });

    row.addEventListener('dragleave', (e) => {
      this._onFolderDragLeave(e, row);
    });

    row.addEventListener('drop', (e) => {
      this._onFolderDrop(e, folder, row);
    });
  }

  /**
   * 书签拖拽开始
   * @private
   */
  _onBookmarkDragStart(e, bookmark, row) {
    this.dragState.isDragging = true;
    this.dragState.draggedItem = bookmark;
    this.dragState.draggedElement = row;
    this.dragState.draggedType = 'bookmark';

    // 设置拖拽数据
    const dragData = JSON.stringify({
      type: 'bookmark',
      id: bookmark.id,
      data: bookmark
    });
    e.dataTransfer.setData('text/plain', dragData);
    e.dataTransfer.effectAllowed = 'move';

    // 设置拖拽图像
    e.dataTransfer.setDragImage(row, e.offsetX, e.offsetY);

    row.classList.add('dragging');

    eventBus.emit(eventBus.Events.DRAG_STARTED, {
      type: 'bookmark',
      item: bookmark
    });
  }

  /**
   * 书签拖拽结束
   * @private
   */
  _onBookmarkDragEnd(e, row) {
    this._cleanup();

    eventBus.emit(eventBus.Events.DRAG_ENDED, {
      type: 'bookmark'
    });
  }

  /**
   * 书签拖拽悬停
   * @private
   */
  _onBookmarkDragOver(e, bookmark, row) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    // 不允许拖拽到自己上面
    if (this.dragState.draggedItem?.id === bookmark.id) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    row.classList.add('drag-over');

    // 显示插入位置占位符
    this._showInsertPlaceholder(row, e.clientY);
  }

  /**
   * 书签拖拽离开
   * @private
   */
  _onBookmarkDragLeave(e, row) {
    // 确保是真的离开元素（而不是进入子元素）
    const rect = row.getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;

    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      row.classList.remove('drag-over');
    }
  }

  /**
   * 书签放置
   * @private
   */
  async _onBookmarkDrop(e, targetBookmark, targetRow) {
    e.preventDefault();
    targetRow.classList.remove('drag-over');

    this._removeInsertPlaceholder();

    const draggedId = this.dragState.draggedItem?.id;
    if (!draggedId || draggedId === targetBookmark.id) {
      return;
    }

    // 执行重排序
    await this._reorderBookmarks(draggedId, targetBookmark.id, e.clientY);

    eventBus.emit(eventBus.Events.BOOKMARK_REORDERED, {
      draggedId,
      targetId: targetBookmark.id
    });
  }

  /**
   * 文件夹拖拽开始
   * @private
   */
  _onFolderDragStart(e, folder, row) {
    this.dragState.isDragging = true;
    this.dragState.draggedItem = folder;
    this.dragState.draggedElement = row;
    this.dragState.draggedType = 'folder';

    const dragData = JSON.stringify({
      type: 'folder',
      id: folder.id,
      data: folder
    });
    e.dataTransfer.setData('text/plain', dragData);
    e.dataTransfer.effectAllowed = 'move';

    e.dataTransfer.setDragImage(row, e.offsetX, e.offsetY);

    row.classList.add('dragging');

    eventBus.emit(eventBus.Events.DRAG_STARTED, {
      type: 'folder',
      item: folder
    });
  }

  /**
   * 文件夹拖拽结束
   * @private
   */
  _onFolderDragEnd(e, row) {
    this._cleanup();

    eventBus.emit(eventBus.Events.DRAG_ENDED, {
      type: 'folder'
    });
  }

  /**
   * 文件夹拖拽悬停
   * @private
   */
  _onFolderDragOver(e, row) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    row.classList.add('drag-over');
  }

  /**
   * 文件夹拖拽离开
   * @private
   */
  _onFolderDragLeave(e, row) {
    row.classList.remove('drag-over');
  }

  /**
   * 文件夹放置
   * @private
   */
  async _onFolderDrop(e, targetFolder, targetRow) {
    e.preventDefault();
    targetRow.classList.remove('drag-over');

    try {
      const dragDataStr = e.dataTransfer.getData('text/plain');
      if (!dragDataStr) return;

      const dragData = JSON.parse(dragDataStr);

      // 不允许拖拽到自己或自己的子文件夹中
      if (dragData.id === targetFolder.id) {
        Toast.warning('不能移动到自身');
        return;
      }

      // 检查是否会造成循环嵌套
      const isDescendant = this._isDescendant(dragData.id, targetFolder.id);
      if (isDescendant) {
        Toast.warning('不能移动到自己的子文件夹');
        return;
      }

      // 移动到目标文件夹
      await this._moveToFolder(dragData.id, targetFolder.id, dragData.type);

      eventBus.emit(eventBus.Events.ITEM_MOVED_TO_FOLDER, {
        itemId: dragData.id,
        itemType: dragData.type,
        targetFolderId: targetFolder.id
      });
    } catch (error) {
      console.error('[DragDropManager] Folder drop error:', error);
      Toast.error('移动失败：' + error.message);
    }
  }

  /**
   * 重新排序书签
   * @param {string} draggedId - 拖拽的书签ID
   * @param {string} targetId - 目标书签ID
   * @param {number} clientY - 鼠标Y坐标
   * @returns {Promise<Object>} 结果
   * @private
   */
  async _reorderBookmarks(draggedId, targetId, clientY) {
    try {
      const bookmarks = stateManager.get('bookmarks', []);
      const currentFolderId = stateManager.get('selectedFolderId');

      const draggedItem = bookmarks.find(b => b.id === draggedId);
      const targetItem = bookmarks.find(b => b.id === targetId);

      if (!draggedItem || !targetItem) {
        return { success: false, error: '项目不存在' };
      }

      // 获取当前文件夹中的所有书签
      const folderBookmarks = bookmarks.filter(b => b.categoryId === currentFolderId);

      // 计算新的排序索引
      const targetIndex = folderBookmarks.findIndex(b => b.id === targetId);
      const draggedIndex = folderBookmarks.findIndex(b => b.id === draggedId);

      if (targetIndex === -1 || draggedIndex === -1) {
        return { success: false, error: '索引无效' };
      }

      // 重新排序数组
      const newBookmarks = [...folderBookmarks];
      newBookmarks.splice(draggedIndex, 1);

      const targetRect = document.querySelector(`.bm-row[data-id="${targetId}"]`)?.getBoundingClientRect();
      const insertBefore = targetRect ? clientY < (targetRect.top + targetRect.height / 2) : true;

      const newIndex = insertBefore
        ? targetIndex
        : (targetIndex > draggedIndex ? targetIndex - 1 : targetIndex);

      newBookmarks.splice(newIndex, 0, draggedItem);

      // 更新排序索引（使用时间戳作为排序依据）
      const now = Date.now();
      for (let i = 0; i < newBookmarks.length; i++) {
        newBookmarks[i].sortOrder = now + i * 1000;

        // 更新 state 中的数据
        const stateIndex = bookmarks.findIndex(b => b.id === newBookmarks[i].id);
        if (stateIndex !== -1) {
          bookmarks[stateIndex] = newBookmarks[i];
        }
      }

      stateManager.set('bookmarks', bookmarks);

      // 立即在 DOM 中移动元素
      const draggedEl = document.querySelector(`.bm-row[data-id="${draggedId}"]`);
      const targetEl = document.querySelector(`.bm-row[data-id="${targetId}"]`);

      if (draggedEl && targetEl) {
        if (insertBefore) {
          targetEl.parentNode.insertBefore(draggedEl, targetEl);
        } else {
          targetEl.parentNode.insertBefore(draggedEl, targetEl.nextSibling);
        }
      }

      // 异步保存到数据库（性能优化：并行处理所有更新请求）
      setTimeout(async () => {
        // 使用 Promise.all 并行发送所有更新请求，而非串行等待
        // 这样可以将 N 个请求的总时间从 sum(latency) 降低到 max(latency)
        const updatePromises = newBookmarks.map(bookmark =>
          chrome.runtime.sendMessage({
            type: 'UPDATE_BOOKMARK',
            id: bookmark.id,
            data: { sortOrder: bookmark.sortOrder }
          })
        );

        try {
          await Promise.all(updatePromises);
          Toast.success('排序已更新');
        } catch (error) {
          console.error('[DragDropManager] Batch update error:', error);
          Toast.error('部分排序更新失败');
        }
      }, 100);

      return { success: true };
    } catch (error) {
      console.error('[DragDropManager] Reorder error:', error);
      Toast.error('排序失败：' + error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 移动到文件夹
   * @param {string} itemId - 项目ID
   * @param {string} targetFolderId - 目标文件夹ID
   * @param {string} itemType - 项目类型 ('bookmark' | 'folder')
   * @returns {Promise<Object>} 结果
   * @private
   */
  async _moveToFolder(itemId, targetFolderId, itemType) {
    try {
      let response;

      if (itemType === 'bookmark') {
        response = await chrome.runtime.sendMessage({
          type: 'MOVE_BOOKMARK_TO_FOLDER',
          bookmarkId: itemId,
          targetFolderId: targetFolderId
        });
      } else {
        response = await chrome.runtime.sendMessage({
          type: 'MOVE_FOLDER_TO_FOLDER',
          folderId: itemId,
          targetFolderId: targetFolderId
        });
      }

      if (response && response.success) {
        Toast.success('移动成功');
        return { success: true };
      }

      return { success: false, error: response?.error || '移动失败' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * 检查是否为后代（防止循环嵌套）
   * @param {string} parentId - 父ID
   * @param {string} childId - 子ID
   * @returns {boolean} 是否为后代
   * @private
   */
  _isDescendant(parentId, childId) {
    const categories = stateManager.get('categories', []);
    let currentId = childId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const category = categories.find(c => c.id === currentId);

      if (!category) break;

      if (category.id === parentId) {
        return true;
      }

      currentId = category.parentId;
    }

    return false;
  }

  /**
   * 显示插入位置占位符
   * @param {HTMLElement} targetRow - 目标行
   * @param {number} clientY - 鼠标Y坐标
   * @private
   */
  _showInsertPlaceholder(targetRow, clientY) {
    this._removeInsertPlaceholder();

    const rect = targetRow.getBoundingClientRect();
    const middle = rect.top + rect.height / 2;
    const insertBefore = clientY < middle;

    const placeholder = document.createElement('div');
    placeholder.className = 'drag-placeholder';
    placeholder.style.cssText = `
      height: ${this.config.placeholderHeight}px;
      background: ${this.config.placeholderColor};
      border-radius: 2px;
      margin: ${insertBefore ? '4px 0' : '4px 0'};
      box-shadow: 0 2px 4px rgba(99, 102, 241, 0.3);
      transition: all 0.2s ease;
      pointer-events: none;
    `;

    if (insertBefore) {
      targetRow.parentNode.insertBefore(placeholder, targetRow);
    } else {
      targetRow.parentNode.insertBefore(placeholder, targetRow.nextSibling);
    }
  }

  /**
   * 移除插入位置占位符
   * @private
   */
  _removeInsertPlaceholder() {
    document.querySelectorAll('.drag-placeholder').forEach(el => el.remove());
  }

  /**
   * 清理拖拽状态
   * @private
   */
  _cleanup() {
    // 移除所有拖拽样式
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    document.querySelectorAll('.dragging').forEach(el => {
      el.classList.remove('dragging');
    });

    this._removeInsertPlaceholder();

    // 重置状态
    this.dragState.isDragging = false;
    this.dragState.draggedItem = null;
    this.dragState.draggedElement = null;
    this.dragState.draggedType = null;
    this.dragState.dragData = null;
  }

  /**
   * 检查是否正在拖拽
   * @returns {boolean}
   */
  isDragging() {
    return this.dragState.isDragging;
  }

  /**
   * 获取当前拖拽的项目
   * @returns {Object|null}
   */
  getDraggedItem() {
    return this.dragState.draggedItem;
  }

  /**
   * 检查是否正在调整侧边栏
   * @returns {boolean}
   */
  isResizingSidebar() {
    return this.sidebarState.isResizing;
  }
}

// 创建单例实例
const dragDropManager = new DragDropManager();

export default dragDropManager;
