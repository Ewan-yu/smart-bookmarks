/**
 * FolderDialogManager - 文件夹对话框管理模块
 *
 * 负责处理：
 * - 合并文件夹对话框
 * - 删除文件夹对话框
 * - 添加子文件夹对话框
 * - 重命名文件夹对话框
 */

import { createInputDialog, createSelectDialog } from '../utils/dialog-builder.js';
import { ConfirmDialog } from '../../ui/components.js';
import { escapeHtml } from '../utils/helpers.js';
import { Toast } from '../../ui/components.js';
import eventBus, { Events } from '../utils/event-bus.js';

export class FolderDialogManager {
  /**
   * @param {Object} state - 应用状态对象
   * @param {Function} loadBookmarksCallback - 加载书签的回调函数
   */
  constructor(state, loadBookmarksCallback) {
    this.state = state;
    this.loadBookmarks = loadBookmarksCallback;
  }

  /**
   * 显示合并文件夹对话框
   * @param {Object} sourceFolder - 源文件夹对象
   */
  async showMerge(sourceFolder) {
    // 获取所有同级文件夹作为目标选项
    const siblings = this.state.bookmarks.filter(bm =>
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
      const childCount = this.state.bookmarks.filter(bm => bm.parentCategoryId === folder.id).length;
      return {
        value: folder.id,
        label: `📁 ${folder.title}`,
        description: `${childCount} 项内容`
      };
    });

    return new Promise((resolve, reject) => {
      createSelectDialog({
        title: '合并文件夹',
        message: `将 <strong>${escapeHtml(sourceFolder.title)}</strong> 合并到：`,
        items: items,
        confirmText: '合并',
        onConfirm: async (targetId) => {
          try {
            const targetFolder = siblings.find(f => f.id === targetId);

            const response = await chrome.runtime.sendMessage({
              type: 'MERGE_FOLDERS',
              sourceId: sourceFolder.id,
              targetId: targetId
            });

            if (response.error) throw new Error(response.error);

            Toast.success(`已将 ${sourceFolder.title} 合并到 ${targetFolder.title}`);
            await this.loadBookmarks();

            // 发送文件夹合并事件
            eventBus.emit(Events.FOLDER_MERGED, {
              sourceId: sourceFolder.id,
              targetId: targetId
            });

            resolve({ success: true, sourceId: sourceFolder.id, targetId });
          } catch (error) {
            Toast.error(`合并失败: ${error.message}`);
            reject(error);
          }
        }
      });
    });
  }

  /**
   * 显示删除文件夹对话框
   * @param {Object} folder - 文件夹对象
   */
  async showDelete(folder) {
    // 计算子项数量
    const childBookmarks = this.state.bookmarks.filter(bm => bm.parentCategoryId === folder.id);
    const childFolders = this.state.bookmarks.filter(bm => bm.type === 'folder' && bm.parentId === folder.id);
    const totalChildren = childBookmarks.length + childFolders.length;

    const message = totalChildren > 0
      ? `删除 "${escapeHtml(folder.title)}" 后，其中的 ${totalChildren} 项内容将移动到上级文件夹。确定要删除吗？`
      : `确定要删除 "${escapeHtml(folder.title)}" 吗？`;

    return new Promise((resolve, reject) => {
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
            await this.loadBookmarks();

            // 发送文件夹删除事件
            eventBus.emit(Events.FOLDER_DELETED, {
              folderId: folder.id,
              movedCount: response.movedCount
            });

            resolve({ success: true, folderId: folder.id, movedCount: response.movedCount });
          } catch (error) {
            console.error('Delete folder failed:', error);
            Toast.error(`删除失败: ${error.message}`);
            reject(error);
          }
        }
      });

      dialog.show();
    });
  }

  /**
   * 显示添加子文件夹对话框
   * @param {Object} parentFolder - 父文件夹对象
   */
  async showAddSub(parentFolder) {
    return new Promise((resolve, reject) => {
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
          try {
            const response = await chrome.runtime.sendMessage({
              type: 'CREATE_CATEGORY',
              name: name,
              parentId: parentFolder.id
            });

            if (response.error) throw new Error(response.error);

            Toast.success('文件夹已创建');
            await this.loadBookmarks();

            // 发送文件夹创建事件
            eventBus.emit(Events.FOLDER_CREATED, {
              folderId: response.id,
              parentId: parentFolder.id,
              name: name
            });

            resolve({ success: true, folderId: response.id, name });
          } catch (error) {
            Toast.error(`创建失败: ${error.message}`);
            reject(error);
          }
        }
      });
    });
  }

  /**
   * 显示重命名文件夹对话框
   * @param {Object} folder - 文件夹对象
   */
  async showRename(folder) {
    return new Promise((resolve, reject) => {
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
        onConfirm: async (newName) => {
          try {
            const response = await chrome.runtime.sendMessage({
              type: 'RENAME_CATEGORY',
              categoryId: folder.id,
              newName: newName
            });

            if (response.error) throw new Error(response.error);

            Toast.success('文件夹已重命名');
            await this.loadBookmarks();

            // 发送文件夹重命名事件
            eventBus.emit(Events.FOLDER_RENAMED, {
              folderId: folder.id,
              oldName: folder.title,
              newName: newName
            });

            resolve({ success: true, folderId: folder.id, newName });
          } catch (error) {
            Toast.error(`重命名失败: ${error.message}`);
            reject(error);
          }
        }
      });
    });
  }
}

export default FolderDialogManager;
