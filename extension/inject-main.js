// inject-main.js — runs in chat.google.com's MAIN world at document_start.
//
// Hooks fetch, XMLHttpRequest, and WebSocket so we can observe the raw wire
// traffic between Chat's frontend SPA and Google's backend. Events are
// dispatched out through CustomEvents to the isolated-world content script,
// which forwards them to localhost:8090/api/ext/raw for offline analysis.

(function () {
  const URL_FILTERS = [
    /\/webchannel\//,            // BrowserChannel long poll — new messages stream here
    /\/api\//,                   // misc REST
    /messages/i,
    /chat\.google\.com/,
    /\/DynamiteWebUi\/data\//,   // batchexecute RPCs (browse spaces etc.)
    /\/batchexecute/,            // catch absolute-path variants too
  ];
  // Cap per-request capture size. 500KB covers the larger bulk-directory
  // batchexecute RPCs (UIgx0 member mapping, jfcZG space list) that return
  // well past 50KB when the user's org has many rooms / teammates.
  const MAX_BODY = 500000;
  const CREATE_TOPIC_PATH = /\/api\/create_topic(?:\?|$)/;
  const CREATE_MESSAGE_PATH = /\/api\/create_message(?:\?|$)/;
  const UPDATE_REACTION_PATH = /\/api\/update_reaction(?:\?|$)/;
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
    // Map of "<action>|<emoji>" → captured update_reaction payload, where
    // action is "add" or "remove". add and remove have noticeably different
    // payload shapes (add carries the user-id / local-id / timestamp at
    // [1][1][4/5/7]; remove zeros them out) so we cache them separately and
    // pick the matching one at replay time.
    reactionTemplatesByKey: Object.create(null),
    // Per-emoji cache of the custom-emoji unique id at payload[1][1][8].
    reactionUniqueIDByEmoji: Object.create(null),
    // Per-emoji cache of the reaction-record UUID at payload[1][1][0]. This
    // is *not* per-request — it identifies the (message, emoji) reaction row
    // on the server and is stable across add/remove toggles, so we must
    // replay the exact value the server already knows.
    reactionUUIDByEmoji: Object.create(null),
    // Emoji catalog built from /api/get_frecent_emojis_v2 (called at Chat
    // startup). Keys: shortcode (":peepoclap:"), unicode char ("👍"), or
    // unicode alias (":thumbs-up:"). Value carries everything we need to
    // synthesize an update_reaction payload without needing a capture.
    //   custom : { type:'custom', uuid, shortcode, userId, localId, timestamp, blob }
    //   unicode: { type:'unicode', unicode, aliases }
    emojiCatalog: Object.create(null),
    // x-goog-ext-353267353-bin — Chat SPA attaches this to mutation POSTs.
    // We capture it from any observed /api/ POST so replay can re-send it.
    googExtBin: '',
    // x-client-data Chrome fingerprint header.
    xClientData: '',
    // Map of spaceID → captured spaceRef structure. We key by spaceID so that
    // sends targeting a specific space never accidentally reuse a ref from a
    // different space (that caused replies to land in the wrong conversation).
    spaceRefsByID: Object.create(null),
  };

  function spaceIDFromRef(ref) {
    if (!Array.isArray(ref)) return '';
    if (typeof ref?.[0]?.[0] === 'string' && ref[0][0]) return ref[0][0];
    if (typeof ref?.[2]?.[0] === 'string' && ref[2][0]) return ref[2][0];
    return '';
  }

  function spaceIDFromKey(spaceKey) {
    const raw = String(spaceKey || '').trim();
    if (!raw) return '';
    const parts = raw.split(':');
    return parts.length > 1 ? parts.slice(1).join(':') : raw;
  }

  function rememberSpaceRef(ref) {
    const id = spaceIDFromRef(ref);
    if (!id) return;
    state.spaceRefsByID[id] = cloneJSON(ref);
  }

  // Resolvers waiting for the SPA to send its first authenticated /api/
  // request so we can learn x-framework-xsrf-token. Used by sendGetGroup
  // (and any other helpers we add later) to avoid firing a request before
  // we have valid headers.
  const requestHeadersReady = [];

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
    // Chat SPA's own /api/ XHRs use relative URLs and carry no authorization
    // header — only xsrf + cookies. Treat xsrf alone as sufficient signal so
    // we still capture those tokens.
    if (headersObj && headersObj['x-framework-xsrf-token']) return true;
    if (/^\/u\/\d+\/api\//.test(normalizedURL)) return true;
    return !!(headersObj && headersObj.authorization);
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
    // Also surface batchexecute boq params (at / f.sid / bl) so backend can
    // drive batchexecute RPCs through the generic proxy primitive.
    let boq = { at: '', fsid: '', bl: '' };
    try { boq = readBoqParams(); } catch {}

    try {
      window.dispatchEvent(new CustomEvent('chat-agent-token', {
        detail: {
          authorization,
          x_framework_xsrf_token: xsrf,
          x_goog_authuser: authuser,
          x_goog_ext_353267353_bin: state.googExtBin || '',
          x_client_data: state.xClientData || '',
          account_base: state.accountBase || '/u/0',
          boq_at: boq.at,
          boq_fsid: boq.fsid,
          boq_bl: boq.bl,
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
      const firstTime = !state.requestHeaders?.['x-framework-xsrf-token'];
      state.requestHeaders = {
        'accept-language': headers['accept-language'] || navigator.language || 'en',
        'x-framework-xsrf-token': headers['x-framework-xsrf-token'],
      };
      if (firstTime && requestHeadersReady.length) {
        const rs = requestHeadersReady.slice();
        requestHeadersReady.length = 0;
        for (const r of rs) r();
      }
    }
    // Chat SPA attaches this opaque base64 blob on mutation POSTs (looks like
    // a client-side feature-flag set). update_reaction in particular won't
    // succeed without it. Cache the most recent value we see.
    if (typeof headers['x-goog-ext-353267353-bin'] === 'string' && headers['x-goog-ext-353267353-bin']) {
      state.googExtBin = headers['x-goog-ext-353267353-bin'];
    }
    // x-client-data is a Chrome-only experiment/finch fingerprint header
    // (base64). Some Google endpoints look at it for client identification.
    if (typeof headers['x-client-data'] === 'string' && headers['x-client-data']) {
      state.xClientData = headers['x-client-data'];
    }

    if (CREATE_TOPIC_PATH.test(url)) {
      if (Array.isArray(parsed[4])) {
        rememberSpaceRef(parsed[4]);
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
        rememberSpaceRef(parsed[0][3][2]);
      }
      state.lastCreateMessageTemplate = cloneJSON(parsed);
      emitDebug('main_template_updated', {
        kind: 'create_message',
        url,
        bodyPreview: String(body || '').slice(0, 160),
      });
    }

    if (UPDATE_REACTION_PATH.test(url)) {
      const emojiKey = parsed?.[1]?.[1]?.[2];
      const actionCode = parsed?.[2];
      const actionName = actionCode === 2 ? 'remove' : actionCode === 1 ? 'add' : '';
      if (typeof emojiKey === 'string' && emojiKey && actionName) {
        const key = `${actionName}|${emojiKey}`;
        state.reactionTemplatesByKey[key] = cloneJSON(parsed);
        const uniqueID = parsed?.[1]?.[1]?.[8];
        if (typeof uniqueID === 'string' && uniqueID) {
          state.reactionUniqueIDByEmoji[emojiKey] = uniqueID;
        }
        const uuid = parsed?.[1]?.[1]?.[0];
        if (typeof uuid === 'string' && uuid) {
          state.reactionUUIDByEmoji[emojiKey] = uuid;
        }
        emitDebug('main_template_updated', {
          kind: 'update_reaction',
          url,
          emoji: emojiKey,
          action: actionName,
          knownKeys: Object.keys(state.reactionTemplatesByKey),
          bodyPreview: String(body || '').slice(0, 240),
        });
      }
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
    const targetID = spaceIDFromKey(spaceKey);

    // 1. Caller supplied a ref — only trust it if it matches the target space
    //    (or the caller didn't give us a spaceKey to verify against).
    if (Array.isArray(providedSpaceRef)) {
      const providedID = spaceIDFromRef(providedSpaceRef);
      if (!targetID || !providedID || providedID === targetID) {
        return cloneJSON(providedSpaceRef);
      }
    }

    // 2. Reuse a previously observed ref for this exact space, if we have one.
    if (targetID && Array.isArray(state.spaceRefsByID[targetID])) {
      return cloneJSON(state.spaceRefsByID[targetID]);
    }

    // 3. Synthesize a minimal ref from the spaceKey. Never fall back to a ref
    //    from a different space (that sent replies to the wrong conversation).
    if (!targetID) return null;
    return [[targetID]];
  }

  function extractSpaceID(spaceKey, providedSpaceRef) {
    const targetID = spaceIDFromKey(spaceKey);
    if (targetID) return targetID;
    const fromProvided = spaceIDFromRef(providedSpaceRef);
    if (fromProvided) return fromProvided;
    return '';
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

  // --- emoji catalog (parsed from /api/get_frecent_emojis_v2) --------------
  //
  // Chat fetches this at startup. The response contains every emoji the user
  // has recently used, with the exact uuid/blob/user-id/local-id/timestamp
  // we need to synthesize update_reaction payloads from scratch. Parsing it
  // once gives us reaction support for every emoji in the user's frecent
  // list without needing per-emoji "tap to seed" captures.
  function parseFrecentEmojisResponse(text) {
    if (typeof text !== 'string') return [];
    const stripped = text.replace(/^\)\]\}'\s*/, '');
    try {
      const parsed = JSON.parse(stripped);
      const entries = parsed?.[0]?.[1];
      return Array.isArray(entries) ? entries : [];
    } catch {
      return [];
    }
  }

  function ingestFrecentEmojis(text) {
    const entries = parseFrecentEmojisResponse(text);
    let added = 0;
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 2) continue;
      const outer0 = entry[0];
      const outer1 = entry[1];
      if (outer0 === null && Array.isArray(outer1)) {
        // custom emoji
        const uuid = outer1[0];
        const shortcode = outer1[2];
        const userIdArr = outer1[4];
        const localIdArr = outer1[5];
        const timestamp = outer1[7];
        const blob = outer1[8];
        if (typeof shortcode === 'string' && shortcode) {
          state.emojiCatalog[shortcode] = {
            type: 'custom',
            uuid: typeof uuid === 'string' ? uuid : '',
            shortcode,
            userId: Array.isArray(userIdArr) && typeof userIdArr[0] === 'string' ? userIdArr[0] : '',
            localId: Array.isArray(localIdArr) && typeof localIdArr[0] === 'string' ? localIdArr[0] : '',
            timestamp: Number(timestamp || 0),
            blob: typeof blob === 'string' ? blob : '',
          };
          added += 1;
        }
      } else if (Array.isArray(outer0)) {
        // unicode emoji
        const unicode = outer0[0];
        const aliases = Array.isArray(outer0[1]) ? outer0[1].filter((a) => typeof a === 'string' && a) : [];
        if (typeof unicode === 'string' && unicode) {
          const item = { type: 'unicode', unicode, aliases };
          state.emojiCatalog[unicode] = item;
          for (const alias of aliases) state.emojiCatalog[alias] = item;
          added += 1;
        }
      }
    }
    if (added > 0) {
      const customKeys = Object.keys(state.emojiCatalog).filter((k) => state.emojiCatalog[k].type === 'custom');
      const unicodeChars = Object.keys(state.emojiCatalog).filter((k) => state.emojiCatalog[k].type === 'unicode' && state.emojiCatalog[k].unicode === k);
      emitDebug('main_emoji_catalog_updated', {
        added,
        totalCustom: customKeys.length,
        totalUnicode: unicodeChars.length,
        sample: customKeys.slice(0, 5).concat(unicodeChars.slice(0, 5)),
      });
      // Tell content.js to ship the catalog to the backend so the direct
      // (no-extension-XHR) /api/reactions/direct path can resolve emoji
      // without the extension being involved per-request.
      try {
        window.postMessage({
          source: 'chat-agent-main',
          type: 'emoji-catalog',
          entries: state.emojiCatalog,
        }, '*');
      } catch {}
    }
    return added;
  }

  // --- generic backend-driven XHR proxy ----------------------------------
  //
  // Backend issues `proxy_request` over WS with {req_id, url, method, headers,
  // body}; we run the XHR inside chat.google.com's origin (so Chrome integrity
  // + cookies are auto-attached) and post `proxy-result` back. The extension
  // is intentionally dumb about what the URL / payload mean.
  async function handleProxyRequest(detail) {
    const reqId = detail?.reqId;
    const url = String(detail?.url || '');
    const method = String(detail?.method || 'GET').toUpperCase();
    const headers = detail?.headers || {};
    const body = detail?.body || '';
    if (!url) {
      window.postMessage({
        source: 'chat-agent-main',
        type: 'proxy-result',
        reqId,
        ok: false,
        error: 'url required',
      }, '*');
      return;
    }
    emitDebug('main_proxy_request', { reqId, url, method, bodyLen: body.length, headerKeys: Object.keys(headers) });
    try {
      const result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        for (const [k, v] of Object.entries(headers || {})) {
          if (k && v != null) {
            try { xhr.setRequestHeader(k, String(v)); } catch {}
          }
        }
        xhr.onload = function () {
          // collect response headers (best effort; not all are exposed cross-origin)
          const respHeader = {};
          const raw = xhr.getAllResponseHeaders() || '';
          for (const line of raw.split(/\r?\n/)) {
            const idx = line.indexOf(':');
            if (idx > 0) respHeader[line.slice(0, idx).toLowerCase().trim()] = line.slice(idx + 1).trim();
          }
          resolve({ status: xhr.status, response: String(xhr.responseText || ''), respHeader });
        };
        xhr.onerror = function () { reject(new Error('proxy network error')); };
        if (body) xhr.send(typeof body === 'string' ? body : JSON.stringify(body));
        else xhr.send();
      });
      window.postMessage({
        source: 'chat-agent-main',
        type: 'proxy-result',
        reqId,
        ok: true,
        status: result.status,
        response: result.response,
        respHeader: result.respHeader,
      }, '*');
    } catch (error) {
      window.postMessage({
        source: 'chat-agent-main',
        type: 'proxy-result',
        reqId,
        ok: false,
        error: String(error?.message || error),
      }, '*');
    }
  }

  // --- update_reaction (emoji react / unreact) [deprecated — now goes via
  // proxy_request from backend, kept temporarily for back-compat] ---------
  function randomReactionUUID() {
    // Standard UUID v4 shape — Chat's own client uses this exact form.
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function buildUpdateReactionPayload(detail) {
    const emoji = String(detail?.emoji || '');
    if (!emoji) throw new Error('emoji required');
    const messageId = String(detail?.messageId || '');
    const spaceID = spaceIDFromKey(detail?.spaceKey);
    if (!messageId) throw new Error('message_id required');
    if (!spaceID) throw new Error('space_key required');
    const action = detail?.action === 'remove' ? 2 : 1;

    const cat = state.emojiCatalog[emoji];
    if (!cat) {
      const custom = Object.keys(state.emojiCatalog).filter((k) => state.emojiCatalog[k]?.type === 'custom');
      throw new Error(
        `emoji "${emoji}" not in frecent catalog (${custom.length} custom + unicode loaded). Reload Chat tab to refresh, or use this emoji once in Chat.`
      );
    }

    // payload layout (custom + unicode share the outer skeleton):
    //   [0] = [[null,null,null,[null, msgId, [[spaceId]]]], msgId]
    //   [1] = [null, <emoji segment>]
    //   [2] = action (1 add | 2 remove)
    //   [3..99] = null padding
    //   [100] = footer
    const payload = new Array(101).fill(null);
    payload[0] = [[null, null, null, [null, messageId, [[spaceID]]]], messageId];

    if (cat.type === 'custom') {
      payload[1] = [null, [
        cat.uuid,
        null,
        cat.shortcode,
        1,
        [cat.userId || ''],
        [cat.localId || ''],
        null,
        Number(cat.timestamp) || 0,
        cat.blob || '',
      ]];
    } else {
      // unicode — server identifies emoji by codepoint, no uuid/blob needed.
      // Wire shape (from real capture): payload[1] is just [unicode_char].
      payload[1] = [cat.unicode];
    }
    payload[2] = action;
    payload[100] = buildFooter();

    emitDebug('main_reaction_payload_built', {
      reqId: detail?.reqId,
      messageId,
      spaceID,
      emoji,
      emojiType: cat.type,
      action,
      payloadPreview: JSON.stringify(payload).slice(0, 360),
    });
    return { payload, spaceID };
  }

  function sendUpdateReaction(detail) {
    const { payload, spaceID } = buildUpdateReactionPayload(detail);
    const url = `${state.accountBase}/api/update_reaction?c=${nextApiCounter()}`;
    emitDebug('main_send_update_reaction', {
      reqId: detail?.reqId,
      url,
      messageId: detail?.messageId,
      emoji: detail?.emoji,
      action: detail?.action,
      hasExtBin: !!state.googExtBin,
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
      if (state.googExtBin) {
        xhr.setRequestHeader('X-Goog-Ext-353267353-Bin', state.googExtBin);
      }
      xhr.onload = function () {
        const ok = xhr.status >= 200 && xhr.status < 300;
        if (!ok) {
          reject(Object.assign(
            new Error(`update_reaction failed: ${xhr.status} ${truncate(String(xhr.responseText || ''))}`),
            { status: xhr.status }
          ));
          return;
        }
        resolve({ status: xhr.status, responseText: String(xhr.responseText || '') });
      };
      xhr.onerror = function () {
        emitDebug('main_reaction_network_error', { reqId: detail?.reqId, url });
        reject(new Error('update_reaction network error'));
      };
      xhr.send(JSON.stringify(payload));
    });
  }

  async function handleReactionRequest(detail) {
    const reqId = detail?.reqId;
    try {
      const result = await sendUpdateReaction(detail);
      window.postMessage({
        source: 'chat-agent-main',
        type: 'reaction-result',
        reqId,
        ok: true,
        status: result?.status || 0,
      }, '*');
    } catch (error) {
      window.postMessage({
        source: 'chat-agent-main',
        type: 'reaction-result',
        reqId,
        ok: false,
        error: String(error?.message || error),
        status: Number(error?.status || 0),
      }, '*');
    }
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
    if (data.source !== 'chat-agent-content') return;
    if (data.type === 'send-request') {
      emitDebug('main_postmessage_received', { draftId: data.detail?.draftId });
      await handleSendRequest(data.detail || {});
      return;
    }
    if (data.type === 'reaction-request') {
      emitDebug('main_reaction_request_received', { reqId: data.detail?.reqId, messageId: data.detail?.messageId });
      await handleReactionRequest(data.detail || {});
      return;
    }
    if (data.type === 'proxy-request') {
      await handleProxyRequest(data.detail || {});
      return;
    }
    if (data.type === 'fetch-space' && typeof data.space_id === 'string' && data.space_id) {
      try {
        await sendGetGroup(data.space_id);
      } catch (e) {
        emitDebug('main_fetch_space_failed', { space_id: data.space_id, error: String(e?.message || e) });
      }
      return;
    }
    if (data.type === 'batchexecute-sender-search' && data.ldap) {
      try {
        await sendBatchExecuteSenderSearch(data.ldap, Number(data.before_ms) || Date.now(), Number(data.page_size) || 97);
      } catch (e) {
        emitDebug('main_batchexecute_failed', { ldap: data.ldap, error: String(e?.message || e) });
      }
    }
    if (data.type === 'sync-history-scan') {
      try {
        await handleSyncHistoryScan(data.job_id, data.space_key || null);
      } catch (e) {
        emitDebug('main_sync_history_failed', { job_id: data.job_id, error: String(e?.message || e) });
        window.postMessage({
          source: 'chat-agent-main',
          type: 'sync-history-error',
          job_id: data.job_id,
          error: String(e?.message || e),
        }, '*');
      }
    }
  });

  // Google's boq framework parks session state on window.WIZ_global_data.
  // Chat's DynamiteWebUi app uses the same plumbing; the keys are short
  // identifiers shared across all boq apps:
  //   SNlM0e  = 'at' token   (XSRF for batchexecute form body)
  //   FdrFJe  = 'f.sid'      (session id for batchexecute URL)
  //   cfb2h   = 'bl'         (build label for batchexecute URL)
  //
  // If the keys ever rotate, fall back to scanning DOM inline scripts for
  // the assignment pattern.
  function readBoqParams() {
    const w = window.WIZ_global_data || window['WIZ_global_data'] || {};
    const out = {
      at: w.SNlM0e || w['SNlM0e'] || '',
      fsid: w.FdrFJe || w['FdrFJe'] || '',
      bl: w.cfb2h || w['cfb2h'] || '',
    };
    if (out.at && out.fsid && out.bl) return out;
    // Fallback: search every <script> for "WIZ_global_data" assignment.
    try {
      const scripts = document.querySelectorAll('script');
      for (const s of scripts) {
        const t = s.textContent || '';
        if (!t.includes('WIZ_global_data')) continue;
        const m = t.match(/WIZ_global_data\s*=\s*(\{[\s\S]*?\})\s*[;<]/);
        if (!m) continue;
        try {
          const obj = JSON.parse(m[1]);
          if (!out.at) out.at = obj.SNlM0e || '';
          if (!out.fsid) out.fsid = obj.FdrFJe || '';
          if (!out.bl) out.bl = obj.cfb2h || '';
          if (out.at && out.fsid && out.bl) break;
        } catch {}
      }
    } catch {}
    return out;
  }

  async function sendBatchExecuteSenderSearch(ldap, beforeMs, pageSize) {
    const { at, fsid, bl } = readBoqParams();
    if (!at || !fsid || !bl) {
      throw new Error(`missing boq params at=${!!at} fsid=${!!fsid} bl=${!!bl}`);
    }
    const uuid = (crypto.randomUUID && crypto.randomUUID().toUpperCase()) || randomTopicKey(36);
    const innerReq = [
      null, null, null, ldap, null, uuid,
      [[], null, null, null, uuid, null, 0],
      beforeMs, [3], [pageSize || 97],
    ];
    const fReq = JSON.stringify([[["SBNmJb", JSON.stringify(innerReq), null, "3"]]]);
    const qs = new URLSearchParams({
      rpcids: 'SBNmJb',
      'source-path': '/u/0/app/search',
      'f.sid': fsid,
      bl,
      hl: 'en',
      _reqid: String(nextApiCounter() * 1000 + 300),
      rt: 'c',
    });
    const url = `${state.accountBase}/_/DynamiteWebUi/data/batchexecute?${qs.toString()}`;
    const formBody = `f.req=${encodeURIComponent(fReq)}&at=${encodeURIComponent(at)}&`;

    emitDebug('main_send_batchexecute_search', { ldap, beforeMs, pageSize, url });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
      xhr.setRequestHeader('X-Same-Domain', '1');
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          // Response bytes flow back to the backend automatically through
          // the existing XHR hook (URL matches /batchexecute/ filter).
          resolve();
        } else {
          reject(new Error(`batchexecute ${xhr.status}: ${truncate(String(xhr.responseText || ''))}`));
        }
      };
      xhr.onerror = function () { reject(new Error('batchexecute network error')); };
      xhr.send(formBody);
    });
  }

  function waitForRequestHeaders(timeoutMs = 30000) {
    if (state.requestHeaders?.['x-framework-xsrf-token']) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => {
        const i = requestHeadersReady.indexOf(resolve);
        if (i >= 0) requestHeadersReady.splice(i, 1);
        reject(new Error('state.requestHeaders not populated within timeout'));
      }, timeoutMs);
      requestHeadersReady.push(() => { clearTimeout(t); resolve(); });
    });
  }

  async function sendGetGroup(spaceId) {
    await waitForRequestHeaders();
    const url = `${state.accountBase}/api/get_group?c=${nextApiCounter()}`;
    const body = new Array(100).fill(null);
    body[0] = [[spaceId]];
    body[3] = [5, 9, 8, 7, 1, 4];
    body[4] = 1;
    body[99] = buildFooter();

    emitDebug('main_send_get_group', { url, spaceId });
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
      xhr.setRequestHeader('X-Goog-Chat-Space-Id', spaceId);
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          // The XHR hook installed on XMLHttpRequest.prototype.send will have
          // already emitted an 'xhr' event with respText, so the backend's
          // get_group parser runs as a side effect. Nothing else to do here.
          resolve();
        } else {
          reject(new Error(`get_group ${xhr.status}: ${truncate(String(xhr.responseText || ''))}`));
        }
      };
      xhr.onerror = function () { reject(new Error('get_group network error')); };
      xhr.send(JSON.stringify(body));
    });
  }

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
        if (/\/api\/get_frecent_emojis_v2(?:\?|$)/.test(String(meta.url))) {
          ingestFrecentEmojis(respText);
        }
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

  // =========================================================================
  // Sync History: batchexecute scan loop helpers
  // =========================================================================
  //
  // RPC identifiers confirmed by observing Chat DevTools network panel:
  //   jfcZG   — list_spaces (Browse spaces panel, returns full space list)
  //   oGiIKf  — list_topics (per-space topic list with pagination)
  //   QyR6M   — get_topic_messages (individual topic message list)
  //
  // Note: oGiIKf and QyR6M were observed empirically. If Google rotates the
  // RPC IDs, the scan loop will get empty results (not crash) and should be
  // re-sniffed from DevTools > Network > batchexecute calls.

  const RATE_LIMIT_MS = 200;   // 5 req/s
  const RETRY_DELAYS = [500, 1000, 2000, 4000];  // exponential backoff

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async function batchexecuteRPC(rpcId, innerReq, sourcePath) {
    const { at, fsid, bl } = readBoqParams();
    if (!at || !fsid || !bl) {
      throw new Error(`missing boq params at=${!!at} fsid=${!!fsid} bl=${!!bl}`);
    }
    const fReq = JSON.stringify([[[rpcId, JSON.stringify(innerReq), null, '1']]]);
    const qs = new URLSearchParams({
      rpcids: rpcId,
      'source-path': sourcePath || `${state.accountBase}/app`,
      'f.sid': fsid,
      bl,
      hl: 'en',
      _reqid: String(nextApiCounter() * 1000 + 100),
      rt: 'c',
    });
    const url = `${state.accountBase}/_/DynamiteWebUi/data/batchexecute?${qs.toString()}`;
    const formBody = `f.req=${encodeURIComponent(fReq)}&at=${encodeURIComponent(at)}&`;

    emitDebug('main_sync_batchexecute', { rpcId, url });
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url, true);
      xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8');
      xhr.setRequestHeader('X-Same-Domain', '1');
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.responseText || '');
        } else {
          reject(Object.assign(new Error(`batchexecute ${rpcId} ${xhr.status}`), { status: xhr.status }));
        }
      };
      xhr.onerror = function () { reject(new Error(`batchexecute ${rpcId} network error`)); };
      xhr.send(formBody);
    });
  }

  async function batchexecuteWithRetry(rpcId, innerReq, sourcePath) {
    let lastErr;
    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        const text = await batchexecuteRPC(rpcId, innerReq, sourcePath);
        await sleep(RATE_LIMIT_MS);
        return text;
      } catch (e) {
        lastErr = e;
        const isRetryable = !e.status || e.status === 429 || e.status >= 500;
        if (!isRetryable || attempt >= RETRY_DELAYS.length) break;
        const delay = RETRY_DELAYS[attempt];
        emitDebug('main_sync_retry', { rpcId, attempt, delay, error: String(e?.message) });
        await sleep(delay);
      }
    }
    throw lastErr;
  }

  // Parse batchexecute response envelope → extract inner JSON for a given rpcId.
  function parseBatchExecuteResponse(text, rpcId) {
    // Strip XSSI prefix
    let body = text.trimStart();
    if (body.startsWith(")]}'")) body = body.slice(4).trimStart();

    // The response is a sequence of length-prefixed JSON frames.
    // We parse each frame looking for wrb.fr with our rpcId.
    let pos = 0;
    while (pos < body.length) {
      const nlIdx = body.indexOf('\n', pos);
      if (nlIdx < 0) break;
      const lenStr = body.slice(pos, nlIdx).trim();
      const n = Number(lenStr);
      if (!Number.isFinite(n) || n <= 0) { pos = nlIdx + 1; continue; }
      if (pos + nlIdx + 1 + n > body.length + 1) break;
      const frame = body.slice(nlIdx + 1, nlIdx + 1 + n);
      pos = nlIdx + 1 + n;
      try {
        const arr = JSON.parse(frame);
        if (!Array.isArray(arr)) continue;
        for (const item of arr) {
          if (!Array.isArray(item) || item[0] !== 'wrb.fr') continue;
          if (item[1] !== rpcId) continue;
          const innerStr = item[2];
          if (typeof innerStr !== 'string' || !innerStr) continue;
          return JSON.parse(innerStr);
        }
      } catch {}
    }
    return null;
  }

  // list_spaces via jfcZG — returns [{space_key, space_name}]
  async function syncListSpaces() {
    // jfcZG takes an empty inner request
    const innerReq = [];
    const text = await batchexecuteWithRetry('jfcZG', innerReq, `${state.accountBase}/app`);
    const inner = parseBatchExecuteResponse(text, 'jfcZG');
    if (!inner || !Array.isArray(inner)) return [];

    // Inner shape: ["", [[entry1], [entry2], ...]]
    // entry: [[[space_id]], display_name, description, ...]
    const list = Array.isArray(inner[1]) ? inner[1] : [];
    const spaces = [];
    for (const rec of list) {
      if (!Array.isArray(rec)) continue;
      // Extract space_id from nested [[space_id]]
      const spaceId = rec?.[0]?.[0]?.[0];
      const name = rec?.[1];
      if (!spaceId || !name) continue;
      spaces.push({ space_key: 'space:' + spaceId, space_name: String(name) });
    }
    emitDebug('main_sync_list_spaces', { count: spaces.length });
    return spaces;
  }

  // list_topics via oGiIKf — returns [{topic_id, space_key}] with pagination
  // space_key format: "space:XXXX" — we extract the raw ID for the RPC.
  async function syncListTopics(spaceKey, pageToken) {
    const spaceId = spaceKey.startsWith('space:') ? spaceKey.slice(6) : spaceKey;
    // oGiIKf args: [space_id_ref, page_size, page_token, ...]
    // Observed shape: [[space_id], page_size, page_token]
    const innerReq = [[[spaceId]], 50, pageToken || null];
    const text = await batchexecuteWithRetry('oGiIKf', innerReq, `${state.accountBase}/app`);
    const inner = parseBatchExecuteResponse(text, 'oGiIKf');
    if (!inner || !Array.isArray(inner)) return { topics: [], nextPageToken: null };

    // Inner shape: [[topic1, topic2, ...], next_page_token]
    const topicList = Array.isArray(inner[0]) ? inner[0] : [];
    const nextPageToken = inner[1] || null;

    const topics = [];
    for (const t of topicList) {
      if (!Array.isArray(t)) continue;
      // topic[0] = [null, topic_id, [[space_id]]]
      const topicId = t?.[0]?.[1];
      if (!topicId) continue;
      topics.push({ topic_id: String(topicId), space_key: spaceKey });
    }
    return { topics, nextPageToken };
  }

  // get_topic_messages via QyR6M — returns parsed message objects
  async function syncGetTopicMessages(spaceKey, topicId, spaceName) {
    const spaceId = spaceKey.startsWith('space:') ? spaceKey.slice(6) : spaceKey;
    // QyR6M args: [[space_id], topic_id, page_size, page_token, ...]
    const innerReq = [[[spaceId]], topicId, 100, null];
    const text = await batchexecuteWithRetry('QyR6M', innerReq, `${state.accountBase}/app`);
    const inner = parseBatchExecuteResponse(text, 'QyR6M');
    if (!inner || !Array.isArray(inner)) return [];

    // Inner shape mirrors list_topics message list: [messages_array, ...]
    const msgList = Array.isArray(inner[0]) ? inner[0] : [];
    const messages = [];
    for (const m of msgList) {
      if (!Array.isArray(m) || m.length < 10) continue;
      // m[0] = [[...], message_id]
      const msgId = m?.[0]?.[1];
      if (!msgId) continue;
      // m[1] = [sender_id_arr, display_name, avatar, email, ...]
      const senderArr = Array.isArray(m[1]) ? m[1] : [];
      const senderId = senderArr?.[0]?.[0] || '';
      const senderName = senderArr?.[1] || '';
      // m[2] = timestamp in microseconds (string)
      let observedAt = new Date().toISOString();
      if (typeof m[2] === 'string' && m[2]) {
        const us = Number(m[2]);
        if (Number.isFinite(us) && us > 0) {
          observedAt = new Date(us / 1000).toISOString();
        }
      }
      // m[9] = body text
      const body = typeof m[9] === 'string' ? m[9] : '';
      // Skip system messages / no-body messages
      if (!body) continue;

      // Detect mentions — look for mention annotation in m[7] (annotations array)
      // Simplified: check if body contains @
      const mentioned = typeof body === 'string' && body.includes('@');

      messages.push({
        message_id: `spaces/${spaceId}/messages/${msgId}`,
        space_key: spaceKey,
        space_name: spaceName || '',
        thread_key: topicId,
        sender_id: senderId ? `users/${senderId}` : '',
        sender_name: String(senderName),
        body,
        observed_at: observedAt,
        mentioned,
      });
    }
    return messages;
  }

  // Main sync loop orchestrator.
  // space_key = null → sync all spaces; space_key set → sync one space.
  async function handleSyncHistoryScan(jobId, spaceKey) {
    emitDebug('main_sync_start', { job_id: jobId, space_key: spaceKey });

    // Wait for request headers (XSRF etc.) before making any API calls.
    await waitForRequestHeaders(60000).catch(() => {
      throw new Error('Timed out waiting for Chat session headers — open a Chat space first');
    });

    let spaces;
    if (spaceKey) {
      // Single space mode: we need space_name. Try to get it from spaceRefsByID.
      const spaceId = spaceKey.startsWith('space:') ? spaceKey.slice(6) : spaceKey;
      const spaceName = ''; // name will be empty for single-space; backend tolerates it
      spaces = [{ space_key: spaceKey, space_name: spaceName }];
    } else {
      // Sync all: list_spaces first
      try {
        spaces = await syncListSpaces();
      } catch (e) {
        emitDebug('main_sync_list_spaces_failed', { error: String(e?.message) });
        window.postMessage({
          source: 'chat-agent-main',
          type: 'sync-history-error',
          job_id: jobId,
          error: `list_spaces failed: ${e?.message}`,
        }, '*');
        return;
      }
    }

    let totalInserted = 0;
    let totalFailed = 0;
    let totalDuplicates = 0;
    const BATCH_SIZE = 100;
    let batchBuffer = [];

    async function flushBatch() {
      if (batchBuffer.length === 0) return;
      const batch = batchBuffer.splice(0, batchBuffer.length);
      window.postMessage({
        source: 'chat-agent-main',
        type: 'sync-history-batch',
        job_id: jobId,
        messages: batch,
      }, '*');
    }

    for (const space of spaces) {
      emitDebug('main_sync_space_start', { space_key: space.space_key });
      try {
        let pageToken = null;
        do {
          let topicsResult;
          try {
            topicsResult = await syncListTopics(space.space_key, pageToken);
          } catch (e) {
            emitDebug('main_sync_list_topics_failed', { space_key: space.space_key, error: String(e?.message) });
            // AC-18: skip this space, continue with others
            break;
          }
          pageToken = topicsResult.nextPageToken;

          for (const topic of topicsResult.topics) {
            let topicMsgs;
            try {
              topicMsgs = await syncGetTopicMessages(space.space_key, topic.topic_id, space.space_name);
            } catch (e) {
              emitDebug('main_sync_topic_failed', { topic_id: topic.topic_id, error: String(e?.message) });
              // Mark as failed, continue
              totalFailed += 1;
              continue;
            }

            for (const msg of topicMsgs) {
              batchBuffer.push(msg);
              if (batchBuffer.length >= BATCH_SIZE) {
                await flushBatch();
              }
            }
          }
        } while (pageToken);

        // Flush remaining messages for this space
        if (batchBuffer.length > 0) await flushBatch();
      } catch (e) {
        emitDebug('main_sync_space_failed', { space_key: space.space_key, error: String(e?.message) });
        // AC-18: continue with next space
      }
    }

    // Flush any remaining messages
    if (batchBuffer.length > 0) await flushBatch();

    emitDebug('main_sync_complete', { job_id: jobId, inserted: totalInserted, failed: totalFailed });
    window.postMessage({
      source: 'chat-agent-main',
      type: 'sync-history-done',
      job_id: jobId,
    }, '*');
  }

  console.log('[chat-agent:net] network hooks installed');
})();
