/**
 * test/support/spaceFacts.ts
 *
 * Helpers for seeding / resetting Space Facts data in BDD tests.
 *
 * All interactions go through the backend REST API (F-014 endpoints).
 * When a debug reset endpoint is available it will be used; otherwise each
 * scenario relies on unique test data to avoid state leakage.
 */

import { APIRequestContext } from '@playwright/test';
import { API_PATHS } from '../../web/src/contracts';

const BASE_URL = process.env.BASE_URL || 'http://localhost:8080';

// ─── Type helpers ─────────────────────────────────────────────────────────────

export interface SpaceFactSeed {
  space_key: string;
  category: 'product' | 'my-role' | 'glossary' | 'pinned-decision' | 'relation';
  content: string;
  visibility?: 'public' | 'private' | 'secret';
  created_by?: 'mining-skill' | 'manual';
  source_message_ids?: number[];
  note?: string;
}

export interface SpaceFactRow {
  id: number;
  space_key: string;
  category: string;
  content: string;
  visibility: string;
  status: string;
  source_message_ids: number[];
  note: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
}

export interface MiningJobRow {
  id: number;
  space_key: string;
  status: string;
  last_mined_message_id: number | null;
  last_mined_at: string | null;
  candidates_generated: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

// ─── Space Fact helpers ───────────────────────────────────────────────────────

/**
 * Seed a single space fact via POST /api/space-facts.
 * Returns the created row.
 */
export async function seedSpaceFact(
  request: APIRequestContext,
  seed: SpaceFactSeed
): Promise<SpaceFactRow> {
  const res = await request.post(`${BASE_URL}${API_PATHS.SPACE_FACTS}`, {
    data: {
      space_key: seed.space_key,
      category: seed.category,
      content: seed.content,
      visibility: seed.visibility ?? 'private',
      created_by: seed.created_by ?? 'manual',
      source_message_ids: seed.source_message_ids ?? [],
      note: seed.note ?? '',
    },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`seedSpaceFact failed ${res.status()}: ${body}`);
  }
  return res.json() as Promise<SpaceFactRow>;
}

/**
 * Seed multiple facts at once. Returns created rows.
 */
export async function seedSpaceFacts(
  request: APIRequestContext,
  seeds: SpaceFactSeed[]
): Promise<SpaceFactRow[]> {
  return Promise.all(seeds.map((s) => seedSpaceFact(request, s)));
}

/**
 * Delete a single fact by id (hard delete).
 */
export async function deleteSpaceFact(
  request: APIRequestContext,
  id: number
): Promise<void> {
  await request.delete(`${BASE_URL}${API_PATHS.SPACE_FACTS_ITEM(id)}`);
}

/**
 * Fetch all facts for a given space_key (default status=all via include_secret).
 * Returns fact rows.
 */
export async function fetchSpaceFacts(
  request: APIRequestContext,
  spaceKey: string,
  params: { status?: string; category?: string; include_secret?: boolean } = {}
): Promise<SpaceFactRow[]> {
  const qs = new URLSearchParams({ space_key: spaceKey });
  if (params.status) qs.set('status', params.status);
  if (params.category) qs.set('category', params.category);
  if (params.include_secret) qs.set('include_secret', '1');
  const res = await request.get(`${BASE_URL}${API_PATHS.SPACE_FACTS}?${qs}`);
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`fetchSpaceFacts failed ${res.status()}: ${body}`);
  }
  const json = await res.json() as { facts: SpaceFactRow[] };
  return json.facts ?? [];
}

/**
 * Clean up all facts in a space by fetching + deleting them.
 * Useful in test teardown. Silently ignores errors.
 */
export async function cleanupSpaceFacts(
  request: APIRequestContext,
  spaceKey: string
): Promise<void> {
  try {
    const facts = await fetchSpaceFacts(request, spaceKey, { include_secret: true });
    await Promise.allSettled(facts.map((f) => deleteSpaceFact(request, f.id)));
  } catch {
    // ignore cleanup errors
  }
}

// ─── Mining Queue helpers ─────────────────────────────────────────────────────

/**
 * Enqueue a space for mining (POST /api/space-facts/mining-queue).
 * Idempotent: if already pending → returns current row.
 * If completed/failed → resets to pending.
 */
export async function enqueueMining(
  request: APIRequestContext,
  spaceKey: string
): Promise<MiningJobRow> {
  const res = await request.post(`${BASE_URL}${API_PATHS.SPACE_FACTS_MINING_QUEUE}`, {
    data: { space_key: spaceKey },
  });
  if (!res.ok() && res.status() !== 409) {
    throw new Error(`enqueueMining failed ${res.status()}`);
  }
  return res.json() as Promise<MiningJobRow>;
}

/**
 * Patch a mining job's status (simulates skill lifecycle).
 */
export async function patchMiningJob(
  request: APIRequestContext,
  spaceKey: string,
  patch: Partial<{
    status: 'pending' | 'running' | 'completed' | 'failed';
    candidates_generated: number;
    last_mined_message_id: number;
    error_message: string;
  }>
): Promise<MiningJobRow> {
  const encoded = encodeURIComponent(spaceKey);
  const res = await request.patch(
    `${BASE_URL}${API_PATHS.SPACE_FACTS_MINING_QUEUE_ITEM(spaceKey)}`,
    { data: patch }
  );
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`patchMiningJob(${spaceKey} → ${encoded}) failed ${res.status()}: ${body}`);
  }
  return res.json() as Promise<MiningJobRow>;
}

/**
 * Get the mining queue for a given status.
 */
export async function getMiningQueue(
  request: APIRequestContext,
  status: string = 'pending'
): Promise<MiningJobRow[]> {
  const res = await request.get(
    `${BASE_URL}${API_PATHS.SPACE_FACTS_MINING_QUEUE}?status=${status}`
  );
  if (!res.ok()) {
    throw new Error(`getMiningQueue failed ${res.status()}`);
  }
  const json = await res.json() as { jobs: MiningJobRow[] };
  return json.jobs ?? [];
}

/**
 * Set a mining job to a specific status, creating it if needed.
 * Useful for test setup (ensures job exists with desired state).
 */
export async function setMiningJobStatus(
  request: APIRequestContext,
  spaceKey: string,
  targetStatus: 'pending' | 'running' | 'completed' | 'failed'
): Promise<MiningJobRow> {
  // Enqueue first (creates or resets to pending)
  await enqueueMining(request, spaceKey);

  if (targetStatus === 'pending') {
    // Already pending after enqueue
    const jobs = await getMiningQueue(request, 'pending');
    const job = jobs.find((j) => j.space_key === spaceKey);
    if (job) return job;
  }

  // Transition to running first if needed
  if (targetStatus === 'running' || targetStatus === 'completed' || targetStatus === 'failed') {
    await patchMiningJob(request, spaceKey, { status: 'running' });
  }

  if (targetStatus === 'completed') {
    return patchMiningJob(request, spaceKey, { status: 'completed', candidates_generated: 0 });
  }

  if (targetStatus === 'failed') {
    return patchMiningJob(request, spaceKey, { status: 'failed', error_message: 'test-forced-failure' });
  }

  if (targetStatus === 'running') {
    return patchMiningJob(request, spaceKey, { status: 'running' });
  }

  throw new Error(`Unknown targetStatus: ${targetStatus}`);
}
