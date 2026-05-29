// background.js — service worker. Owns the chrome.cookies API (not
// accessible from content scripts). Content script messages here to fetch the
// google.com auth cookies needed by the backend to call chat.google.com
// directly without bouncing through the extension's own XHR.

const RELEVANT_COOKIE_DOMAINS = ['.google.com', 'chat.google.com', 'mail.google.com'];

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'dump-google-cookies') return false;
  collectGoogleCookies()
    .then((cookies) => sendResponse({ ok: true, cookies }))
    .catch((e) => sendResponse({ ok: false, error: String(e?.message || e) }));
  return true; // keep channel open for async response
});

async function collectGoogleCookies() {
  const all = await Promise.all(
    RELEVANT_COOKIE_DOMAINS.map((domain) => chrome.cookies.getAll({ domain }))
  );
  // Dedup by (domain, name, path); chrome.cookies.getAll with overlapping
  // domain filters returns the same cookie multiple times.
  const seen = new Set();
  const out = [];
  for (const list of all) {
    for (const c of list || []) {
      const key = `${c.domain}|${c.name}|${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        secure: !!c.secure,
        httpOnly: !!c.httpOnly,
        sameSite: c.sameSite || '',
        expirationDate: c.expirationDate || 0,
      });
    }
  }
  return out;
}
