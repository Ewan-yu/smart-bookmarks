/**
 * 调试分析对话框模块
 * 用于调试 AI 分析功能
 */

import { escapeHtml } from '../utils/helpers.js';
import { Toast } from '../../ui/components.js';

/**
 * 显示调试选择对话框
 * @param {Object} options - 选项
 * @param {Array} options.bookmarks - 书签列表
 * @param {Function} options.onAnalyze - 分析回调函数
 */
export function showDebugSelectDialog({ bookmarks, onAnalyze }) {
  const dialog = document.createElement('div');
  dialog.className = 'confirm-dialog-overlay';

  // 取前 20 个书签供选择（默认勾选前 3 个）
  const candidates = bookmarks.slice(0, 20);

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
    await onAnalyze(selectedIds);
  });

  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });

  setTimeout(() => dialog.classList.add('show'), 10);
}

/**
 * 显示调试分析结果对话框
 * @param {Object} debugLog - 调试日志对象
 */
export function showDebugResultDialog(debugLog) {
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
