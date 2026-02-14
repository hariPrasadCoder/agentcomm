import { useState } from 'react'
import { Sidebar } from '@/components/Sidebar'
import { ChannelChatView, DMChatView } from '@/components/ChatView'
import { AgentChat } from '@/components/AgentChat'
import { TasksView } from '@/components/TasksView'
import { RequestsView } from '@/components/RequestsView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { X, Hash, MessageSquare } from 'lucide-react'
import useStore from '@/store'
import { getInitials } from '@/lib/utils'

// Modal component for creating channels and starting DMs
interface ModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
}

function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function DashboardPage() {
  const { activeView, createChannel, startDM, members, user } = useStore()
  const [createChannelOpen, setCreateChannelOpen] = useState(false)
  const [startDMOpen, setStartDMOpen] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDesc, setNewChannelDesc] = useState('')
  const [creatingChannel, setCreatingChannel] = useState(false)
  
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return
    
    setCreatingChannel(true)
    try {
      await createChannel(newChannelName.trim(), newChannelDesc.trim() || undefined)
      setNewChannelName('')
      setNewChannelDesc('')
      setCreateChannelOpen(false)
    } finally {
      setCreatingChannel(false)
    }
  }
  
  const handleStartDM = async (userId: string) => {
    await startDM(userId)
    setStartDMOpen(false)
  }
  
  const otherMembers = members.filter(m => m.id !== user?.id)
  
  const renderMainContent = () => {
    switch (activeView) {
      case 'agent':
        return <AgentChat />
      case 'tasks':
        return <TasksView />
      case 'requests':
        return <RequestsView />
      case 'dm':
        return <DMChatView />
      case 'channels':
      default:
        return <ChannelChatView />
    }
  }
  
  return (
    <div className="h-screen flex">
      <Sidebar 
        onCreateChannel={() => setCreateChannelOpen(true)}
        onStartDM={() => setStartDMOpen(true)}
      />
      <main className="flex-1 flex flex-col">
        {renderMainContent()}
      </main>
      
      {/* Create Channel Modal */}
      <Modal 
        isOpen={createChannelOpen} 
        onClose={() => setCreateChannelOpen(false)}
        title="Create a channel"
      >
        <form onSubmit={handleCreateChannel} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">Channel name</label>
            <div className="flex items-center gap-2">
              <Hash className="h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                value={newChannelName}
                onChange={(e) => setNewChannelName(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                placeholder="e.g., marketing"
                required
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Description (optional)</label>
            <Input
              type="text"
              value={newChannelDesc}
              onChange={(e) => setNewChannelDesc(e.target.value)}
              placeholder="What's this channel about?"
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" onClick={() => setCreateChannelOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!newChannelName.trim() || creatingChannel}>
              {creatingChannel ? 'Creating...' : 'Create Channel'}
            </Button>
          </div>
        </form>
      </Modal>
      
      {/* Start DM Modal */}
      <Modal 
        isOpen={startDMOpen} 
        onClose={() => setStartDMOpen(false)}
        title="Start a conversation"
      >
        <p className="text-sm text-muted-foreground mb-4">
          Select a team member to start a direct message
        </p>
        <ScrollArea className="max-h-64">
          <div className="space-y-1">
            {otherMembers.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">
                No other team members yet
              </p>
            ) : (
              otherMembers.map(member => (
                <button
                  key={member.id}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-muted transition-colors text-left"
                  onClick={() => handleStartDM(member.id)}
                >
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={member.avatar_url} />
                    <AvatarFallback>{getInitials(member.name)}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">{member.name}</div>
                    <div className="text-sm text-muted-foreground truncate">
                      {member.role || 'Team Member'}
                    </div>
                  </div>
                  <MessageSquare className="h-4 w-4 text-muted-foreground" />
                </button>
              ))
            )}
          </div>
        </ScrollArea>
      </Modal>
    </div>
  )
}
