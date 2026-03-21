/**
 * AI 分析恢复对话框模块
 * 用于显示未完成的 AI 分析任务
 */

/**
 * 显示分析恢复对话框
 * @param {Object} options - 对话框选项
 * @param {string} options.sessionTime - 会话时间
 * @param {number} options.completedBatches - 已完成批次数
 * @param {number} options.totalBatches - 总批次数
 * @param {number} options.bookmarkCount - 书签总数
 * @param {string} options.lastError - 最后的错误信息
 * @param {Function} options.onResume - 恢复分析的回调
 * @param {Function} options.onRestart - 重新开始的回调
 */
export function showAnalysisResumeDialog({ sessionTime, completedBatches, totalBatches, bookmarkCount, lastError, onResume, onRestart }) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-dialog-overlay';

  const reasonHtml = lastError
    ? `<p style="font-size:12px;color:var(--c-danger,#ef4444);margin:10px 0 0;padding:8px 10px;background:var(--c-danger-bg,#fef2f2);border-radius:6px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> 上次因错误中断：${lastError}</p>`
    : '';

  overlay.innerHTML = `
    <div class="confirm-dialog" style="max-width:440px;">
      <div class="dialog-header">
        <h2><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:6px;"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/><path d="M5 3l.75 2.25L8 6l-2.25.75L5 9l-.75-2.25L2 6l2.25-.75z"/><path d="M19 14l.75 2.25L22 17l-2.25.75L19 20l-.75-2.25L16 17l2.25-.75z"/></svg>发现未完成的分析</h2>
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
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-2px;margin-right:4px;"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>重新全量分析
        </button>
        <button class="btn btn-primary" id="aResumeResume"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block;vertical-align:-1px;margin-right:4px;"><polygon points="5 3 19 12 5 21 5 3"/></svg>续分析</button>
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
