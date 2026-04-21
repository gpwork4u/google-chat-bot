// content.js — runs on chat.google.com (isolated world, document_start).
//
// Responsibilities:
//   1. Inject inject-main.js into the page's MAIN world (for network hooks).
//   2. Relay MAIN-world network/debug events to localhost:8080.
//   3. Poll backend for approved drafts and ask the MAIN-world helper to send
//      them through Chat's private create_topic request path.

const BACKEND = 'http://localhost:8080';
const log = (...a) => console.log('[chat-agent]', ...a);
const warn = (...a) => console.warn('[chat-agent]', ...a);

async function debug(stage, data = {}) {
  try {
    await fetch(`${BACKEND}/api/ext/debug`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stage, data }),
    });
  } catch {}
}

const inFlightDrafts = new Set();

// --- 1. Inject MAIN-world hook script ASAP --------------------------------
try {
  const s = document.createElement('script');
  s.src = chrome.runtime.getURL('inject-main.js');
  s.onload = () => s.remove();
  (document.head || document.documentElement).appendChild(s);
  log('inject-main.js appended');
} catch (e) {
  warn('inject failed', e);
}

log('content script active @', location.href);
debug('content_loaded', { href: location.href });

// --- 2. Relay MAIN-world network events to backend ------------------------
window.addEventListener('chat-agent-net', async (ev) => {
  try {
    const d = ev.detail || {};
    await fetch(`${BACKEND}/api/ext/raw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind: d.kind, url: d.url, data: d.data }),
    });
  } catch (e) {
    // Network errors are fine to drop; instrumentation is best-effort.
  }
});

async function reportSent(draftId, success, errMsg) {
  try {
    await fetch(`${BACKEND}/api/ext/sent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft_id: draftId, success, error: errMsg || '' }),
    });
  } catch (e) {
    warn('sent report failed', e);
  }
}

window.addEventListener('message', async (ev) => {
  if (ev.source !== window) return;
  const data = ev.data || {};
  if (data.source !== 'chat-agent-main') return;

  if (data.type === 'debug') {
    debug(data.stage || 'main_debug', data.data || {});
    return;
  }

  if (data.type !== 'send-result') return;

  const draftId = Number(data.draftId || 0);
  if (draftId > 0) {
    inFlightDrafts.delete(draftId);
  }
  await reportSent(draftId, !!data.ok, data.error || '');
  debug('content_send_result', {
    draftId,
    ok: !!data.ok,
    error: data.error || '',
  });
});

function dispatchSendRequest(item) {
  const draftId = Number(item?.draft_id || 0);
  if (!draftId || inFlightDrafts.has(draftId)) return false;
  inFlightDrafts.add(draftId);
  window.postMessage({
    source: 'chat-agent-content',
    type: 'send-request',
    detail: {
      draftId,
      text: item.body || '',
      sendMode: item.send_mode || 'new_topic',
      spaceKey: item.space_key || '',
      threadKey: item.thread_key || '',
      spaceRef: item.space_ref || null,
    },
  }, '*');
  return true;
}

async function pollPending() {
  try {
    const res = await fetch(`${BACKEND}/api/ext/pending`);
    if (!res.ok) {
      debug('content_pending_bad_status', { status: res.status });
      return;
    }
    const { pending } = await res.json();
    const items = Array.isArray(pending) ? pending : [];
    let queued = 0;
    for (const item of items) {
      if (dispatchSendRequest(item)) queued += 1;
    }
    debug('content_pending_polled', { count: items.length, queued });
  } catch (e) {
    debug('content_poll_exception', { error: String(e?.message || e) });
  }
}

pollPending();
setInterval(pollPending, 5000);
