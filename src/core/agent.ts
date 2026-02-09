/**
 * Core Agent - The brain of AgentComm
 * 
 * Each user has an agent that:
 * 1. Receives requests from their human
 * 2. Determines who to route requests to
 * 3. Communicates with other agents
 * 4. Tracks requests and follows up
 * 5. Manages the user's task queue
 */

import { LLMClient, SYSTEM_PROMPTS } from './llm.js';
import { Storage } from '../storage/database.js';
import type { 
  User, Agent as AgentRecord, Request, Task, Message, 
  LLMConfig, OrgContext, EventHandler, Event
} from './types.js';

export interface AgentConfig {
  llmConfig: LLMConfig;
  dbPath?: string;
  followUpIntervalMs?: number;
  maxFollowUps?: number;
}

interface RoutingDecision {
  targetUserId: string | null;
  targetTeam: string | null;
  confidence: number;
  reasoning: string;
  formattedRequest: string;
}

export class CommunicationAgent {
  private user: User;
  private agent: AgentRecord;
  private llm: LLMClient;
  private storage: Storage;
  private orgContext: OrgContext;
  private eventHandlers: Map<string, EventHandler[]> = new Map();
  private config: AgentConfig;

  constructor(
    user: User,
    agent: AgentRecord,
    config: AgentConfig,
    storage: Storage,
    orgContext: OrgContext
  ) {
    this.user = user;
    this.agent = agent;
    this.config = config;
    this.llm = new LLMClient(config.llmConfig);
    this.storage = storage;
    this.orgContext = orgContext;
  }

  /**
   * Handle a message from the user
   */
  async handleUserMessage(message: string): Promise<string> {
    // First, understand the intent
    const intent = await this.classifyIntent(message);

    switch (intent.type) {
      case 'request':
        return this.handleNewRequest(message, intent);
      case 'status':
        return this.handleStatusQuery(message);
      case 'tasks':
        return this.handleTasksQuery();
      case 'respond':
        return this.handleResponseToRequest(message, intent);
      case 'general':
        return this.handleGeneralQuery(message);
      default:
        return this.handleGeneralQuery(message);
    }
  }

  /**
   * Classify what the user is trying to do
   */
  private async classifyIntent(message: string): Promise<{
    type: 'request' | 'status' | 'tasks' | 'respond' | 'general';
    requestId?: string;
    details?: string;
  }> {
    const pendingTasks = this.storage.getTasksForUser(this.user.id, 'pending');
    const outgoingRequests = this.storage.getRequestsByFromUser(this.user.id);
    
    const response = await this.llm.chat([
      {
        role: 'user',
        content: `Classify this message intent:
"${message}"

Context:
- User has ${pendingTasks.length} pending tasks
- User has ${outgoingRequests.filter(r => r.status !== 'completed').length} active outgoing requests

Respond with JSON only:
{
  "type": "request" | "status" | "tasks" | "respond" | "general",
  "requestId": "if responding to specific request",
  "details": "any relevant details"
}

- "request": User wants something from someone else
- "status": User asking about status of their requests  
- "tasks": User asking what they need to do
- "respond": User responding to a task/request in their queue
- "general": General question or chat`
      }
    ]);

    try {
      return JSON.parse(response.content);
    } catch {
      return { type: 'general' };
    }
  }

  /**
   * Handle a new request - route it to the right person
   */
  private async handleNewRequest(
    message: string, 
    intent: { details?: string }
  ): Promise<string> {
    // Determine who should handle this
    const routing = await this.routeRequest(message);
    
    if (!routing.targetUserId && !routing.targetTeam) {
      return `I couldn't determine who should handle this request. Could you tell me who to ask, or which team this is for?\n\nYour request: "${message}"`;
    }

    // Find the target user
    let targetUser: User | null = null;
    if (routing.targetUserId) {
      targetUser = this.storage.getUser(routing.targetUserId);
    } else if (routing.targetTeam) {
      // Find someone from the team
      const team = this.orgContext.teams.find(t => t.name === routing.targetTeam);
      if (team && team.members.length > 0) {
        targetUser = this.storage.getUser(team.members[0]);
      }
    }

    if (!targetUser) {
      return `I found that ${routing.targetTeam || 'the right team'} should handle this, but I couldn't find a specific person. Could you help me identify who to ask?`;
    }

    // Create the request
    const request = this.storage.createRequest({
      fromUserId: this.user.id,
      fromAgentId: this.agent.id,
      toUserId: targetUser.id,
      toAgentId: this.storage.getAgentByUserId(targetUser.id)?.id,
      subject: this.extractSubject(message),
      description: routing.formattedRequest,
      status: 'pending',
      priority: 'normal',
    });

    // Create a task for the target user
    this.storage.createTask({
      userId: targetUser.id,
      requestId: request.id,
      title: `Request from ${this.user.name}`,
      description: routing.formattedRequest,
      status: 'pending',
      priority: 'normal',
    });

    // Emit event
    this.emit({ type: 'request.created', payload: request, timestamp: new Date() });

    return `Got it! I've sent your request to ${targetUser.name}.\n\n**Request:** ${routing.formattedRequest}\n\nI'll follow up if they don't respond and let you know when I have an answer.`;
  }

