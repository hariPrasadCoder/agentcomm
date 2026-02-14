import { useState, useRef, useEffect } from 'react'
import { Send, Hash, Bot } from 'lucide-react'
import { cn, formatTime, getInitials } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import useStore from '@/store'
import type { Message, User } from '@/types'

interface MessageBubbleProps {
  message: Message
  sender?: User
  isOwn: boolean
}

function MessageBubble({ message, sender, isOwn }: MessageBubbleProps) {
  return (
    <div className={cn('flex gap-3 p-3 hover:bg-muted/50', isOwn && 'flex-row-reverse')}>
      <Avatar className="h-8 w-8 shrink-0">
        {message.is_from_agent ? (
          <AvatarFallback className="bg-primary text-primary-foreground">
            <Bot className="h-4 w-4" />
          </AvatarFallback>
        ) : (
          <>
            <AvatarImage src={sender?.avatar_url} />
            <AvatarFallback>{sender ? getInitials(sender.name) : '?'}</AvatarFallback>
          </>
        )}
      </Avatar>
      <div className={cn('flex-1 min-w-0', isOwn && 'text-right')}>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="font-medium text-sm">
            {message.is_from_agent ? 'AI Agent' : sender?.name || 'Unknown'}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatTime(message.created_at)}
          </span>
        </div>
        <div className={cn(
          'text-sm whitespace-pre-wrap break-words',
          message.is_from_agent && 'bg-primary/10 rounded-lg p-3'
        )}>
          {message.content}
        </div>
      </div>
    </div>
  )
}

export function ChannelChatView() {
  const { user, currentChannel, channelMessages, members, sendChannelMessage } = useStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const messages = currentChannel ? channelMessages[currentChannel.id] || [] : []
  
  useEffect(() => {
    // Scroll to bottom on new messages
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])
  
  const handleSend = async () => {
    if (!input.trim() || !currentChannel || sending) return
    
    setSending(true)
    try {
      await sendChannelMessage(currentChannel.id, input.trim())
      setInput('')
    } finally {
      setSending(false)
    }
  }
  
  if (!currentChannel) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a channel to start chatting
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Hash className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">{currentChannel.name}</h2>
        </div>
        {currentChannel.description && (
          <p className="text-sm text-muted-foreground mt-1">{currentChannel.description}</p>
        )}
      </div>
      
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-2">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <Hash className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No messages yet</p>
              <p className="text-sm">Be the first to say something!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                sender={members.find(m => m.id === msg.sender_id)}
                isOwn={msg.sender_id === user?.id}
              />
            ))
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
            placeholder={`Message #${currentChannel.name}`}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}

export function DMChatView() {
  const { user, currentDM, dmMessages, members, sendDMMessage } = useStore()
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  const messages = currentDM ? dmMessages[currentDM.id] || [] : []
  const otherUser = currentDM 
    ? members.find(m => currentDM.participant_ids.includes(m.id) && m.id !== user?.id)
    : null
  
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])
  
  const handleSend = async () => {
    if (!input.trim() || !currentDM || sending) return
    
    setSending(true)
    try {
      await sendDMMessage(currentDM.id, input.trim())
      setInput('')
    } finally {
      setSending(false)
    }
  }
  
  if (!currentDM) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        Select a conversation or start a new one
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Avatar className="h-8 w-8">
            <AvatarImage src={otherUser?.avatar_url} />
            <AvatarFallback>{otherUser ? getInitials(otherUser.name) : '?'}</AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{otherUser?.name || 'Unknown'}</h2>
            <p className="text-xs text-muted-foreground">{otherUser?.role || 'Team Member'}</p>
          </div>
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef}>
        <div className="py-2">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p>No messages yet</p>
              <p className="text-sm">Start the conversation!</p>
            </div>
          ) : (
            messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                sender={members.find(m => m.id === msg.sender_id)}
                isOwn={msg.sender_id === user?.id}
              />
            ))
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
            placeholder={`Message ${otherUser?.name || 'user'}`}
            disabled={sending}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || sending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
