/**
 * Global state management with Zustand
 */

import { create } from 'zustand'
import type {
  User,
  Organization,
  Channel,
  Message,
  DMConversation,
  Task,
  Request,
  Notification,
} from '@/types'
import api from '@/lib/api'
import { ws } from '@/lib/websocket'

interface AppState {
  // Auth
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  
  // Organization
  organization: Organization | null
  members: User[]
  
  // Channels & Messages
  channels: Channel[]
  currentChannel: Channel | null
  channelMessages: Record<string, Message[]>
  
  // DMs
  dmConversations: DMConversation[]
  currentDM: DMConversation | null
  dmMessages: Record<string, Message[]>
  
  // Agent
  tasks: Task[]
  requests: Request[]
  agentMessages: Array<{ role: 'user' | 'agent'; content: string }>
  
  // Notifications
  notifications: Notification[]
  unreadCount: number
  
  // UI State
  sidebarCollapsed: boolean
  activeView: 'channels' | 'dm' | 'agent' | 'tasks' | 'requests'
  
  // Actions
  initialize: () => Promise<void>
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string, name: string, role?: string) => Promise<void>
  logout: () => Promise<void>
  
  createOrg: (name: string, description?: string) => Promise<void>
  joinOrg: (inviteCode: string) => Promise<void>
  loadMembers: () => Promise<void>
  
  loadChannels: () => Promise<void>
  selectChannel: (channel: Channel | null) => void
  loadChannelMessages: (channelId: string) => Promise<void>
  sendChannelMessage: (channelId: string, content: string) => Promise<void>
  createChannel: (name: string, description?: string) => Promise<void>
  
  loadDMs: () => Promise<void>
  selectDM: (dm: DMConversation | null) => void
  startDM: (userId: string) => Promise<DMConversation>
  loadDMMessages: (dmId: string) => Promise<void>
  sendDMMessage: (dmId: string, content: string) => Promise<void>
  
  loadTasks: () => Promise<void>
  loadRequests: () => Promise<void>
  completeTask: (taskId: string, response: string) => Promise<void>
  
  chatWithAgent: (message: string) => Promise<void>
  clearAgentChat: () => void
  
  loadNotifications: () => Promise<void>
  markNotificationRead: (id: string) => Promise<void>
  markAllNotificationsRead: () => Promise<void>
  
  setActiveView: (view: AppState['activeView']) => void
  toggleSidebar: () => void
  
  // WebSocket handlers
  handleNewMessage: (message: Message) => void
  handleNotification: (notification: Notification) => void
}

