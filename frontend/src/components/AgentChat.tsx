import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Sparkles, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import useStore from '@/store'

export function AgentChat() {
  const { user, agentMessages, chatWithAgent, clearAgentChat } = useStore()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [agentMessages])
  
  const handleSend = async () => {
    if (!input.trim() || loading) return
    
    const message = input.trim()
    setInput('')
    setLoading(true)
    
    try {
      await chatWithAgent(message)
    } finally {
      setLoading(false)
    }
  }
  
  const suggestions = [
    "I need the Q4 report from marketing",
    "What's on my task list?",
    "Check status of my requests",
    "Send a message to the design team",
  ]
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Bot className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="font-semibold">AI Agent</h2>
              <p className="text-xs text-muted-foreground">Your personal communication assistant</p>
            </div>
          </div>
          {agentMessages.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearAgentChat}>
              <Trash2 className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="p-4 space-y-4">
          {agentMessages.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <h3 className="font-semibold text-lg mb-2">Hi {user?.name}! 👋</h3>
              <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                I'm your AI communication assistant. I can route requests to the right people, 
                track follow-ups, and manage your task queue.
              </p>
              
              <div className="text-left max-w-md mx-auto">
                <p className="text-sm text-muted-foreground mb-2">Try asking me:</p>
                <div className="space-y-2">
                  {suggestions.map((suggestion, i) => (
                    <button
                      key={i}
                      className="w-full text-left px-4 py-2 rounded-lg border hover:bg-muted transition-colors text-sm"
                      onClick={() => {
                        setInput(suggestion)
                      }}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            agentMessages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  'flex gap-3',
                  msg.role === 'user' && 'flex-row-reverse'
                )}
              >
                <div className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center shrink-0',
                  msg.role === 'user' 
                    ? 'bg-secondary' 
                    : 'bg-gradient-to-br from-blue-500 to-purple-600'
                )}>
                  {msg.role === 'user' ? (
                    <User className="h-4 w-4" />
                  ) : (
                    <Bot className="h-4 w-4 text-white" />
                  )}
                </div>
                <div className={cn(
                  'flex-1 max-w-[80%]',
                  msg.role === 'user' && 'text-right'
                )}>
                  <div className={cn(
                    'inline-block rounded-lg px-4 py-2 text-sm whitespace-pre-wrap',
                    msg.role === 'user' 
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}>
                    {msg.content}
                  </div>
                </div>
              </div>
            ))
          )}
          
          {loading && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-white" />
              </div>
              <div className="bg-muted rounded-lg px-4 py-2">
                <div className="flex gap-1">
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
      
      {/* Input */}
      <div className="border-t p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            handleSend()
          }}
          className="flex gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask your agent anything..."
            disabled={loading}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || loading}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
