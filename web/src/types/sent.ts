export interface SentRecord {
  id: string
  space_id: string
  space_name: string
  sender_id: string
  sender_name: string
  trigger_message: string
  sent_content: string
  original_body?: string
  mode: 'approved' | 'auto'
  edited_by_user: boolean
  category: string
  sent_at: string
}

export interface SentResponse {
  items: SentRecord[]
  next_cursor: string
}

export interface SentFilter {
  mode: '' | 'approved' | 'auto'
  spaceIds: string[]
  from: string   // ISO date string "YYYY-MM-DD"
  to: string     // ISO date string "YYYY-MM-DD"
  q: string
}
