// Space Facts types — Sprint 7 (F-014/F-015)

export type SpaceFactCategory = 'product' | 'my-role' | 'glossary' | 'pinned-decision' | 'relation'
export type SpaceFactVisibility = 'public' | 'private' | 'secret'
export type SpaceFactStatus = 'candidate' | 'approved' | 'rejected'

export interface SpaceFact {
  id: number
  space_key: string
  category: SpaceFactCategory
  content: string
  visibility: SpaceFactVisibility
  status: SpaceFactStatus
  source_message_ids: number[]
  note: string
  created_by: string
  created_at: string
  updated_at: string
  approved_at: string | null
}

export interface SpaceFactsResponse {
  facts: SpaceFact[]
}

export interface Message {
  id: number
  message_id: string
  space_key: string
  thread_key: string
  sender_id: string
  sender_name: string
  body: string
  observed_at: string
  mentioned: boolean
  skipped_at: string | null
}

export interface MessagesResponse {
  messages: Message[]
  next_before_id: number | null
}

export interface MiningJob {
  space_key: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  last_mined_message_id: string | null
  last_mined_at: string | null
  candidates_generated: number
  error_message: string | null
  created_at: string
  updated_at: string
}
