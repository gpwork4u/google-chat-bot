// content.js — runs on chat.google.com (isolated world, document_start).
//
// Responsibilities:
//   1. Inject inject-main.js into the page's MAIN world (for network hooks).
//   2. Maintain a WebSocket to localhost:8080/ws/ext:
//      - forward MAIN-world network/debug/token events to the backend
//      - receive pending approved drafts and ask the MAIN-world helper to
//        send them through Chat's private create_topic request path.
//
// HTTP fallbacks (/api/ext/raw, /api/ext/debug, /api/ext/pending, /api/ext/sent)
// are still supported by the backend but we prefer the WS path because it
// eliminates polling latency.

const BACKEND_HTTP = 'http://localhost:8080';
const BACKEND_WS = 'ws://localhost:8080/ws/ext';
const log = (...a) => console.log('[chat-agent]', ...a);
const warn = (...a) => console.warn('[chat-agent]', ...a);

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

// --- 2. WebSocket connection ----------------------------------------------

let ws = null;
let wsReady = false;
let reconnectDelay = 500;
const RECONNECT_MAX = 15000;

// Small queue for events observed before the WS is open. Dropped after a soft
// cap to avoid unbounded growth during long outages.
const pendingOutbox = [];
const OUTBOX_CAP = 200;

function wsSend(obj) {
  if (wsReady && ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(obj));
      return true;
    } catch (e) {
      warn('ws send failed', e);
      return false;
    }
  }
  if (pendingOutbox.length < OUTBOX_CAP) {
    pendingOutbox.push(obj);
  }
  return false;
}

function flushOutbox() {
  if (!wsReady || !ws || ws.readyState !== WebSocket.OPEN) return;
  while (pendingOutbox.length > 0) {
    const m = pendingOutbox.shift();
    try {
      ws.send(JSON.stringify(m));
    } catch (e) {
      pendingOutbox.unshift(m);
      return;
    }
  }
}

function connectWS() {
  try {
    ws = new WebSocket(BACKEND_WS);
  } catch (e) {
    scheduleReconnect();
    return;
  }
  ws.addEventListener('open', () => {
    wsReady = true;
    reconnectDelay = 500;
    log('ws connected');
    wsSend({ type: 'hello', href: location.href, at: new Date().toISOString() });
    flushOutbox();
  });
  ws.addEventListener('close', () => {
    wsReady = false;
    scheduleReconnect();
  });
  ws.addEventListener('error', () => {
    // 'close' will follow; let scheduleReconnect handle backoff.
  });
  ws.addEventListener('message', onServerMessage);
}

function scheduleReconnect() {
  setTimeout(connectWS, reconnectDelay);
  reconnectDelay = Math.min(RECONNECT_MAX, Math.round(reconnectDelay * 1.7));
}

function onServerMessage(ev) {
  let msg;
  try {
    msg = JSON.parse(ev.data);
  } catch (e) {
    warn('ws bad frame', e);
    return;
  }
  if (msg.type === 'pending' && msg.pending) {
    dispatchSendRequest(msg.pending);
    return;
  }
  if (msg.type === 'refresh_spaces' && Array.isArray(msg.space_ids)) {
    for (const sid of msg.space_ids) {
      if (!sid) continue;
      window.postMessage({
        source: 'chat-agent-content',
        type: 'fetch-space',
        space_id: sid,
      }, '*');
    }
    return;
  }
  if (msg.type === 'batchexecute_sender_search' && msg.ldap) {
    window.postMessage({
      source: 'chat-agent-content',
      type: 'batchexecute-sender-search',
      ldap: msg.ldap,
      before_ms: msg.before_ms,
      page_size: msg.page_size,
    }, '*');
  }
}

connectWS();

// --- 3. Forward MAIN-world events over the WS -----------------------------

window.addEventListener('chat-agent-net', (ev) => {
  const d = ev.detail || {};
  wsSend({ type: 'raw', kind: d.kind, url: d.url, data: d.data });
});

window.addEventListener('chat-agent-token', (ev) => {
  const d = ev.detail || {};
  wsSend({ type: 'token', token: d });
});

window.addEventListener('message', (ev) => {
  if (ev.source !== window) return;
  const data = ev.data || {};
  if (data.source !== 'chat-agent-main') return;

  if (data.type === 'debug') {
    wsSend({ type: 'debug', stage: data.stage || 'main_debug', data: data.data || {} });
    return;
  }

  if (data.type === 'send-result') {
    const draftId = Number(data.draftId || 0);
    if (draftId > 0) inFlightDrafts.delete(draftId);
    wsSend({
      type: 'sent',
      draft_id: draftId,
      success: !!data.ok,
      error: data.error || '',
    });
  }
});

// --- 4. Dispatch approved drafts to the MAIN world -------------------------

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

// --- 5. HTTP fallback: if the WS is down for >30s, fall back to polling
// /api/ext/pending so approved drafts don't get stuck. Best-effort.

setInterval(async () => {
  if (wsReady) return;
  try {
    const res = await fetch(`${BACKEND_HTTP}/api/ext/pending`);
    if (!res.ok) return;
    const { pending } = await res.json();
    for (const item of (pending || [])) dispatchSendRequest(item);
  } catch (e) {
    // drop
  }
}, 30000);