export const useStore = create<AppState>((set, get) => ({
  // Initial state
  user: null,
  isAuthenticated: false,
  isLoading: true,
  
  organization: null,
  members: [],
  
  channels: [],
  currentChannel: null,
  channelMessages: {},
  
  dmConversations: [],
  currentDM: null,
  dmMessages: {},
  
  tasks: [],
  requests: [],
  agentMessages: [],
  
  notifications: [],
  unreadCount: 0,
  
  sidebarCollapsed: false,
  activeView: 'channels',
  
  // Initialize app - check auth and load data
  initialize: async () => {
    set({ isLoading: true })
    
    try {
      if (api.auth.isAuthenticated()) {
        const user = await api.auth.getMe()
        set({ user, isAuthenticated: true })
        
        if (user.org_id) {
          const org = await api.orgs.getCurrent()
          set({ organization: org })
          
          // Load initial data
          await Promise.all([
            get().loadChannels(),
            get().loadDMs(),
            get().loadMembers(),
            get().loadTasks(),
            get().loadNotifications(),
          ])
          
          // Connect WebSocket
          const token = localStorage.getItem('access_token')
          if (token) {
            ws.connect(token)
            
            // Set up WebSocket handlers
            ws.on('new_message', (payload) => {
              get().handleNewMessage(payload as unknown as Message)
            })
            ws.on('notification', (payload) => {
              get().handleNotification(payload as unknown as Notification)
            })
          }
        }
      }
    } catch (error) {
      console.error('Initialization error:', error)
      localStorage.removeItem('access_token')
      set({ user: null, isAuthenticated: false })
    } finally {
      set({ isLoading: false })
    }
  },
  
  login: async (email, password) => {
    const result = await api.auth.login(email, password)
    set({ user: result, isAuthenticated: true })
    await get().initialize()
  },
  
  signup: async (email, password, name, role) => {
    const result = await api.auth.signup(email, password, name, role)
    set({ user: result, isAuthenticated: true })
  },
  
  logout: async () => {
    await api.auth.logout()
    ws.disconnect()
    set({
      user: null,
      isAuthenticated: false,
      organization: null,
      channels: [],
      currentChannel: null,
      channelMessages: {},
      dmConversations: [],
      currentDM: null,
      dmMessages: {},
      tasks: [],
      requests: [],
      agentMessages: [],
      notifications: [],
    })
  },
  
  createOrg: async (name, description) => {
    const org = await api.orgs.create(name, description)
    const user = await api.auth.getMe()
    set({ organization: org, user })
    await get().initialize()
  },
  
  joinOrg: async (inviteCode) => {
    const user = await api.orgs.join(inviteCode)
    set({ user })
    await get().initialize()
  },
  
  loadMembers: async () => {
    const members = await api.orgs.getMembers()
    set({ members })
  },
  
  loadChannels: async () => {
    const channels = await api.channels.getAll()
    set({ channels })
    
    // Auto-select first channel if none selected
    if (!get().currentChannel && channels.length > 0) {
      get().selectChannel(channels[0])
    }
  },
  
  selectChannel: (channel) => {
    set({ currentChannel: channel, currentDM: null, activeView: 'channels' })
    if (channel) {
      get().loadChannelMessages(channel.id)
    }
  },
  
  loadChannelMessages: async (channelId) => {
    const messages = await api.channels.getMessages(channelId)
    set((state) => ({
      channelMessages: { ...state.channelMessages, [channelId]: messages },
    }))
  },
  
  sendChannelMessage: async (channelId, content) => {
    const message = await api.channels.sendMessage(channelId, content)
    set((state) => ({
      channelMessages: {
        ...state.channelMessages,
        [channelId]: [...(state.channelMessages[channelId] || []), message],
      },
    }))
  },
  
  createChannel: async (name, description) => {
    const channel = await api.channels.create(name, description)
    set((state) => ({ channels: [...state.channels, channel] }))
  },
  
  loadDMs: async () => {
    const dms = await api.dm.getAll()
    set({ dmConversations: dms })
  },
  
  selectDM: (dm) => {
    set({ currentDM: dm, currentChannel: null, activeView: 'dm' })
    if (dm) {
      get().loadDMMessages(dm.id)
    }
  },
  
  startDM: async (userId) => {
    const dm = await api.dm.startOrGet(userId)
    set((state) => {
      const exists = state.dmConversations.some((d) => d.id === dm.id)
      return {
        dmConversations: exists ? state.dmConversations : [...state.dmConversations, dm],
        currentDM: dm,
        currentChannel: null,
        activeView: 'dm',
      }
    })
    await get().loadDMMessages(dm.id)
    return dm
  },
  
  loadDMMessages: async (dmId) => {
    const messages = await api.dm.getMessages(dmId)
    set((state) => ({
      dmMessages: { ...state.dmMessages, [dmId]: messages },
    }))
  },
  
  sendDMMessage: async (dmId, content) => {
    const message = await api.dm.sendMessage(dmId, content)
    set((state) => ({
      dmMessages: {
        ...state.dmMessages,
        [dmId]: [...(state.dmMessages[dmId] || []), message],
      },
    }))
  },
  
  loadTasks: async () => {
    const tasks = await api.agent.getTasks()
    set({ tasks })
  },
  
  loadRequests: async () => {
    const requests = await api.agent.getRequests()
    set({ requests })
  },
  
  completeTask: async (taskId, response) => {
    await api.agent.completeTask(taskId, response)
    await get().loadTasks()
  },
  
  chatWithAgent: async (message) => {
    // Add user message
    set((state) => ({
      agentMessages: [...state.agentMessages, { role: 'user', content: message }],
    }))
    
    // Get agent response
    const response = await api.agent.chat(message)
    
    // Add agent response
    set((state) => ({
      agentMessages: [...state.agentMessages, { role: 'agent', content: response.response }],
    }))
    
    // Reload tasks/requests if action was taken
    if (response.action_taken) {
      await Promise.all([get().loadTasks(), get().loadRequests()])
    }
  },
  
  clearAgentChat: () => {
    set({ agentMessages: [] })
  },
  
  loadNotifications: async () => {
    const notifications = await api.notifications.getAll()
    const unreadCount = notifications.filter((n) => !n.is_read).length
    set({ notifications, unreadCount })
  },
  
  markNotificationRead: async (id) => {
    await api.notifications.markRead(id)
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, is_read: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }))
  },
  
  markAllNotificationsRead: async () => {
    await api.notifications.markAllRead()
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, is_read: true })),
      unreadCount: 0,
    }))
  },
  
  setActiveView: (view) => {
    set({ activeView: view })
    if (view === 'agent') {
      set({ currentChannel: null, currentDM: null })
    }
  },
  
  toggleSidebar: () => {
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }))
  },
  
  // WebSocket handlers
  handleNewMessage: (message) => {
    if (message.channel_id) {
      set((state) => {
        const current = state.channelMessages[message.channel_id!] || []
        if (current.some((m) => m.id === message.id)) return state
        return {
          channelMessages: {
            ...state.channelMessages,
            [message.channel_id!]: [...current, message],
          },
        }
      })
    } else if (message.dm_conversation_id) {
      set((state) => {
        const current = state.dmMessages[message.dm_conversation_id!] || []
        if (current.some((m) => m.id === message.id)) return state
        return {
          dmMessages: {
            ...state.dmMessages,
            [message.dm_conversation_id!]: [...current, message],
          },
        }
      })
    }
  },
  
  handleNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    }))
  },
}))

export default useStore
