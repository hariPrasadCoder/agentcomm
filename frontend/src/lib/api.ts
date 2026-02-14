/**
 * API Client for AgentComm Backend
 */

import type {
  User,
  UserWithToken,
  Organization,
  Team,
  Channel,
  Message,
  DMConversation,
  Request,
  Task,
  Notification,
  AgentChatResponse,
} from '@/types'

const API_BASE = '/api'

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('access_token')
  
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  }
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  })
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Unknown error' }))
    throw new ApiError(response.status, error.detail || 'Request failed')
  }
  
  return response.json()
}

// ============ Auth ============

export const auth = {
  async signup(email: string, password: string, name: string, role?: string): Promise<UserWithToken> {
    const result = await fetchApi<UserWithToken>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role }),
    })
    localStorage.setItem('access_token', result.access_token)
    return result
  },
  
  async login(email: string, password: string): Promise<UserWithToken> {
    const result = await fetchApi<UserWithToken>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    })
    localStorage.setItem('access_token', result.access_token)
    return result
  },
  
  async logout(): Promise<void> {
    await fetchApi('/auth/logout', { method: 'POST' }).catch(() => {})
    localStorage.removeItem('access_token')
  },
  
  async getMe(): Promise<User> {
    return fetchApi<User>('/auth/me')
  },
  
  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token')
  },
}

// ============ Organizations ============

export const orgs = {
  async create(name: string, description?: string): Promise<Organization> {
    return fetchApi<Organization>('/orgs', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
  },
  
  async join(inviteCode: string): Promise<User> {
    return fetchApi<User>('/orgs/join', {
      method: 'POST',
      body: JSON.stringify({ invite_code: inviteCode }),
    })
  },
  
  async getCurrent(): Promise<Organization> {
    return fetchApi<Organization>('/orgs/current')
  },
  
  async getMembers(): Promise<User[]> {
    return fetchApi<User[]>('/orgs/members')
  },
  
  async regenerateInviteCode(): Promise<{ invite_code: string }> {
    return fetchApi('/orgs/invite/regenerate', { method: 'POST' })
  },
}

// ============ Teams ============

export const teams = {
  async create(name: string, description?: string): Promise<Team> {
    return fetchApi<Team>('/orgs/teams', {
      method: 'POST',
      body: JSON.stringify({ name, description }),
    })
  },
  
  async getAll(): Promise<Team[]> {
    return fetchApi<Team[]>('/orgs/teams')
  },
  
  async get(teamId: string): Promise<Team> {
    return fetchApi<Team>(`/orgs/teams/${teamId}`)
  },
  
  async join(teamId: string): Promise<void> {
    await fetchApi(`/orgs/teams/${teamId}/join`, { method: 'POST' })
  },
}

// ============ Channels ============

export const channels = {
  async create(
    name: string,
    description?: string,
    channel_type: 'public' | 'private' = 'public',
    team_id?: string
  ): Promise<Channel> {
    return fetchApi<Channel>('/channels', {
      method: 'POST',
      body: JSON.stringify({ name, description, channel_type, team_id }),
    })
  },
  
  async getAll(): Promise<Channel[]> {
    return fetchApi<Channel[]>('/channels')
  },
  
  async get(channelId: string): Promise<Channel> {
    return fetchApi<Channel>(`/channels/${channelId}`)
  },
  
  async join(channelId: string): Promise<void> {
    await fetchApi(`/channels/${channelId}/join`, { method: 'POST' })
  },
  
  async leave(channelId: string): Promise<void> {
    await fetchApi(`/channels/${channelId}/leave`, { method: 'POST' })
  },
  
  async getMessages(channelId: string, limit = 50, before?: string): Promise<Message[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.append('before', before)
    return fetchApi<Message[]>(`/channels/${channelId}/messages?${params}`)
  },
  
  async sendMessage(channelId: string, content: string): Promise<Message> {
    return fetchApi<Message>(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },
}

// ============ Direct Messages ============

export const dm = {
  async getAll(): Promise<DMConversation[]> {
    return fetchApi<DMConversation[]>('/dm')
  },
  
  async startOrGet(userId: string): Promise<DMConversation> {
    return fetchApi<DMConversation>(`/dm/${userId}`, { method: 'POST' })
  },
  
  async getMessages(dmId: string, limit = 50, before?: string): Promise<Message[]> {
    const params = new URLSearchParams({ limit: String(limit) })
    if (before) params.append('before', before)
    return fetchApi<Message[]>(`/dm/${dmId}/messages?${params}`)
  },
  
  async sendMessage(dmId: string, content: string): Promise<Message> {
    return fetchApi<Message>(`/dm/${dmId}/messages?content=${encodeURIComponent(content)}`, {
      method: 'POST',
    })
  },
}

// ============ Agent ============

export const agent = {
  async chat(message: string): Promise<AgentChatResponse> {
    return fetchApi<AgentChatResponse>('/agent/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  },
  
  async getRequests(status?: string): Promise<Request[]> {
    const params = status ? `?status_filter=${status}` : ''
    return fetchApi<Request[]>(`/agent/requests${params}`)
  },
  
  async getTasks(status?: string): Promise<Task[]> {
    const params = status ? `?status_filter=${status}` : ''
    return fetchApi<Task[]>(`/agent/tasks${params}`)
  },
  
  async completeTask(taskId: string, response: string): Promise<void> {
    await fetchApi(`/agent/tasks/${taskId}/complete?response=${encodeURIComponent(response)}`, {
      method: 'POST',
    })
  },
}

// ============ Notifications ============

export const notifications = {
  async getAll(unreadOnly = false): Promise<Notification[]> {
    const params = unreadOnly ? '?unread_only=true' : ''
    return fetchApi<Notification[]>(`/notifications${params}`)
  },
  
  async markRead(notificationId: string): Promise<void> {
    await fetchApi(`/notifications/${notificationId}/read`, { method: 'POST' })
  },
  
  async markAllRead(): Promise<void> {
    await fetchApi('/notifications/read-all', { method: 'POST' })
  },
}

// Export all
export const api = {
  auth,
  orgs,
  teams,
  channels,
  dm,
  agent,
  notifications,
}

export default api
