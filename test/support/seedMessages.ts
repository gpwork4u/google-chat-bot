/**
 * seedMessages.ts — Helper for seeding pending messages via debug endpoint
 *
 * Uses POST /debug/simulate_message to insert messages into the backend DB
 * so that F-013 Pending Viewer tests have data to work with.
 */

import { APIRequestContext } from '@playwright/test';
import { API_PATHS } from '../../web/src/contracts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

export interface SimulateMessageParams {
  space_key: string;
  space_name: string;
  thread_key: string;
  sender_name: string;
  body: string;
  sender_is_me?: boolean;
  with_draft?: boolean;
  mentioned?: boolean;
}

export interface SimulateMessageResult {
  ok: boolean;
  message_id: string;
  inserted: boolean;
  draft_created: boolean;
}

/**
 * Seed a single message via POST /debug/simulate_message
 */
export async function simulateMessage(
  request: APIRequestContext,
  params: SimulateMessageParams
): Promise<SimulateMessageResult> {
  const res = await request.post(`${BASE_URL}${API_PATHS.DEBUG_SIMULATE_MESSAGE}`, {
    data: params,
  });
  if (!res.ok()) {
    throw new Error(
      `simulateMessage failed: ${res.status()} — ensure backend debug endpoint is enabled`
    );
  }
  return res.json() as Promise<SimulateMessageResult>;
}

/**
 * Seed multiple messages for pending viewer tests.
 * Returns array of message_ids created.
 */
export async function seedPendingMessages(
  request: APIRequestContext,
  count: number,
  overrides: Partial<SimulateMessageParams> = {}
): Promise<string[]> {
  const messageIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const uid = Math.random().toString(36).slice(2, 7);
    const result = await simulateMessage(request, {
      space_key: 'spaces/AAA',
      space_name: 'Team #general',
      thread_key: `TP${uid}`,
      sender_name: 'Alice',
      body: `Pending message ${i + 1} uid=${uid}`,
      sender_is_me: false,
      with_draft: false,
      ...overrides,
    });
    if (result.message_id) {
      messageIds.push(result.message_id);
    }
  }
  return messageIds;
}

/**
 * Seed a message that is already skipped via backend_auto
 * (simulate_message doesn't support this directly, so we skip after seeding)
 */
export async function seedSkippedMessage(
  request: APIRequestContext,
  skipOptions: {
    reason: string;
    by: 'skill' | 'backend_auto' | 'manual' | 'backfill';
    overrides?: Partial<SimulateMessageParams>;
  }
): Promise<string> {
  const result = await simulateMessage(request, {
    space_key: 'spaces/AAA',
    space_name: 'Team #general',
    thread_key: `TP_skipped_${Date.now()}`,
    sender_name: 'Alice',
    body: 'Message to be skipped',
    sender_is_me: false,
    with_draft: false,
    ...skipOptions.overrides,
  });

  // Now skip it
  const skipRes = await request.post(`${BASE_URL}${API_PATHS.CLAUDE_SKIP}`, {
    data: {
      message_id: result.message_id,
      reason: skipOptions.reason,
      by: skipOptions.by,
    },
  });
  if (!skipRes.ok()) {
    throw new Error(`Failed to skip message: ${skipRes.status()}`);
  }

  return result.message_id;
}
