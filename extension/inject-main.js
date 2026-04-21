// inject-main.js — runs in chat.google.com's MAIN world at document_start.
//
// Hooks fetch, XMLHttpRequest, and WebSocket so we can observe the raw wire
// traffic between Chat's frontend SPA and Google's backend. Events are
// dispatched out through CustomEvents to the isolated-world content script,
// which forwards them to localhost:8080/api/ext/raw for offline analysis.

(function () {
  const URL_FILTERS = [
    /\/webchannel\//,            // BrowserChannel long poll — new messages stream here
    /\/api\//,                   // misc REST
    /messages/i,
    /chat\.google\.com/,
    /\/DynamiteWebUi\/data\//,   // batchexecute RPCs (browse spaces etc.)
    /\/batchexecute/,            // catch absolute-path variants too
  ];
  const MAX_BODY = 50000;
  const CREATE_TOPIC_PATH = /\/api\/create_topic(?:\?|$)/;
  const CREATE_MESSAGE_PATH = /\/api\/create_message(?:\?|$)/;
  const API_COUNTER_RE = /[?&]c=(\d+)/;
  const DEFAULT_PREFS = [
    null, null, null, null, 2, 2, null, 2, 2, 2, 2, null, null, null, null, 2, 2, 2, 2, 2,
    2, 2, 2, 2, 2, 2, 2, 2, 2, null, null, 2, 2, null, null, null, 2, 2, null, null, null,
    null, 2, 2, 2, 2, null, 2, null, null, 2, null, 2, 2, 2, 2, null, 2, null, 2, 2, null,
    null, null, 2, 2,
  ];

  const state = {
    accountBase: '/u/0',
    apiCounter: 0,
    requestFooter: null,
    requestHeaders: null,
    lastCreateTopicTemplate: null,
    lastCreateMessageTemplate: null,
    lastObservedCreateTopicSpaceRef: null,
  };

  function matchesFilter(url) {
    if (!url) return false;
    return URL_FILTERS.some((re) => re.test(url));
  }

  function emit(kind, url, data) {
    try {
      window.dispatchEvent(
        new CustomEvent('chat-agent-net', { detail: { kind, url, data } })
      );
    } catch (e) {
      // Event dispatch should never fail; swallow to avoid breaking the page.
    }
  }

  function emitDebug(stage, data) {
    try {
      window.postMessage({
        source: 'chat-agent-main',
        type: 'debug',
        stage,
        data,
      }, '*');
    } catch {}
  }

  function truncate(s) {
    if (typeof s !== 'string') return s;
    return s.length > MAX_BODY ? s.slice(0, MAX_BODY) + '…[truncated]' : s;
  }

  function headersToObject(headersLike) {
    const out = {};
    if (!headersLike) return out;

    try {
      if (headersLike instanceof Headers) {
        headersLike.forEach((value, key) => {
          out[String(key).toLowerCase()] = String(value);
        });
        return out;
      }
    } catch {}

    if (Array.isArray(headersLike)) {
      for (const pair of headersLike) {
        if (!Array.isArray(pair) || pair.length < 2) continue;
        out[String(pair[0]).toLowerCase()] = String(pair[1]);
      }
      return out;
    }

    if (typeof headersLike === 'object') {
      for (const [key, value] of Object.entries(headersLike)) {
        out[String(key).toLowerCase()] = String(value);
      }
    }
    return out;
  }

  function redactHeaders(headersObj) {
    const out = {};
    for (const [key, value] of Object.entries(headersObj || {})) {
      const k = String(key).toLowerCase();
      if (k === 'authorization') {
        const m = String(value).match(/^(\S+)\s+(.+)$/);
        if (m) {
          const token = m[2];
          out[k] = `${m[1]} ${token.slice(0, 12)}...(${token.length} chars)`;
        } else {
          out[k] = '[present]';
        }
        continue;
      }
      if (k === 'cookie' || k === 'set-cookie' || k === 'x-goog-authuser') {
        out[k] = '[present]';
        continue;
      }
      out[k] = value;
    }
    return out;
  }

  function shouldCaptureAuth(url, headersObj) {
    const normalizedURL = String(url || '');
    if (/googleapis\.com/i.test(normalizedURL)) return true;
    if (/chat\.google\.com/i.test(normalizedURL)) return true;
    return !!headersObj.authorization;
  }

  // Emit the full auth token (unredacted) to the isolated-world content
  // script so it can forward to the backend. Dedup: only re-emit when one of
  // the tracked values actually changes, to avoid flooding the WS.
  let lastTokenFingerprint = '';
  function maybeEmitToken(url, headersObj) {
    if (!headersObj) return;
    const authorization = headersObj.authorization || '';
    const xsrf = headersObj['x-framework-xsrf-token'] || '';
    const authuser = headersObj['x-goog-authuser'] || '';
    if (!authorization && !xsrf) return;
    const fp = authorization + '|' + xsrf + '|' + authuser;
    if (fp === lastTokenFingerprint) return;
    lastTokenFingerprint = fp;
    try {
      window.dispatchEvent(new CustomEvent('chat-agent-token', {
        detail: {
          authorization,
          x_framework_xsrf_token: xsrf,
          x_goog_authuser: authuser,
          for_url: url,
          observed_at: new Date().toISOString(),
        },
      }));
    } catch (e) {
      // event dispatch should never fail; swallow
    }
  }

  function cloneJSON(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function randomTopicKey(length = 11) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    let out = '';
    for (let i = 0; i < length; i += 1) {
      out += alphabet[buf[i] % alphabet.length];
    }
    return out;
  }

  function randomMessageKey() {
    return randomTopicKey();
  }

  function updateRequestState(url, body, headersObj) {
    if (!url) return;

    const baseMatch = String(url).match(/(\/u\/\d+)\//);
    if (baseMatch) {
      state.accountBase = baseMatch[1];
    }

    const counterMatch = String(url).match(API_COUNTER_RE);
    if (counterMatch) {
      const n = Number(counterMatch[1]);
      if (Number.isFinite(n) && n > state.apiCounter) {
        state.apiCounter = n;
      }
    }

    if (typeof body !== 'string' || !body.trim().startsWith('[')) {
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      return;
    }
    if (!Array.isArray(parsed)) return;

    const footer = parsed[parsed.length - 1];
    if (Array.isArray(footer) && footer.length >= 4 && typeof footer[0] === 'string') {
      state.requestFooter = cloneJSON(footer);
    }

    const headers = headersObj || {};
    if (/\/api\//.test(String(url)) && headers['x-framework-xsrf-token']) {
      state.requestHeaders = {
        'accept-language': headers['accept-language'] || navigator.language || 'en',
        'x-framework-xsrf-token': headers['x-framework-xsrf-token'],
      };
    }

    if (CREATE_TOPIC_PATH.test(url)) {
      if (Array.isArray(parsed[4])) {
        state.lastObservedCreateTopicSpaceRef = cloneJSON(parsed[4]);
      }
      state.lastCreateTopicTemplate = cloneJSON(parsed);
      emitDebug('main_template_updated', {
        kind: 'create_topic',
        url,
        bodyPreview: String(body || '').slice(0, 160),
      });
    }

    if (CREATE_MESSAGE_PATH.test(url)) {
      if (Array.isArray(parsed[0]?.[3]?.[2])) {
        state.lastObservedCreateTopicSpaceRef = cloneJSON(parsed[0][3][2]);
      }
      state.lastCreateMessageTemplate = cloneJSON(parsed);
      emitDebug('main_template_updated', {
        kind: 'create_message',
        url,
        bodyPreview: String(body || '').slice(0, 160),
      });
    }
  }

  function nextApiCounter() {
    state.apiCounter += 1;
    return state.apiCounter;
  }

  function buildFooter() {
    if (Array.isArray(state.requestFooter)) {
      const footer = cloneJSON(state.requestFooter);
      footer[0] = String(Math.trunc((Math.random() - 0.5) * 9e18));
      return footer;
    }
    return [String(Math.trunc((Math.random() - 0.5) * 9e18)), 3, 1, navigator.language || 'en', DEFAULT_PREFS];
  }

  function buildSpaceRef(spaceKey, providedSpaceRef) {
    if (Array.isArray(providedSpaceRef)) {
      return cloneJSON(providedSpaceRef);
    }

    if (Array.isArray(state.lastObservedCreateTopicSpaceRef)) {
      return cloneJSON(state.lastObservedCreateTopicSpaceRef);
    }

    const raw = String(spaceKey || '').trim();
    if (!raw) return null;
    const parts = raw.split(':');
    const spaceId = parts.length > 1 ? parts.slice(1).join(':') : raw;
    if (!spaceId) return null;
    return [[spaceId]];
  }

  function extractSpaceID(spaceKey, providedSpaceRef) {
    if (Array.isArray(providedSpaceRef)) {
      if (typeof providedSpaceRef?.[0]?.[0] === 'string' && providedSpaceRef[0][0]) {
        return providedSpaceRef[0][0];
      }
      if (typeof providedSpaceRef?.[2]?.[0] === 'string' && providedSpaceRef[2][0]) {
        return providedSpaceRef[2][0];
      }
    }
    if (Array.isArray(state.lastObservedCreateTopicSpaceRef)) {
      const ref = state.lastObservedCreateTopicSpaceRef;
      if (typeof ref?.[0]?.[0] === 'string' && ref[0][0]) {
        return ref[0][0];
      }
      if (typeof ref?.[2]?.[0] === 'string' && ref[2][0]) {
        return ref[2][0];
      }
    }

    const raw = String(spaceKey || '').trim();
    if (!raw) return '';
    const parts = raw.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : raw;
  }

  function buildCreateTopicPayload(detail) {
    const text = String(detail?.text || '');
    const sourceThreadKey = String(detail?.threadKey || '');
    const requestThreadKey = randomTopicKey();
    const spaceRef = buildSpaceRef(detail?.spaceKey, detail?.spaceRef);
    if (!text) throw new Error('text required');
    if (!spaceRef) throw new Error('space ref required');

    let payload;
    if (Array.isArray(state.lastCreateTopicTemplate)) {
      payload = cloneJSON(state.lastCreateTopicTemplate);
    } else {
      payload = [];
    }

    const minLength = 105;
    if (payload.length < minLength) {
      payload.length = minLength;
    }
    for (let i = 0; i < payload.length; i += 1) {
      if (typeof payload[i] === 'undefined') payload[i] = null;
    }

    payload[0] = null;
    payload[1] = text;
    payload[2] = null; // plain text for now; preview metadata can be added later if needed
    payload[3] = null;
    payload[4] = spaceRef;
    payload[5] = [1];
    payload[6] = requestThreadKey;
    payload[7] = 1;
    payload[8] = [1];
    payload[payload.length - 1] = buildFooter();
    return { payload, requestThreadKey, sourceThreadKey };
  }

  function buildCreateMessagePayload(detail) {
    const text = String(detail?.text || '');
    const sourceThreadKey = String(detail?.threadKey || '');
    const requestMessageKey = randomMessageKey();
    const spaceRef = buildSpaceRef(detail?.spaceKey, detail?.spaceRef);
    if (!text) throw new Error('text required');
    if (!spaceRef) throw new Error('space ref required');
    if (!sourceThreadKey) throw new Error('thread key required');

    // create_message is sensitive to field positions. Normalize to the compact
    // shape observed in successful manual replies instead of reusing any
    // captured template with extra trailing null slots.
    const payload = new Array(100).fill(null);

    payload[0] = [null, null, null, [null, sourceThreadKey, spaceRef]];
    payload[1] = text;
    payload[2] = null;
    payload[3] = null;
    payload[4] = null;
    payload[5] = requestMessageKey;
    payload[6] = [1];
    payload[7] = [1];
    payload[99] = buildFooter();
    return { payload, requestMessageKey, sourceThreadKey };
  }

  function sendCreateTopic(detail) {
    const { payload, requestThreadKey, sourceThreadKey } = buildCreateTopicPayload(detail);
    const url = `${state.accountBase}/api/create_topic?c=${nextApiCounter()}`;
    const spaceID = extractSpaceID(detail?.spaceKey, detail?.spaceRef);
    emitDebug('main_send_create_topic', {
      draftId: detail?.draftId,
      url,
      spaceKey: detail?.spaceKey,
      spaceID,
      sourceThreadKey,
      requestThreadKey,
      payloadPreview: JSON.stringify(payload).slice(0, 240),
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (state.requestHeaders?.['accept-language']) {
        xhr.setRequestHeader('Accept-Language', state.requestHeaders['accept-language']);
      }
      if (state.requestHeaders?.['x-framework-xsrf-token']) {
        xhr.setRequestHeader('X-Framework-Xsrf-Token', state.requestHeaders['x-framework-xsrf-token']);
      }
      if (spaceID) {
        xhr.setRequestHeader('X-Goog-Chat-Space-Id', spaceID);
      }
      xhr.onload = function () {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          reject(new Error(`create_topic failed: ${xhr.status} ${truncate(String(xhr.responseText || ''))}`));
          return;
        }
        resolve({
          status: xhr.status,
          responseText: String(xhr.responseText || ''),
          url,
        });
      };
      xhr.onerror = function () {
        emitDebug('main_send_network_error', { draftId: detail?.draftId, url });
        reject(new Error('create_topic network error'));
      };
      const reqBody = JSON.stringify(payload);
      xhr.send(reqBody);
    });
  }

  function sendCreateMessage(detail) {
    const { payload, requestMessageKey, sourceThreadKey } = buildCreateMessagePayload(detail);
    const url = `${state.accountBase}/api/create_message?c=${nextApiCounter()}`;
    const spaceID = extractSpaceID(detail?.spaceKey, detail?.spaceRef);
    emitDebug('main_send_create_message', {
      draftId: detail?.draftId,
      url,
      spaceKey: detail?.spaceKey,
      spaceID,
      sourceThreadKey,
      requestMessageKey,
      payloadPreview: JSON.stringify(payload).slice(0, 240),
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      if (state.requestHeaders?.['accept-language']) {
        xhr.setRequestHeader('Accept-Language', state.requestHeaders['accept-language']);
      }
      if (state.requestHeaders?.['x-framework-xsrf-token']) {
        xhr.setRequestHeader('X-Framework-Xsrf-Token', state.requestHeaders['x-framework-xsrf-token']);
      }
      if (spaceID) {
        xhr.setRequestHeader('X-Goog-Chat-Space-Id', spaceID);
      }
      xhr.onload = function () {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          reject(new Error(`create_message failed: ${xhr.status} ${truncate(String(xhr.responseText || ''))}`));
          return;
        }
        resolve({
          status: xhr.status,
          responseText: String(xhr.responseText || ''),
          url,
        });
      };
      xhr.onerror = function () {
        emitDebug('main_send_network_error', { draftId: detail?.draftId, url, mode: 'reply_thread' });
        reject(new Error('create_message network error'));
      };
      xhr.send(JSON.stringify(payload));
    });
  }

  async function handleSendRequest(detail) {
    const draftId = detail?.draftId;
    const sendMode = detail?.sendMode || 'new_topic';
    emitDebug('main_handle_send_request', {
      draftId,
      sendMode,
      spaceKey: detail?.spaceKey,
      sourceThreadKey: detail?.threadKey,
      hasTopicTemplate: Array.isArray(state.lastCreateTopicTemplate),
      hasMessageTemplate: Array.isArray(state.lastCreateMessageTemplate),
      hasFooter: Array.isArray(state.requestFooter),
      apiCounter: state.apiCounter,
    });
    try {
      const result = sendMode === 'reply_thread'
        ? await sendCreateMessage(detail)
        : await sendCreateTopic(detail);
      window.dispatchEvent(new CustomEvent('chat-agent-send-result', {
        detail: { ok: true, draftId, result },
      }));
      window.postMessage({
        source: 'chat-agent-main',
        type: 'send-result',
        ok: true,
        draftId,
        result,
      }, '*');
    } catch (error) {
      window.dispatchEvent(new CustomEvent('chat-agent-send-result', {
        detail: { ok: false, draftId, error: String(error?.message || error) },
      }));
      window.postMessage({
        source: 'chat-agent-main',
        type: 'send-result',
        ok: false,
        draftId,
        error: String(error?.message || error),
      }, '*');
    }
  }

  window.addEventListener('message', async (ev) => {
    if (ev.source !== window) return;
    const data = ev.data || {};
    if (data.source !== 'chat-agent-content' || data.type !== 'send-request') return;
    emitDebug('main_postmessage_received', { draftId: data.detail?.draftId });
    await handleSendRequest(data.detail || {});
  });

  // --- fetch --------------------------------------------------------------
  const _fetch = window.fetch;
  window.fetch = async function (input, init) {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method =
      (init && init.method) ||
      (input instanceof Request ? input.method : 'GET') ||
      'GET';
    let reqBody = '';
    if (init && init.body) {
      reqBody = typeof init.body === 'string' ? init.body : '[non-string-body]';
    }
    const requestHeaders = headersToObject(
      (init && init.headers) ||
      (input instanceof Request ? input.headers : null)
    );
    updateRequestState(url, reqBody, requestHeaders);
    let resp;
    try {
      resp = await _fetch.apply(this, arguments);
    } catch (e) {
      if (matchesFilter(url)) {
        emit('fetch-error', url, { method, reqBody: truncate(reqBody), error: String(e) });
      }
      throw e;
    }
    if (matchesFilter(url)) {
      try {
        const clone = resp.clone();
        const respText = await clone.text();
        emit('fetch', url, {
          method,
          headers: redactHeaders(requestHeaders),
          status: resp.status,
          reqBody: truncate(reqBody),
          respText: truncate(respText),
        });
      } catch {}
    }
    if (shouldCaptureAuth(url, requestHeaders)) {
      emit('auth-observed', url, {
        via: 'fetch',
        method,
        headers: redactHeaders(requestHeaders),
        status: resp?.status || 0,
      });
      maybeEmitToken(url, requestHeaders);
    }
    return resp;
  };

  // --- XHR ----------------------------------------------------------------
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  const _setRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__chatAgent = { method, url, headers: {} };
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    if (!this.__chatAgent) this.__chatAgent = { headers: {} };
    if (!this.__chatAgent.headers) this.__chatAgent.headers = {};
    this.__chatAgent.headers[String(name).toLowerCase()] = String(value);
    return _setRequestHeader.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function (body) {
    const meta = this.__chatAgent || {};
    updateRequestState(meta.url, typeof body === 'string' ? body : '', meta.headers || {});
    if (matchesFilter(meta.url)) {
      const onLoad = () => {
        let respText = '';
        try {
          respText = String(this.responseText || '');
        } catch {}
        emit('xhr', meta.url, {
          method: meta.method,
          headers: redactHeaders(meta.headers || {}),
          status: this.status,
          reqBody: truncate(typeof body === 'string' ? body : '[non-string-body]'),
          respText: truncate(respText),
        });
      };
      this.addEventListener('load', onLoad);
      this.addEventListener('error', () => {
        emit('xhr-error', meta.url, { method: meta.method });
      });

      // BrowserChannel long-poll: the 'load' event only fires when the whole
      // session ends, which can be minutes. New Chat messages arrive as
      // streamed chunks inside responseText before load. We hook
      // readystatechange (state 3 = LOADING) to pull the new bytes and cut
      // them along BrowserChannel's length-prefixed frame format.
      if (/\/webchannel\/events/i.test(String(meta.url))) {
        this.__chatAgentChunkCursor = 0;
        this.__chatAgentChunkBuffer = '';
        const pumpWebchannel = () => {
          let txt = '';
          try {
            txt = String(this.responseText || '');
          } catch {
            return;
          }
          if (txt.length <= this.__chatAgentChunkCursor) return;
          const fresh = txt.slice(this.__chatAgentChunkCursor);
          this.__chatAgentChunkCursor = txt.length;
          this.__chatAgentChunkBuffer += fresh;
          // Strip any leading )]}' XSSI prefix once.
          if (this.__chatAgentChunkBuffer.startsWith(")]}'")) {
            this.__chatAgentChunkBuffer = this.__chatAgentChunkBuffer.slice(4).replace(/^\s+/, '');
          }
          while (true) {
            const nl = this.__chatAgentChunkBuffer.indexOf('\n');
            if (nl < 0) return;
            const header = this.__chatAgentChunkBuffer.slice(0, nl).trim();
            const n = Number(header);
            if (!Number.isFinite(n) || n <= 0) {
              // unrecognizable header; drop a line and try again
              this.__chatAgentChunkBuffer = this.__chatAgentChunkBuffer.slice(nl + 1);
              continue;
            }
            // header counts chars in the body. If we don't have enough yet, wait for more.
            if (this.__chatAgentChunkBuffer.length < nl + 1 + n) return;
            const payload = this.__chatAgentChunkBuffer.slice(nl + 1, nl + 1 + n);
            this.__chatAgentChunkBuffer = this.__chatAgentChunkBuffer.slice(nl + 1 + n);
            let parsed;
            try {
              parsed = JSON.parse(payload);
            } catch {
              // keep going with next frame
              continue;
            }
            emit('webchannel-frame', meta.url, {
              method: meta.method,
              frame: parsed,
            });
          }
        };
        this.addEventListener('readystatechange', () => {
          if (this.readyState >= 3) pumpWebchannel();
        });
      }
    }
    if (shouldCaptureAuth(meta.url, meta.headers || {})) {
      emit('auth-observed', meta.url, {
        via: 'xhr',
        method: meta.method,
        headers: redactHeaders(meta.headers || {}),
      });
      maybeEmitToken(meta.url, meta.headers || {});
    }
    return _send.apply(this, arguments);
  };

  // --- WebSocket ----------------------------------------------------------
  const _WS = window.WebSocket;
  window.WebSocket = new Proxy(_WS, {
    construct(target, args) {
      const url = String(args[0] || '');
      const ws = Reflect.construct(target, args);
      if (matchesFilter(url)) {
        emit('ws-open', url, {});
        const origSend = ws.send.bind(ws);
        ws.send = function (data) {
          let s = '';
          try {
            s = typeof data === 'string' ? data : '[binary ' + (data?.byteLength || 0) + 'B]';
          } catch {}
          emit('ws-out', url, { data: truncate(s) });
          return origSend(data);
        };
        ws.addEventListener('message', (ev) => {
          let s = '';
          try {
            s = typeof ev.data === 'string' ? ev.data : '[binary ' + (ev.data?.byteLength || 0) + 'B]';
          } catch {}
          emit('ws-in', url, { data: truncate(s) });
        });
      }
      return ws;
    },
  });

  console.log('[chat-agent:net] network hooks installed');
})();
