/**
 * Web Dashboard Server for AgentComm
 * 
 * Provides a simple web UI to view tasks, requests, and interact with the agent.
 */

import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { Storage } from '../storage/database.js';
import { CommunicationAgent, type AgentConfig } from '../core/agent.js';
import type { LLMConfig } from '../core/types.js';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const CONFIG_PATH = join(homedir(), '.agentcomm', 'config.json');
const DB_PATH = join(homedir(), '.agentcomm', 'agentcomm.db');

const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(join(import.meta.dirname, 'public')));

// Load config
function loadConfig() {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return null;
}

// Initialize storage
const storage = new Storage(DB_PATH);

// API Routes
app.get('/api/status', (req, res) => {
  const config = loadConfig();
  res.json({
    configured: !!config?.userId,
    userName: config?.userName,
  });
});

app.get('/api/users', (req, res) => {
  const users = storage.getAllUsers();
  res.json(users);
});

app.get('/api/tasks', (req, res) => {
  const config = loadConfig();
  if (!config?.userId) {
    return res.status(400).json({ error: 'Not configured' });
  }
  
  const tasks = storage.getTasksForUser(config.userId);
  res.json(tasks);
});

app.get('/api/requests', (req, res) => {
  const config = loadConfig();
  if (!config?.userId) {
    return res.status(400).json({ error: 'Not configured' });
  }
  
  const requests = storage.getRequestsByFromUser(config.userId);
  res.json(requests);
});

app.get('/api/requests/incoming', (req, res) => {
  const config = loadConfig();
  if (!config?.userId) {
    return res.status(400).json({ error: 'Not configured' });
  }
  
  const requests = storage.getPendingRequestsForUser(config.userId);
  res.json(requests);
});

// WebSocket for real-time chat
const agents = new Map<WebSocket, CommunicationAgent>();

wss.on('connection', async (ws) => {
  const config = loadConfig();
  
  if (!config?.userId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Please run agentcomm setup first' }));
    ws.close();
    return;
  }

  const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    ws.send(JSON.stringify({ type: 'error', message: 'API key not configured' }));
    ws.close();
    return;
  }

  const user = storage.getUser(config.userId);
  const agentRecord = storage.getAgentByUserId(config.userId);
  
  if (!user || !agentRecord) {
    ws.send(JSON.stringify({ type: 'error', message: 'User not found' }));
    ws.close();
    return;
  }

  const llmConfig: LLMConfig = {
    provider: config.llmProvider,
    model: config.llmModel,
    apiKey,
  };

  const agentConfig: AgentConfig = {
    llmConfig,
    dbPath: DB_PATH,
  };

  const agent = new CommunicationAgent(user, agentRecord, agentConfig, storage, config.orgContext);
  agents.set(ws, agent);

  // Set up event handlers
  agent.on('*', (event) => {
    ws.send(JSON.stringify({ type: 'event', event }));
  });

  ws.send(JSON.stringify({ 
    type: 'connected', 
    user: { name: user.name, id: user.id } 
  }));

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'chat') {
        const response = await agent.handleUserMessage(message.content);
        ws.send(JSON.stringify({ type: 'response', content: response }));
      }
    } catch (error) {
      ws.send(JSON.stringify({ type: 'error', message: (error as Error).message }));
    }
  });

  ws.on('close', () => {
    agents.delete(ws);
  });
});

// Serve the dashboard HTML
app.get('/', (req, res) => {
  res.send(getDashboardHTML());
});

