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
