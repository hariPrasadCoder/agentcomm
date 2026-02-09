/**
 * SQLite storage layer for AgentComm
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type { User, Agent, Request, Message, Task, Memory } from '../core/types.js';

export class Storage {
  private db: Database.Database;

  constructor(dbPath: string = './agentcomm.db') {
    this.db = new Database(dbPath);
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT,
        slack_id TEXT UNIQUE,
        role TEXT,
        team TEXT,
        expertise TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        status TEXT DEFAULT 'active',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY,
        from_user_id TEXT NOT NULL REFERENCES users(id),
        from_agent_id TEXT NOT NULL REFERENCES agents(id),
        to_user_id TEXT REFERENCES users(id),
        to_agent_id TEXT REFERENCES agents(id),
        subject TEXT NOT NULL,
        description TEXT NOT NULL,
        context TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal',
        due_date TEXT,
        follow_up_count INTEGER DEFAULT 0,
        last_follow_up TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        response TEXT,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        request_id TEXT REFERENCES requests(id),
        from_agent_id TEXT NOT NULL REFERENCES agents(id),
        to_agent_id TEXT NOT NULL REFERENCES agents(id),
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        is_public INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        metadata TEXT
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        request_id TEXT REFERENCES requests(id),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'pending',
        priority TEXT DEFAULT 'normal',
        due_date TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        tags TEXT,
        embedding BLOB,
        is_public INTEGER DEFAULT 1,
        created_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
      CREATE INDEX IF NOT EXISTS idx_requests_from_user ON requests(from_user_id);
      CREATE INDEX IF NOT EXISTS idx_requests_to_user ON requests(to_user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_messages_request ON messages(request_id);
      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    `);
  }

  // User operations
  createUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const id = randomUUID();
    const createdAt = new Date();
    
    this.db.prepare(`
      INSERT INTO users (id, name, email, slack_id, role, team, expertise, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, user.name, user.email || null, user.slackId || null,
      user.role || null, user.team || null,
      user.expertise ? JSON.stringify(user.expertise) : null,
      createdAt.toISOString()
    );

    return { ...user, id, createdAt };
  }

  getUser(id: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToUser(row) : null;
  }

  getUserBySlackId(slackId: string): User | null {
    const row = this.db.prepare('SELECT * FROM users WHERE slack_id = ?').get(slackId) as Record<string, unknown> | undefined;
    return row ? this.rowToUser(row) : null;
  }

  getAllUsers(): User[] {
    const rows = this.db.prepare('SELECT * FROM users').all() as Record<string, unknown>[];
    return rows.map(r => this.rowToUser(r));
  }

  private rowToUser(row: Record<string, unknown>): User {
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string | undefined,
      slackId: row.slack_id as string | undefined,
      role: row.role as string | undefined,
      team: row.team as string | undefined,
      expertise: row.expertise ? JSON.parse(row.expertise as string) : undefined,
      createdAt: new Date(row.created_at as string),
    };
  }

  // Agent operations
  createAgent(agent: Omit<Agent, 'id' | 'createdAt'>): Agent {
    const id = randomUUID();
    const createdAt = new Date();
    
    this.db.prepare(`
      INSERT INTO agents (id, user_id, name, status, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, agent.userId, agent.name, agent.status, createdAt.toISOString());

    return { ...agent, id, createdAt };
  }

  getAgentByUserId(userId: string): Agent | null {
    const row = this.db.prepare('SELECT * FROM agents WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined;
    if (!row) return null;
    
    return {
      id: row.id as string,
      userId: row.user_id as string,
      name: row.name as string,
      status: row.status as Agent['status'],
      createdAt: new Date(row.created_at as string),
    };
  }

  // Request operations
  createRequest(request: Omit<Request, 'id' | 'createdAt' | 'updatedAt' | 'followUpCount'>): Request {
    const id = randomUUID();
    const now = new Date();
    
    this.db.prepare(`
      INSERT INTO requests (
        id, from_user_id, from_agent_id, to_user_id, to_agent_id,
        subject, description, context, status, priority, due_date,
        follow_up_count, created_at, updated_at, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, request.fromUserId, request.fromAgentId,
      request.toUserId || null, request.toAgentId || null,
      request.subject, request.description, request.context || null,
      request.status, request.priority, request.dueDate?.toISOString() || null,
      0, now.toISOString(), now.toISOString(),
      request.metadata ? JSON.stringify(request.metadata) : null
    );

    return { ...request, id, createdAt: now, updatedAt: now, followUpCount: 0 };
  }

  getRequest(id: string): Request | null {
    const row = this.db.prepare('SELECT * FROM requests WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    return row ? this.rowToRequest(row) : null;
  }

  getPendingRequestsForUser(userId: string): Request[] {
    const rows = this.db.prepare(`
      SELECT * FROM requests 
      WHERE to_user_id = ? AND status IN ('pending', 'in_progress', 'waiting_response')
      ORDER BY priority DESC, created_at ASC
    `).all(userId) as Record<string, unknown>[];
    return rows.map(r => this.rowToRequest(r));
  }

  getRequestsByFromUser(userId: string): Request[] {
    const rows = this.db.prepare(`
      SELECT * FROM requests WHERE from_user_id = ?
      ORDER BY created_at DESC
    `).all(userId) as Record<string, unknown>[];
    return rows.map(r => this.rowToRequest(r));
  }

  updateRequest(id: string, updates: Partial<Request>): void {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.toUserId !== undefined) {
      setClauses.push('to_user_id = ?');
      values.push(updates.toUserId);
    }
    if (updates.toAgentId !== undefined) {
      setClauses.push('to_agent_id = ?');
      values.push(updates.toAgentId);
    }
    if (updates.response !== undefined) {
      setClauses.push('response = ?');
      values.push(updates.response);
    }
    if (updates.followUpCount !== undefined) {
      setClauses.push('follow_up_count = ?');
      values.push(updates.followUpCount);
    }
    if (updates.lastFollowUp !== undefined) {
      setClauses.push('last_follow_up = ?');
      values.push(updates.lastFollowUp.toISOString());
    }
    if (updates.completedAt !== undefined) {
      setClauses.push('completed_at = ?');
      values.push(updates.completedAt.toISOString());
    }

    values.push(id);
    this.db.prepare(`UPDATE requests SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  private rowToRequest(row: Record<string, unknown>): Request {
    return {
      id: row.id as string,
      fromUserId: row.from_user_id as string,
      fromAgentId: row.from_agent_id as string,
      toUserId: row.to_user_id as string | undefined,
      toAgentId: row.to_agent_id as string | undefined,
      subject: row.subject as string,
      description: row.description as string,
      context: row.context as string | undefined,
      status: row.status as Request['status'],
      priority: row.priority as Request['priority'],
      dueDate: row.due_date ? new Date(row.due_date as string) : undefined,
      followUpCount: row.follow_up_count as number,
      lastFollowUp: row.last_follow_up ? new Date(row.last_follow_up as string) : undefined,
      createdAt: new Date(row.created_at as string),
      updatedAt: new Date(row.updated_at as string),
      completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
      response: row.response as string | undefined,
      metadata: row.metadata ? JSON.parse(row.metadata as string) : undefined,
    };
  }

  // Task operations
  createTask(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Task {
    const id = randomUUID();
    const now = new Date();
    
    this.db.prepare(`
      INSERT INTO tasks (id, user_id, request_id, title, description, status, priority, due_date, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, task.userId, task.requestId, task.title, task.description || null,
      task.status, task.priority, task.dueDate?.toISOString() || null,
      now.toISOString(), now.toISOString()
    );

    return { ...task, id, createdAt: now, updatedAt: now };
  }

  getTasksForUser(userId: string, status?: Task['status']): Task[] {
    let query = 'SELECT * FROM tasks WHERE user_id = ?';
    const params: unknown[] = [userId];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY priority DESC, created_at ASC';
    
    const rows = this.db.prepare(query).all(...params) as Record<string, unknown>[];
    return rows.map(r => ({
      id: r.id as string,
      userId: r.user_id as string,
      requestId: r.request_id as string,
      title: r.title as string,
      description: r.description as string | undefined,
      status: r.status as Task['status'],
      priority: r.priority as Task['priority'],
      dueDate: r.due_date ? new Date(r.due_date as string) : undefined,
      createdAt: new Date(r.created_at as string),
      updatedAt: new Date(r.updated_at as string),
      completedAt: r.completed_at ? new Date(r.completed_at as string) : undefined,
    }));
  }

  updateTask(id: string, updates: Partial<Task>): void {
    const setClauses: string[] = ['updated_at = ?'];
    const values: unknown[] = [new Date().toISOString()];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
      if (updates.status === 'completed') {
        setClauses.push('completed_at = ?');
        values.push(new Date().toISOString());
      }
    }

    values.push(id);
    this.db.prepare(`UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`).run(...values);
  }

  // Message operations
  createMessage(message: Omit<Message, 'id' | 'createdAt'>): Message {
    const id = randomUUID();
    const createdAt = new Date();
    
    this.db.prepare(`
      INSERT INTO messages (id, request_id, from_agent_id, to_agent_id, content, type, is_public, created_at, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, message.requestId || null, message.fromAgentId, message.toAgentId,
      message.content, message.type, message.isPublic ? 1 : 0,
      createdAt.toISOString(), message.metadata ? JSON.stringify(message.metadata) : null
    );

    return { ...message, id, createdAt };
  }

  getMessagesForRequest(requestId: string): Message[] {
    const rows = this.db.prepare(`
      SELECT * FROM messages WHERE request_id = ? ORDER BY created_at ASC
    `).all(requestId) as Record<string, unknown>[];
    
    return rows.map(r => ({
      id: r.id as string,
      requestId: r.request_id as string | undefined,
      fromAgentId: r.from_agent_id as string,
      toAgentId: r.to_agent_id as string,
      content: r.content as string,
      type: r.type as Message['type'],
      isPublic: Boolean(r.is_public),
      createdAt: new Date(r.created_at as string),
      metadata: r.metadata ? JSON.parse(r.metadata as string) : undefined,
    }));
  }

  // Memory operations
  createMemory(memory: Omit<Memory, 'id' | 'createdAt'>): Memory {
    const id = randomUUID();
    const createdAt = new Date();
    
    this.db.prepare(`
      INSERT INTO memories (id, type, content, source, tags, embedding, is_public, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id, memory.type, memory.content, memory.source,
      JSON.stringify(memory.tags), memory.embedding ? Buffer.from(new Float32Array(memory.embedding).buffer) : null,
      memory.isPublic ? 1 : 0, createdAt.toISOString(),
      memory.expiresAt?.toISOString() || null
    );

    return { ...memory, id, createdAt };
  }

  searchMemories(query: string, limit: number = 10): Memory[] {
    // Simple text search for now - can be replaced with vector search
    const rows = this.db.prepare(`
      SELECT * FROM memories 
      WHERE is_public = 1 AND content LIKE ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(`%${query}%`, limit) as Record<string, unknown>[];
    
    return rows.map(r => ({
      id: r.id as string,
      type: r.type as Memory['type'],
      content: r.content as string,
      source: r.source as string,
      tags: JSON.parse(r.tags as string),
      isPublic: Boolean(r.is_public),
      createdAt: new Date(r.created_at as string),
      expiresAt: r.expires_at ? new Date(r.expires_at as string) : undefined,
    }));
  }

  close() {
    this.db.close();
  }
}
