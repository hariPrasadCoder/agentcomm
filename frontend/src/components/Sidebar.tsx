import { useState } from 'react'
import { 
  Hash, MessageSquare, Bot, ListTodo, Send, 
  Plus, ChevronDown, ChevronRight, Settings,
  Users, Bell
} from 'lucide-react'
import { cn, getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import useStore from '@/store'
import type { Channel, DMConversation } from '@/types'

interface SidebarProps {
  onCreateChannel: () => void
  onStartDM: () => void
}

export function Sidebar({ onCreateChannel, onStartDM }: SidebarProps) {
  const { 
    user, 
    organization,
    channels, 
    dmConversations,
    currentChannel,
    currentDM,
    members,
    activeView,
    tasks,
    unreadCount,
    selectChannel,
    selectDM,
    setActiveView,
    logout
  } = useStore()
  
  const [channelsExpanded, setChannelsExpanded] = useState(true)
  const [dmsExpanded, setDmsExpanded] = useState(true)
  
  const pendingTasksCount = tasks.filter(t => t.status === 'pending').length
  
  const getOtherParticipant = (dm: DMConversation) => {
    const otherId = dm.participant_ids.find(id => id !== user?.id)
    return members.find(m => m.id === otherId)
  }
  
  return (
    <div className="flex flex-col h-full bg-secondary/50 w-64 border-r">
      {/* Org Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center text-primary-foreground font-bold">
              {organization?.name[0]?.toUpperCase() || 'A'}
            </div>
            <div className="font-semibold truncate">{organization?.name || 'AgentComm'}</div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2">
          {/* Agent Chat */}
          <Button
            variant={activeView === 'agent' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-1"
            onClick={() => setActiveView('agent')}
          >
            <Bot className="h-4 w-4" />
            <span>AI Agent</span>
          </Button>
          
          {/* Tasks */}
          <Button
            variant={activeView === 'tasks' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-1"
            onClick={() => setActiveView('tasks')}
          >
            <ListTodo className="h-4 w-4" />
            <span>Tasks</span>
            {pendingTasksCount > 0 && (
              <span className="ml-auto bg-primary text-primary-foreground text-xs px-2 py-0.5 rounded-full">
                {pendingTasksCount}
              </span>
            )}
          </Button>
          
          {/* Requests */}
          <Button
            variant={activeView === 'requests' ? 'secondary' : 'ghost'}
            className="w-full justify-start gap-2 mb-1"
            onClick={() => setActiveView('requests')}
          >
            <Send className="h-4 w-4" />
            <span>My Requests</span>
          </Button>
          
          {/* Notifications */}
          <Button
            variant="ghost"
            className="w-full justify-start gap-2 mb-4"
            onClick={() => {/* TODO: Show notifications panel */}}
          >
            <Bell className="h-4 w-4" />
            <span>Notifications</span>
            {unreadCount > 0 && (
              <span className="ml-auto bg-destructive text-destructive-foreground text-xs px-2 py-0.5 rounded-full">
                {unreadCount}
              </span>
            )}
          </Button>
          
          {/* Channels Section */}
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setChannelsExpanded(!channelsExpanded)}
            >
              <span className="flex items-center gap-1">
                {channelsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Channels
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation()
                  onCreateChannel()
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </button>
            
            {channelsExpanded && (
              <div className="mt-1 space-y-0.5">
                {channels.map((channel) => (
                  <Button
                    key={channel.id}
                    variant={currentChannel?.id === channel.id ? 'secondary' : 'ghost'}
                    className="w-full justify-start gap-2 h-8 px-2"
                    onClick={() => selectChannel(channel)}
                  >
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    <span className="truncate">{channel.name}</span>
                  </Button>
                ))}
              </div>
            )}
          </div>
          
          {/* Direct Messages Section */}
          <div className="mb-4">
            <button
              className="flex items-center justify-between w-full px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setDmsExpanded(!dmsExpanded)}
            >
              <span className="flex items-center gap-1">
                {dmsExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Direct Messages
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={(e) => {
                  e.stopPropagation()
                  onStartDM()
                }}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </button>
            
            {dmsExpanded && (
              <div className="mt-1 space-y-0.5">
                {dmConversations.map((dm) => {
                  const other = getOtherParticipant(dm)
                  if (!other) return null
                  
                  return (
                    <Button
                      key={dm.id}
                      variant={currentDM?.id === dm.id ? 'secondary' : 'ghost'}
                      className="w-full justify-start gap-2 h-8 px-2"
                      onClick={() => selectDM(dm)}
                    >
                      <Avatar className="h-5 w-5">
                        <AvatarImage src={other.avatar_url} />
                        <AvatarFallback className="text-[10px]">
                          {getInitials(other.name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{other.name}</span>
                    </Button>
                  )
                })}
              </div>
            )}
          </div>
          
          {/* Team Members */}
          <div>
            <button
              className="flex items-center w-full px-2 py-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Users className="h-3 w-3 mr-1" />
              Team ({members.length})
            </button>
          </div>
        </div>
      </ScrollArea>
      
      {/* User Footer */}
      <div className="p-3 border-t">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatar_url} />
            <AvatarFallback>{user ? getInitials(user.name) : '?'}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{user?.name}</div>
            <div className="text-xs text-muted-foreground truncate">{user?.role || 'Team Member'}</div>
          </div>
          <Button variant="ghost" size="sm" onClick={logout}>
            Logout
          </Button>
        </div>
      </div>
    </div>
  )
}
