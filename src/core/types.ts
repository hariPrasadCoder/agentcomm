/**
 * Core types for AgentComm
 */

export interface User {
  id: string;
  name: string;
  email?: string;
  slackId?: string;
  role?: string;
  team?: string;
  expertise?: string[];
  createdAt: Date;
}

export interface Agent {
  id: string;
  userId: string;
  name: string;
  status: 'active' | 'inactive' | 'busy';
  createdAt: Date;
}

export type RequestStatus = 'pending' | 'in_progress' | 'waiting_response' | 'completed' | 'cancelled';
export type RequestPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Request {
  id: string;
  fromUserId: string;
  fromAgentId: string;
  toUserId?: string;        // May be unknown initially
  toAgentId?: string;
  subject: string;
  description: string;
  context?: string;
  status: RequestStatus;
  priority: RequestPriority;
  dueDate?: Date;
  followUpCount: number;
  lastFollowUp?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  response?: string;
  metadata?: Record<string, unknown>;
}

export interface Message {
  id: string;
  requestId?: string;
  fromAgentId: string;
  toAgentId: string;
  content: string;
  type: 'request' | 'response' | 'follow_up' | 'info' | 'system';
  isPublic: boolean;       // Whether to store in shared memory
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export interface Task {
  id: string;
  userId: string;
  requestId: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed' | 'deferred';
  priority: RequestPriority;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface Memory {
  id: string;
  type: 'knowledge' | 'decision' | 'answer' | 'context';
  content: string;
  source: string;          // Where this came from (channel, conversation, etc)
  tags: string[];
  embedding?: number[];    // For vector search
  isPublic: boolean;
  createdAt: Date;
  expiresAt?: Date;
}

export interface OrgContext {
  teams: Team[];
  channels: Channel[];
  routingRules: RoutingRule[];
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  members: string[];       // User IDs
  expertise: string[];
}

export interface Channel {
  id: string;
  name: string;
  type: 'public' | 'private';
  team?: string;
  purpose?: string;
}

export interface RoutingRule {
  id: string;
  pattern: string;         // Topic/keyword pattern
  targetTeam?: string;
  targetUser?: string;
  priority: number;
}

// LLM Integration
export interface LLMConfig {
  provider: 'openai' | 'anthropic' | 'local';
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// Events
export type EventType = 
  | 'request.created'
  | 'request.updated'
  | 'request.completed'
  | 'task.created'
  | 'task.completed'
  | 'message.received'
  | 'message.sent'
  | 'agent.status_changed';

export interface Event {
  type: EventType;
  payload: unknown;
  timestamp: Date;
}

export type EventHandler = (event: Event) => void | Promise<void>;
