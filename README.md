# 🤖 AgentComm Web

**AI-first communication platform for teams. Talk to your agent, it handles the rest.**

A complete web application that replaces traditional synchronous communication (like Slack) with an AI-agent-based asynchronous communication model. Each team member has an AI agent that routes requests, tracks follow-ups, and manages their communication queue.

---

## 🌟 Features

- **AI Agent Chat** - Talk naturally to your agent to send requests, check status, and manage tasks
- **Smart Routing** - AI automatically determines who should handle each request
- **Task Queue** - Clear visibility into what needs your attention
- **Request Tracking** - Monitor the status of your outgoing requests
- **Automatic Follow-ups** - Agent follows up on stale requests automatically
- **Team Channels** - Public channels for team-wide discussions
- **Direct Messages** - Private 1-on-1 conversations
- **Real-time Updates** - WebSocket-based live messaging
- **Organization Management** - Create orgs, invite team members with codes

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React + Vite)                  │
│  - Authentication UI                                        │
│  - Organization onboarding                                  │
│  - AI Agent chat interface                                  │
│  - Channels & Direct Messages                               │
│  - Tasks & Requests views                                   │
└─────────────────────────────────────────────────────────────┘
                              ↕ API + WebSocket
┌─────────────────────────────────────────────────────────────┐
│                  BACKEND (FastAPI + Python)                 │
│  - REST API for all operations                              │
│  - WebSocket server for real-time updates                   │
│  - AI Agent service (Claude SDK)                            │
│  - Authentication via Supabase Auth                         │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                    DATABASE (Supabase)                      │
│  - PostgreSQL with Row Level Security                       │
│  - Real-time subscriptions                                  │
│  - Built-in authentication                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- A [Supabase](https://supabase.com) account (free tier works)
- An [Anthropic](https://anthropic.com) API key (or OpenAI)

### 1. Set up Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Go to the SQL Editor and run the schema:
   ```sql
   -- Copy and paste the contents of supabase/schema.sql
   ```
3. Get your credentials from Project Settings > API:
   - `SUPABASE_URL` - Project URL
   - `SUPABASE_KEY` - `anon` public key
   - `SUPABASE_SERVICE_KEY` - `service_role` key (keep secret!)
   - `JWT_SECRET` - JWT Secret (from Auth settings)

### 2. Set up the Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Supabase and Anthropic credentials

# Run the server
uvicorn app.main:app --reload --port 8000
```

### 3. Set up the Frontend

```bash
cd frontend

# Install dependencies
npm install

# Configure environment (optional)
cp .env.example .env

# Run the dev server
npm run dev
```

### 4. Open the App

Visit [http://localhost:3000](http://localhost:3000)

1. **Sign up** with your email
2. **Create an organization** or join with an invite code
3. **Start chatting** with your AI agent!

---

## 📖 How It Works

### The AI Agent

Every user has a personal AI agent that handles their communication:

```
You: "I need the Q4 marketing report"

Agent: Got it! I've sent your request to Sarah (Marketing Lead).
       I'll follow up if she doesn't respond and let you know 
       when I have an answer.

... later ...

Agent: ✅ Sarah responded! Here's the Q4 report: [link]
```

### Request Flow

1. **You** tell your agent what you need
2. **Agent** determines who should handle it (using org context)
3. **Request** is created and appears in recipient's task queue
4. **Recipient** sees task and responds
5. **You** get notified of the response

### Task Queue

Instead of drowning in messages, you have a clear task queue:
- See exactly what others need from you
- Prioritized by urgency
- Respond directly from the queue
- Never miss important requests

---

## 🛠️ Tech Stack

**Frontend:**
- React 18 with TypeScript
- Vite for fast builds
- TailwindCSS for styling
- Zustand for state management
- Radix UI for accessible components

**Backend:**
- Python 3.11+
- FastAPI for the REST API
- Anthropic Claude SDK for AI
- WebSockets for real-time

**Database:**
- Supabase (PostgreSQL)
- Row Level Security
- Real-time subscriptions

---

## 📁 Project Structure

```
agentcomm/
├── backend/
│   ├── app/
│   │   ├── api/           # API route handlers
│   │   ├── models/        # Pydantic schemas
│   │   ├── services/      # Business logic
│   │   ├── config.py      # Configuration
│   │   └── main.py        # FastAPI app
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── pages/         # Page components
│   │   ├── store/         # Zustand store
│   │   ├── lib/           # Utilities & API client
│   │   └── types/         # TypeScript types
│   ├── package.json
│   └── .env.example
├── supabase/
│   └── schema.sql         # Database schema
└── README.md
```

---

## 🔐 Environment Variables

### Backend (.env)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase anon/public key |
| `SUPABASE_SERVICE_KEY` | Supabase service role key |
| `JWT_SECRET` | Supabase JWT secret |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `DEFAULT_MODEL` | AI model (default: claude-sonnet-4-20250514) |

### Frontend (.env)

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend API URL (default: /api) |

---

## 🚢 Deployment

### Backend (e.g., Railway, Render, Fly.io)

```bash
cd backend
# Set environment variables in your platform
# Deploy with:
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

### Frontend (e.g., Vercel, Netlify)

```bash
cd frontend
npm run build
# Deploy the dist/ folder
# Set VITE_API_URL to your backend URL
```

---

## 🤝 Team Onboarding

### Admin (create org):
1. Sign up and create an organization
2. Share the invite code with your team

### Team Members:
1. Sign up
2. Enter the invite code
3. Start using the AI agent!

---

## 📝 API Reference

### Authentication
- `POST /api/auth/signup` - Register new user
- `POST /api/auth/login` - Sign in
- `GET /api/auth/me` - Get current user

### Organizations
- `POST /api/orgs` - Create organization
- `POST /api/orgs/join` - Join with invite code
- `GET /api/orgs/members` - List members

### Channels
- `GET /api/channels` - List user's channels
- `POST /api/channels` - Create channel
- `GET /api/channels/{id}/messages` - Get messages
- `POST /api/channels/{id}/messages` - Send message

### AI Agent
- `POST /api/agent/chat` - Chat with your agent
- `GET /api/agent/tasks` - Get your task queue
- `GET /api/agent/requests` - Get your outgoing requests
- `POST /api/agent/tasks/{id}/complete` - Complete a task

### WebSocket
- `WS /ws/{token}` - Real-time updates

---

## 🙏 Credits

Built with:
- [FastAPI](https://fastapi.tiangolo.com/)
- [React](https://react.dev/)
- [Supabase](https://supabase.com/)
- [Anthropic Claude](https://anthropic.com/)
- [TailwindCSS](https://tailwindcss.com/)

---

## 📄 License

MIT License - see [LICENSE](LICENSE)

---

<p align="center">
  <strong>AgentComm</strong> — The future of team communication is async + AI.<br>
  Built by <a href="https://github.com/hariPrasadCoder">Hari Prasad</a>
</p>