function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentComm Dashboard</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      height: 100vh;
      display: flex;
    }
    
    .sidebar {
      width: 260px;
      background: #1a1a1a;
      border-right: 1px solid #333;
      display: flex;
      flex-direction: column;
    }
    
    .sidebar-header {
      padding: 20px;
      border-bottom: 1px solid #333;
    }
    
    .sidebar-header h1 {
      font-size: 1.2rem;
      color: #fff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    
    .nav-section {
      padding: 16px;
    }
    
    .nav-section h3 {
      font-size: 0.75rem;
      color: #888;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    
    .nav-item {
      padding: 10px 12px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      color: #ccc;
      transition: all 0.15s;
    }
    
    .nav-item:hover {
      background: #2a2a2a;
      color: #fff;
    }
    
    .nav-item.active {
      background: #3b82f6;
      color: #fff;
    }
    
    .badge {
      background: #ef4444;
      color: #fff;
      font-size: 0.7rem;
      padding: 2px 6px;
      border-radius: 10px;
      margin-left: auto;
    }
    
    .main {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .main-header {
      padding: 16px 24px;
      border-bottom: 1px solid #333;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    
    .main-header h2 {
      font-size: 1.1rem;
    }
    
    .status {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.85rem;
      color: #888;
    }
    
    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #22c55e;
    }
    
    .status-dot.offline {
      background: #ef4444;
    }
    
    .content {
      flex: 1;
      display: flex;
      overflow: hidden;
    }
    
    .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
    }
    
    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    
    .message {
      max-width: 80%;
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.5;
    }
    
    .message.user {
      background: #3b82f6;
      color: #fff;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    
    .message.agent {
      background: #2a2a2a;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    
    .message.system {
      background: #1a1a1a;
      border: 1px solid #333;
      align-self: center;
      font-size: 0.85rem;
      color: #888;
    }
    
    .input-container {
      padding: 16px 24px;
      border-top: 1px solid #333;
    }
    
    .input-wrapper {
      display: flex;
      gap: 12px;
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 8px 16px;
    }
    
    .input-wrapper input {
      flex: 1;
      background: none;
      border: none;
      color: #fff;
      font-size: 0.95rem;
      outline: none;
    }
    
    .input-wrapper input::placeholder {
      color: #666;
    }
    
    .input-wrapper button {
      background: #3b82f6;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: background 0.15s;
    }
    
    .input-wrapper button:hover {
      background: #2563eb;
    }
    
    .input-wrapper button:disabled {
      background: #333;
      cursor: not-allowed;
    }
    
    .panel {
      width: 300px;
      border-left: 1px solid #333;
      display: flex;
      flex-direction: column;
    }
    
    .panel-header {
      padding: 16px;
      border-bottom: 1px solid #333;
      font-weight: 600;
    }
    
    .panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
    }
    
    .task-item, .request-item {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 12px;
    }
    
    .task-item h4, .request-item h4 {
      font-size: 0.9rem;
      margin-bottom: 4px;
    }
    
    .task-item p, .request-item p {
      font-size: 0.8rem;
      color: #888;
    }
    
    .task-item .from {
      font-size: 0.75rem;
      color: #3b82f6;
      margin-top: 8px;
    }
    
    .empty-state {
      text-align: center;
      color: #666;
      padding: 32px;
      font-size: 0.9rem;
    }
    
    .typing {
      display: flex;
      gap: 4px;
      padding: 8px;
    }
    
    .typing span {
      width: 8px;
      height: 8px;
      background: #666;
      border-radius: 50%;
      animation: bounce 1.4s infinite ease-in-out both;
    }
    
    .typing span:nth-child(1) { animation-delay: -0.32s; }
    .typing span:nth-child(2) { animation-delay: -0.16s; }
    
    @keyframes bounce {
      0%, 80%, 100% { transform: scale(0); }
      40% { transform: scale(1); }
    }
  </style>
</head>
<body>
  <div class="sidebar">
    <div class="sidebar-header">
      <h1>🤖 AgentComm</h1>
    </div>
    <div class="nav-section">
      <h3>Navigation</h3>
      <div class="nav-item active" data-view="chat">💬 Chat</div>
      <div class="nav-item" data-view="tasks">
        📥 Tasks
        <span class="badge" id="tasks-badge" style="display: none;">0</span>
      </div>
      <div class="nav-item" data-view="requests">📤 Requests</div>
      <div class="nav-item" data-view="team">👥 Team</div>
    </div>
  </div>
  
  <div class="main">
    <div class="main-header">
      <h2 id="view-title">Chat with your Agent</h2>
      <div class="status">
        <div class="status-dot" id="status-dot"></div>
        <span id="status-text">Connecting...</span>
      </div>
    </div>
    
    <div class="content">
      <div class="chat-container" id="chat-view">
        <div class="messages" id="messages">
          <div class="message system">
            Welcome! I'm your communication agent. Tell me what you need.
          </div>
        </div>
        <div class="input-container">
          <div class="input-wrapper">
            <input type="text" id="chat-input" placeholder="Type a message..." />
            <button id="send-btn">Send</button>
          </div>
        </div>
      </div>
      
      <div class="panel">
        <div class="panel-header">Quick Actions</div>
        <div class="panel-content" id="panel-content">
          <div class="empty-state">Loading...</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const ws = new WebSocket(\`ws://\${window.location.host}\`);
    const messages = document.getElementById('messages');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    const panelContent = document.getElementById('panel-content');
    const tasksBadge = document.getElementById('tasks-badge');
    
    let connected = false;
    
    ws.onopen = () => {
      console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      if (data.type === 'connected') {
        connected = true;
        statusDot.classList.remove('offline');
        statusText.textContent = 'Connected as ' + data.user.name;
        loadTasks();
      } else if (data.type === 'response') {
        removeTyping();
        addMessage(data.content, 'agent');
      } else if (data.type === 'error') {
        removeTyping();
        statusDot.classList.add('offline');
        statusText.textContent = data.message;
        addMessage('Error: ' + data.message, 'system');
      } else if (data.type === 'event') {
        // Refresh data on events
        loadTasks();
      }
    };
    
    ws.onclose = () => {
      connected = false;
      statusDot.classList.add('offline');
      statusText.textContent = 'Disconnected';
    };
    
    function addMessage(content, type) {
      const div = document.createElement('div');
      div.className = 'message ' + type;
      div.textContent = content;
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    
    function addTyping() {
      const div = document.createElement('div');
      div.className = 'message agent typing';
      div.id = 'typing';
      div.innerHTML = '<span></span><span></span><span></span>';
      messages.appendChild(div);
      messages.scrollTop = messages.scrollHeight;
    }
    
    function removeTyping() {
      const typing = document.getElementById('typing');
      if (typing) typing.remove();
    }
    
    function sendMessage() {
      const text = input.value.trim();
      if (!text || !connected) return;
      
      addMessage(text, 'user');
      addTyping();
      ws.send(JSON.stringify({ type: 'chat', content: text }));
      input.value = '';
    }
    
    sendBtn.onclick = sendMessage;
    input.onkeypress = (e) => {
      if (e.key === 'Enter') sendMessage();
    };
    
    async function loadTasks() {
      try {
        const res = await fetch('/api/tasks');
        const tasks = await res.json();
        const pending = tasks.filter(t => t.status === 'pending');
        
        if (pending.length > 0) {
          tasksBadge.style.display = 'inline';
          tasksBadge.textContent = pending.length;
          
          panelContent.innerHTML = '<h4 style="margin-bottom: 12px; font-size: 0.85rem; color: #888;">Pending Tasks</h4>' +
            pending.map(t => \`
              <div class="task-item">
                <h4>\${t.title}</h4>
                <p>\${t.description || 'No description'}</p>
              </div>
            \`).join('');
        } else {
          tasksBadge.style.display = 'none';
          panelContent.innerHTML = '<div class="empty-state">🎉 No pending tasks!</div>';
        }
      } catch (e) {
        console.error('Failed to load tasks:', e);
      }
    }
  </script>
</body>
</html>`;
}

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`🌐 AgentComm dashboard running at http://localhost:${PORT}`);
});