  /**
   * Route a request to the right person/team
   */
  private async routeRequest(message: string): Promise<RoutingDecision> {
    const users = this.storage.getAllUsers();
    
    const orgContextStr = `
Teams: ${JSON.stringify(this.orgContext.teams)}
Users: ${JSON.stringify(users.map(u => ({ id: u.id, name: u.name, role: u.role, team: u.team, expertise: u.expertise })))}
Routing Rules: ${JSON.stringify(this.orgContext.routingRules)}
    `;

    const response = await this.llm.chat([
      {
        role: 'user',
        content: `Route this request to the right person:

"${message}"

Organizational context:
${orgContextStr}

Respond with JSON:
{
  "targetUserId": "user id or null",
  "targetTeam": "team name or null",
  "confidence": 0.0-1.0,
  "reasoning": "why this target",
  "formattedRequest": "clear, actionable version of the request"
}`
      }
    ], SYSTEM_PROMPTS.router);

    try {
      return JSON.parse(response.content);
    } catch {
      return {
        targetUserId: null,
        targetTeam: null,
        confidence: 0,
        reasoning: 'Failed to parse routing response',
        formattedRequest: message,
      };
    }
  }

  /**
   * Handle status query - show user their outgoing requests
   */
  private async handleStatusQuery(message: string): Promise<string> {
    const requests = this.storage.getRequestsByFromUser(this.user.id);
    const active = requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    
    if (active.length === 0) {
      return "You don't have any active requests at the moment.";
    }

    const statusLines = active.map(r => {
      const target = r.toUserId ? this.storage.getUser(r.toUserId)?.name : 'Unknown';
      return `• **${r.subject}** → ${target} (${r.status})`;
    });

    return `**Your Active Requests:**\n\n${statusLines.join('\n')}`;
  }

  /**
   * Handle tasks query - show user what others need from them
   */
  private async handleTasksQuery(): Promise<string> {
    const tasks = this.storage.getTasksForUser(this.user.id, 'pending');
    
    if (tasks.length === 0) {
      return "🎉 No pending tasks! You're all caught up.";
    }

    const taskLines = tasks.map((t, i) => {
      const request = this.storage.getRequest(t.requestId);
      const from = request?.fromUserId ? this.storage.getUser(request.fromUserId)?.name : 'Unknown';
      return `${i + 1}. **${t.title}** (from ${from})\n   ${t.description}`;
    });

    return `**Your Task Queue (${tasks.length}):**\n\n${taskLines.join('\n\n')}\n\nReply to a task by number, or say "complete 1" to mark it done.`;
  }

  /**
   * Handle user responding to a request in their queue
   */
  private async handleResponseToRequest(
    message: string,
    intent: { requestId?: string }
  ): Promise<string> {
    // Try to find which task/request they're responding to
    const tasks = this.storage.getTasksForUser(this.user.id, 'pending');
    
    if (tasks.length === 0) {
      return "You don't have any pending tasks to respond to.";
    }

    // Check if they specified a number
    const numMatch = message.match(/^(\d+)[.:\s]/);
    let targetTask = tasks[0];
    
    if (numMatch) {
      const idx = parseInt(numMatch[1]) - 1;
      if (idx >= 0 && idx < tasks.length) {
        targetTask = tasks[idx];
      }
    }

    // Get the request and update it
    const request = this.storage.getRequest(targetTask.requestId);
    if (!request) {
      return "Couldn't find the associated request. Please try again.";
    }

    // Clean up the response (remove number prefix if present)
    const cleanResponse = message.replace(/^\d+[.:\s]+/, '').trim();

    // Update request with response
    this.storage.updateRequest(request.id, {
      status: 'completed',
      response: cleanResponse,
      completedAt: new Date(),
    });

    // Mark task as completed
    this.storage.updateTask(targetTask.id, { status: 'completed' });

    // Emit event
    this.emit({ type: 'request.completed', payload: { request, response: cleanResponse }, timestamp: new Date() });

    const requester = this.storage.getUser(request.fromUserId);
    return `✅ Response sent to ${requester?.name || 'requester'}!\n\nYour response: "${cleanResponse}"`;
  }

