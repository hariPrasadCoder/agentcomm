// API Types

export interface User {
  id: string
  email: string
  name: string
  role?: string
  avatar_url?: string
  org_id?: string
  team_id?: string
  is_active: boolean
  created_at: string
}

export interface UserWithToken extends User {
  access_token: string
  token_type: string
}

export interface Organization {
  id: string
  name: string
  description?: string
  invite_code: string
  owner_id: string
  created_at: string
}

export interface Team {
  id: string
  org_id: string
  name: string
  description?: string
  created_at: string
  members?: User[]
}

export interface Channel {
  id: string
  org_id: string
  team_id?: string
  name: string
  description?: string
  channel_type: 'public' | 'private' | 'dm'
  created_by: string
  created_at: string
  members?: User[]
  last_message?: Message
}

export interface Message {
  id: string
  org_id: string
  channel_id?: string
  dm_conversation_id?: string
  sender_id: string
  content: string
  message_type: 'text' | 'request' | 'response' | 'follow_up' | 'system' | 'agent'
  is_from_agent: boolean
  parent_id?: string
  created_at: string
  updated_at?: string
  sender?: User
}

export interface DMConversation {
  id: string
  org_id: string
  participant_ids: string[]
  created_at: string
  participants?: User[]
  last_message?: Message
  unread_count?: number
}

export interface Request {
  id: string
  org_id: string
  from_user_id: string
  to_user_id?: string
  to_team_id?: string
  subject: string
  content: string
  status: 'pending' | 'in_progress' | 'waiting_response' | 'completed' | 'cancelled'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date?: string
  follow_up_count: number
  last_follow_up?: string
  response?: string
  created_at: string
  completed_at?: string
  from_user?: User
  to_user?: User
}

export interface Task {
  id: string
  user_id: string
  request_id: string
  title: string
  description: string
  status: 'pending' | 'in_progress' | 'completed' | 'deferred'
  priority: 'low' | 'normal' | 'high' | 'urgent'
  due_date?: string
  created_at: string
  completed_at?: string
  request?: Request
}

export interface Notification {
  id: string
  user_id: string
  title: string
  body: string
  link?: string
  is_read: boolean
  created_at: string
}

export interface AgentChatResponse {
  response: string
  action_taken?: string
  request_created?: Request
}

// WebSocket Events
export interface WSEvent {
  event: string
  payload: Record<string, unknown>
}
