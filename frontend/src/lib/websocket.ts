/**
 * WebSocket client for real-time updates
 */

type EventHandler = (payload: Record<string, unknown>) => void

class WebSocketClient {
  private ws: WebSocket | null = null
  private handlers: Map<string, Set<EventHandler>> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  
  connect(token: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    
    this.ws = new WebSocket(`${protocol}//${host}/ws/${token}`)
    
    this.ws.onopen = () => {
      console.log('WebSocket connected')
      this.reconnectAttempts = 0
      this.startHeartbeat()
    }
    
    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        this.emit(data.event, data.payload)
      } catch (e) {
        console.error('Failed to parse WebSocket message:', e)
      }
    }
    
    this.ws.onclose = () => {
      console.log('WebSocket disconnected')
      this.stopHeartbeat()
      this.attemptReconnect(token)
    }
    
    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }
  }
  
  disconnect(): void {
    this.stopHeartbeat()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }
  
  private heartbeatInterval: number | null = null
  
  private startHeartbeat(): void {
    this.heartbeatInterval = window.setInterval(() => {
      this.send('ping', {})
    }, 30000)
  }
  
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }
  
  private attemptReconnect(token: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached')
      return
    }
    
    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    
    console.log(`Attempting reconnect in ${delay}ms...`)
    setTimeout(() => this.connect(token), delay)
  }
  
  send(event: string, payload: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ event, payload }))
    }
  }
  
  on(event: string, handler: EventHandler): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler)
    
    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler)
    }
  }
  
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler)
  }
  
  private emit(event: string, payload: Record<string, unknown>): void {
    // Call specific handlers
    this.handlers.get(event)?.forEach(handler => handler(payload))
    
    // Call wildcard handlers
    this.handlers.get('*')?.forEach(handler => handler({ event, ...payload }))
  }
  
  // Convenience methods for typing indicators
  sendTyping(channelId?: string, dmId?: string): void {
    this.send('typing', { channel_id: channelId, dm_id: dmId })
  }
}

// Singleton instance
export const ws = new WebSocketClient()

export default ws
