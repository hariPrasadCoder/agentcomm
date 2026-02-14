import { useState, useEffect } from 'react'
import { CheckCircle2, Clock, AlertCircle, Send } from 'lucide-react'
import { cn, formatDate, getPriorityColor } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import useStore from '@/store'
import type { Task } from '@/types'
import { getInitials } from '@/lib/utils'

interface TaskCardProps {
  task: Task
  onComplete: (response: string) => void
}

function TaskCard({ task, onComplete }: TaskCardProps) {
  const { members } = useStore()
  const [response, setResponse] = useState('')
  const [showResponse, setShowResponse] = useState(false)
  const [completing, setCompleting] = useState(false)
  
  // Find who sent this request
  const request = task.request
  const fromUser = request ? members.find(m => m.id === request.from_user_id) : null
  
  const handleComplete = async () => {
    if (!response.trim()) return
    setCompleting(true)
    try {
      await onComplete(response.trim())
    } finally {
      setCompleting(false)
      setShowResponse(false)
      setResponse('')
    }
  }
  
  const priorityIcon = {
    urgent: <AlertCircle className="h-4 w-4 text-red-500" />,
    high: <AlertCircle className="h-4 w-4 text-orange-500" />,
    normal: <Clock className="h-4 w-4 text-blue-500" />,
    low: <Clock className="h-4 w-4 text-gray-400" />,
  }[task.priority]
  
  return (
    <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
      <div className="flex items-start gap-3">
        {priorityIcon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium">{task.title}</h3>
            <span className={cn('text-xs px-2 py-0.5 rounded-full bg-muted', getPriorityColor(task.priority))}>
              {task.priority}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{task.description}</p>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {fromUser && (
                <>
                  <Avatar className="h-5 w-5">
                    <AvatarImage src={fromUser.avatar_url} />
                    <AvatarFallback className="text-[10px]">{getInitials(fromUser.name)}</AvatarFallback>
                  </Avatar>
                  <span>From {fromUser.name}</span>
                  <span>•</span>
                </>
              )}
              <span>{formatDate(task.created_at)}</span>
            </div>
            
            {task.status === 'pending' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowResponse(!showResponse)}
              >
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Respond
              </Button>
            )}
          </div>
          
          {showResponse && (
            <div className="mt-3 flex gap-2">
              <Input
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder="Type your response..."
                className="flex-1"
              />
              <Button onClick={handleComplete} disabled={!response.trim() || completing}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export function TasksView() {
  const { tasks, loadTasks, completeTask } = useStore()
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  
  useEffect(() => {
    loadTasks()
  }, [loadTasks])
  
  const filteredTasks = tasks.filter(t => {
    if (filter === 'all') return true
    if (filter === 'pending') return t.status === 'pending'
    if (filter === 'completed') return t.status === 'completed'
    return true
  })
  
  const pendingCount = tasks.filter(t => t.status === 'pending').length
  const completedCount = tasks.filter(t => t.status === 'completed').length
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold text-lg mb-3">Task Queue</h2>
        <div className="flex gap-2">
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            Pending ({pendingCount})
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
      
      {/* Tasks List */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredTasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>
                {filter === 'pending' 
                  ? "🎉 No pending tasks! You're all caught up."
                  : 'No tasks found'
                }
              </p>
            </div>
          ) : (
            filteredTasks.map(task => (
              <TaskCard
                key={task.id}
                task={task}
                onComplete={(response) => completeTask(task.id, response)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