  /**
   * Handle general queries
   */
  private async handleGeneralQuery(message: string): Promise<string> {
    // Check memory first
    const memories = this.storage.searchMemories(message, 5);
    
    const memoryContext = memories.length > 0
      ? `\n\nRelevant context from team knowledge:\n${memories.map(m => `- ${m.content}`).join('\n')}`
      : '';

    const response = await this.llm.chat([
      {
        role: 'user',
        content: `${message}${memoryContext}`
      }
    ], SYSTEM_PROMPTS.responder);

    return response.content;
  }

  /**
   * Handle incoming request from another agent
   */
  async handleIncomingRequest(request: Request, fromUser: User): Promise<void> {
    // Create task in user's queue
    this.storage.createTask({
      userId: this.user.id,
      requestId: request.id,
      title: `Request from ${fromUser.name}`,
      description: request.description,
      status: 'pending',
      priority: request.priority,
      dueDate: request.dueDate,
    });

    this.emit({ type: 'task.created', payload: { request, fromUser }, timestamp: new Date() });
  }

  /**
   * Process follow-ups for stale requests
   */
  async processFollowUps(): Promise<void> {
    const requests = this.storage.getRequestsByFromUser(this.user.id);
    const staleRequests = requests.filter(r => {
      if (r.status === 'completed' || r.status === 'cancelled') return false;
      if (r.followUpCount >= (this.config.maxFollowUps || 3)) return false;
      
      const lastActivity = r.lastFollowUp || r.createdAt;
      const hoursSinceActivity = (Date.now() - lastActivity.getTime()) / (1000 * 60 * 60);
      return hoursSinceActivity >= 24; // Follow up after 24 hours
    });

    for (const request of staleRequests) {
      await this.sendFollowUp(request);
    }
  }

  private async sendFollowUp(request: Request): Promise<void> {
    const targetUser = request.toUserId ? this.storage.getUser(request.toUserId) : null;
    if (!targetUser) return;

    // Generate follow-up message
    const response = await this.llm.chat([
      {
        role: 'user',
        content: `Generate a polite follow-up for this request:
Subject: ${request.subject}
Original request: ${request.description}
Days waiting: ${Math.floor((Date.now() - request.createdAt.getTime()) / (1000 * 60 * 60 * 24))}
Previous follow-ups: ${request.followUpCount}`
      }
    ], SYSTEM_PROMPTS.followUp);

    // Update request
    this.storage.updateRequest(request.id, {
      followUpCount: request.followUpCount + 1,
      lastFollowUp: new Date(),
    });

    // Create message record
    this.storage.createMessage({
      requestId: request.id,
      fromAgentId: this.agent.id,
      toAgentId: request.toAgentId || this.agent.id,
      content: response.content,
      type: 'follow_up',
      isPublic: false,
    });

    this.emit({ type: 'message.sent', payload: { request, followUp: response.content }, timestamp: new Date() });
  }

  private extractSubject(message: string): string {
    // Extract a short subject from the message
    const words = message.split(' ').slice(0, 8);
    return words.join(' ') + (message.split(' ').length > 8 ? '...' : '');
  }

  // Event handling
  on(eventType: string, handler: EventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  private emit(event: Event): void {
    const handlers = this.eventHandlers.get(event.type) || [];
    handlers.forEach(h => h(event));
    
    // Also emit to wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*') || [];
    wildcardHandlers.forEach(h => h(event));
  }

  // Getters
  getUser(): User { return this.user; }
  getAgentRecord(): AgentRecord { return this.agent; }
}
