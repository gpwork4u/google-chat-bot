/**
 * syncHistory.ts — Helper for F-012 extension sync-history API tests
 *
 * POST /api/extension/sync-history/start
 * POST /api/extension/sync-history  (batch insert)
 * GET  /api/extension/sync-history/status
 * POST /api/extension/sync-history/complete
 */

import { APIRequestContext } from '@playwright/test';
import { SYNC_API_PATHS } from './contracts-sprint6';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

export interface SyncMessage {
  message_id: string;
  space_key: string;
  space_name?: string;
  thread_key?: string;
  sender_id?: string;
  sender_name: string;
  body: string;
  observed_at: string;
  mentioned?: boolean;
}

export interface SyncStartResponse {
  job_id: string;
  status: 'running';
  space_key: string | null;
  started_at: string;
}

export interface SyncBatchResponse {
  inserted: number;
  duplicates: number;
  failed: number;
  job_total_so_far: number;
}

export interface SyncStatusResponse {
  job_id: string;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  space_key: string | null;
  total_messages: number;
  inserted_messages: number;
  duplicate_messages: number;
  failed_messages: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
}

/**
 * POST /api/extension/sync-history/start
 */
export async function startSyncJob(
  request: APIRequestContext,
  params: { job_id: string; space_key?: string }
) {
  return request.post(`${BASE_URL}${SYNC_API_PATHS.START}`, {
    data: params,
  });
}

/**
 * POST /api/extension/sync-history (batch insert)
 */
export async function batchInsertMessages(
  request: APIRequestContext,
  params: { job_id: string; messages: SyncMessage[] }
) {
  return request.post(`${BASE_URL}${SYNC_API_PATHS.BATCH}`, {
    data: params,
  });
}

/**
 * GET /api/extension/sync-history/status?job_id=<id>
 */
export async function getSyncStatus(request: APIRequestContext, jobId: string) {
  return request.get(`${BASE_URL}${SYNC_API_PATHS.STATUS}`, {
    params: { job_id: jobId },
  });
}

/**
 * POST /api/extension/sync-history/complete
 */
export async function completeSyncJob(
  request: APIRequestContext,
  params: { job_id: string; status: 'completed' | 'failed'; error_message?: string }
) {
  return request.post(`${BASE_URL}${SYNC_API_PATHS.COMPLETE}`, {
    data: params,
  });
}

/**
 * 產生 UUID v4
 */
export function makeJobId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 建立測試用 SyncMessage
 */
export function makeSyncMessage(overrides: Partial<SyncMessage> = {}): SyncMessage {
  const ts = new Date().toISOString();
  const uid = Math.random().toString(36).slice(2, 8);
  return {
    message_id: `spaces/AAA/messages/${uid}`,
    space_key: 'spaces/AAA',
    space_name: 'Team #general',
    thread_key: `TP${uid}`,
    sender_id: 'users/alice',
    sender_name: 'Alice',
    body: `Test message ${uid}`,
    observed_at: ts,
    mentioned: false,
    ...overrides,
  };
}
