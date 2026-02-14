import { useState, useEffect } from 'react'
import { Send, Clock, CheckCircle2, XCircle, MessageSquare } from 'lucide-react'
import { cn, formatDate, getStatusColor, getPriorityColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import useStore from '@/store'
import type { Request } from '@/types'
import { getInitials } from '@/lib/utils'

interface RequestCardProps {
  request: Request
}

function RequestCard({ request }: RequestCardProps) {
  const { members } = useStore()
  const toUser = request.to_user_id ? members.find(m => m.id === request.to_user_id) : null
  
  const statusIcon = {
    pending: <Clock className="h-4 w-4 text-yellow-500" />,
    in_progress: <MessageSquare className="h-4 w-4 text-blue-500" />,
    waiting_response: <MessageSquare className="h-4 w-4 text-purple-500" />,
    completed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
    cancelled: <XCircle className="h-4 w-4 text-gray-400" />,
  }[request.status]
  
  const statusLabel = {
    pending: 'Pending',
    in_progress: 'In Progress',
    waiting_response: 'Waiting',
    completed: 'Completed',
    cancelled: 'Cancelled',
  }[request.status]
  
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {statusIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium">{request.subject}</h3>
            <span className={cn('text-xs px-2 py-0.5 rounded-full bg-muted', getStatusColor(request.status))}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{request.content}</p>
          
          {request.response && (
            <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3 mb-3">
              <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-1">Response:</p>
              <p className="text-sm">{request.response}</p>
            </div>
          )}
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              {toUser && (
                <>
                  <span>To:</span>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={toUser.avatar_url} />
                    <AvatarFallback className="text-[10px]">{getInitials(toUser.name)}</AvatarFallback>
                  </Avatar>
                  <span>{toUser.name}</span>
                  <span>•</span>
                </>
              )}
              <span>{formatDate(request.created_at)}</span>
            </div>
            
            {request.follow_up_count > 0 && (
              <span className="text-orange-500">
                {request.follow_up_count} follow-up{request.follow_up_count > 1 ? 's' : ''} sent
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function RequestsView() {
  const { requests, loadRequests } = useStore()
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('active')
  
  useEffect(() => {
    loadRequests()
  }, [loadRequests])
  
  const filteredRequests = requests.filter(r => {
    if (filter === 'all') return true
    if (filter === 'active') return r.status !== 'completed' && r.status !== 'cancelled'
    if (filter === 'completed') return r.status === 'completed'
    return true
  })
  
  const activeCount = requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled').length
  const completedCount = requests.filter(r => r.status === 'completed').length
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-lg mb-3">My Requests</h2>
        <p className="text-sm text-muted-foreground mb-3">
          Track requests you've sent through your AI agent
        </p>
        <div className="flex gap-2">
          <Button
            variant={filter === 'active' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('active')}
          >
            Active ({activeCount})
          </Button>
          <Button
            variant={filter === 'completed' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('completed')}
          >
            Completed ({completedCount})
          </Button>
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
        </div>
      </div>
      
      {/* Requests List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No requests yet</p>
              <p className="text-sm">Use the AI Agent to send requests to your team</p>
            </div>
          ) : (
            filteredRequests.map(request => (
              <RequestCard key={request.id} request={request} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
