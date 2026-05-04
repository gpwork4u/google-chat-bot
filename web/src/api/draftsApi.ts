import { api } from './client'

export async function approveDraft(id: number, content: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/drafts/${id}/approve`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  })
}

export async function rejectDraft(id: number): Promise<void> {
  await api<{ ok: boolean }>(`/api/drafts/${id}/reject`, {
    method: 'POST',
  })
}

export async function saveDraft(id: number, content: string): Promise<void> {
  await api<{ ok: boolean }>(`/api/drafts/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ content }),
  })
}
