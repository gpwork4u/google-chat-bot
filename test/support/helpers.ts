import { APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

/**
 * 呼叫 debug inject endpoint，注入 fake WS 事件
 * 此 endpoint 由 backend engineer 在 dev 模式提供：POST /api/debug/inject-draft
 *
 * Payload 範例：
 *   { "event": "draft_created", "draft": { ...DraftPayload } }
 *   { "event": "draft_removed", "id": "B" }
 */
export async function injectWsEvent(
  request: APIRequestContext,
  payload: {
    event: 'draft_created' | 'draft_updated' | 'draft_removed';
    draft?: Record<string, unknown>;
    id?: string;
  }
): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/debug/inject-draft`, {
    data: payload,
  });
  if (!res.ok()) {
    throw new Error(
      `injectWsEvent failed: ${res.status()} — endpoint may not be available yet (requires engineer to implement /api/debug/inject-draft)`
    );
  }
}

/**
 * 建立假 draft 資料（供 mock API seed 用）
 */
export function makeDraft(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    space_id: 'SPACE001',
    space_name: 'Team #general',
    sender_id: 'users/alice',
    sender_name: 'Alice',
    original_message: '你好，請問下午有空嗎？',
    context_messages: [
      { sender_name: 'Alice', content: '你好', created_at: new Date().toISOString() },
    ],
    draft_content: '好的, 收到',
    category: 'daily-chat',
    debug: { categorize_reason: 'greeting', context_source: 'recent' },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * 透過 debug endpoint 預先 seed 多個 draft
 * POST /api/debug/seed-drafts  body: { drafts: [...] }
 */
export async function seedDrafts(
  request: APIRequestContext,
  drafts: Record<string, unknown>[]
): Promise<void> {
  const res = await request.post(`${BASE_URL}/api/debug/seed-drafts?reset=1`, {
    data: { drafts },
  });
  if (!res.ok()) {
    throw new Error(
      `seedDrafts failed: ${res.status()} — requires engineer to implement /api/debug/seed-drafts`
    );
  }
}
