const BACKEND = 'http://localhost:8090';
const statusEl = document.getElementById('status');
const autoEl = document.getElementById('auto');

// ─── Sync History elements ───────────────────────────────────────────────────
const syncAllBtn = document.getElementById('sync-all');
const syncCurrentBtn = document.getElementById('sync-current');
const syncProgressEl = document.getElementById('sync-progress');
const syncToastEl = document.getElementById('sync-toast');

// ─── Backend health / settings ───────────────────────────────────────────────

async function refresh() {
  try {
    const res = await fetch(`${BACKEND}/api/settings`);
    if (!res.ok) {
      throw new Error(`${res.status}`);
    }
    const s = await res.json();
    autoEl.checked = !!s.AutoMode;
    statusEl.className = 'status ok';
    statusEl.innerText = '後端已連線';
  } catch (e) {
    statusEl.className = 'status err';
    statusEl.innerText = '後端沒啟動？（localhost:8090）';
  }
}

autoEl.addEventListener('change', async () => {
  await fetch(`${BACKEND}/api/settings/auto-mode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auto_mode: autoEl.checked }),
  });
});

// ─── Current-tab detection ───────────────────────────────────────────────────

async function detectCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const isChat = tab?.url?.startsWith('https://chat.google.com');
    if (isChat) {
      syncCurrentBtn.style.display = 'block';
      syncCurrentBtn._tabId = tab.id;
      syncCurrentBtn._tabUrl = tab.url;
    }
  } catch (e) {
    // Non-fatal: current tab detection is best-effort
  }
}

// ─── Space key extraction ────────────────────────────────────────────────────

function parseSpaceKey(url) {
  if (!url) return null;
  const m = url.match(/[/#]room\/([^/?#]+)/);
  return m ? `spaces/${m[1]}` : null;
}

// ─── Sync progress UI ────────────────────────────────────────────────────────

let pollInterval = null;

function showProgress(text) {
  syncProgressEl.textContent = text;
  syncProgressEl.className = 'sync-progress visible';
  syncToastEl.className = 'sync-toast';
}

function hideProgress() {
  syncProgressEl.className = 'sync-progress';
  syncProgressEl.textContent = '';
}

function showToast(text, type) {
  syncToastEl.textContent = text;
  syncToastEl.className = `sync-toast visible ${type}`;
}

function setSyncButtonsDisabled(disabled) {
  syncAllBtn.disabled = disabled;
  syncCurrentBtn.disabled = disabled;
}

function clearPollInterval() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── Polling ─────────────────────────────────────────────────────────────────

async function pollStatus(jobId) {
  try {
    const res = await fetch(`${BACKEND}/api/extension/sync-history/status?job_id=${encodeURIComponent(jobId)}`);
    if (!res.ok) return;
    const data = await res.json();

    const synced = data.total_synced ?? data.inserted ?? 0;
    const dups = data.duplicates ?? 0;

    if (data.status === 'completed') {
      clearPollInterval();
      hideProgress();
      showToast(`同步完成 (${synced} 新增 / ${dups} 重複)`, 'ok');
      setSyncButtonsDisabled(false);
      await chrome.storage.local.remove('lastSyncJobId');
      return;
    }

    if (data.status === 'failed') {
      clearPollInterval();
      hideProgress();
      showToast('同步失敗，請重試', 'err');
      setSyncButtonsDisabled(false);
      await chrome.storage.local.remove('lastSyncJobId');
      return;
    }

    // Still running
    showProgress(`同步中... ${synced} 新增（${dups} 重複）`);
  } catch (e) {
    // Network error — keep polling
  }
}

function startPolling(jobId) {
  clearPollInterval();
  pollInterval = setInterval(() => pollStatus(jobId), 2000);
  // Immediate first poll
  pollStatus(jobId);
}

// ─── Start sync job ───────────────────────────────────────────────────────────

async function startSync(spaceKey) {
  const jobId = crypto.randomUUID();

  // Persist job_id so we can resume if popup reopens during sync
  await chrome.storage.local.set({ lastSyncJobId: jobId });

  setSyncButtonsDisabled(true);
  showProgress('啟動同步中...');
  hideToast();

  try {
    // POST to backend to create job
    const body = { job_id: jobId };
    if (spaceKey) body.space_key = spaceKey;

    const startRes = await fetch(`${BACKEND}/api/extension/sync-history/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!startRes.ok) {
      throw new Error(`start failed: ${startRes.status}`);
    }

    // Fire-and-forget to content script to begin scanning
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const msgBody = { type: 'sync-history-scan', job_id: jobId };
        if (spaceKey) msgBody.space_key = spaceKey;
        chrome.tabs.sendMessage(tab.id, msgBody).catch(() => {
          // If no content script on current tab, that's OK — backend job still runs
        });
      }
    } catch (e) {
      // Non-fatal: scan trigger is best-effort
    }

    // Begin polling for status
    startPolling(jobId);
  } catch (e) {
    clearPollInterval();
    hideProgress();
    showToast('同步失敗，請重試', 'err');
    setSyncButtonsDisabled(false);
    await chrome.storage.local.remove('lastSyncJobId');
  }
}

function hideToast() {
  syncToastEl.className = 'sync-toast';
  syncToastEl.textContent = '';
}

// ─── Button handlers ──────────────────────────────────────────────────────────

syncAllBtn.addEventListener('click', () => {
  startSync(null);
});

syncCurrentBtn.addEventListener('click', () => {
  const url = syncCurrentBtn._tabUrl;
  const spaceKey = parseSpaceKey(url);
  startSync(spaceKey);
});

// ─── Resume polling on popup open ────────────────────────────────────────────

async function resumeIfRunning() {
  try {
    const { lastSyncJobId } = await chrome.storage.local.get('lastSyncJobId');
    if (!lastSyncJobId) return;

    // Check if the job is still running
    const res = await fetch(`${BACKEND}/api/extension/sync-history/status?job_id=${encodeURIComponent(lastSyncJobId)}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.status === 'running' || data.status === 'pending') {
      setSyncButtonsDisabled(true);
      showProgress('同步進行中，恢復進度...');
      startPolling(lastSyncJobId);
    } else {
      // Job finished while popup was closed — clean up
      await chrome.storage.local.remove('lastSyncJobId');
    }
  } catch (e) {
    // Non-fatal
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

refresh();
detectCurrentTab();
resumeIfRunning();
