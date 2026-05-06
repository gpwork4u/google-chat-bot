export interface ContextMessage {
  sender_name: string
  content: string
  created_at: string
  is_me?: boolean
}

export interface DraftDebug {
  categorize_reason: string
  confidence?: number
  context_source: string
  model?: string
}

export type DraftCategory = 'daily-chat' | 'work-coordination' | 'engineering' | 'skip'

export interface Draft {
  id: number
  space_id: string
  space_name: string
  sender_id: string
  sender_name: string
  original_message: string
  context_messages: ContextMessage[]
  draft_content: string
  category: DraftCategory
  debug?: DraftDebug
  created_at: string
  message_id?: number
  safety_flags?: string[]
  safety_trigger_reason?: string
  safety_overridden_by?: string
}

export interface DraftsResponse {
  drafts: Draft[]
}
