# 🤖 AgentComm

**AI-first communication proxy. Talk to your agent, it handles the rest.**

AgentComm sits between you and your team's communication. Instead of messaging people directly, you message your agent. Your agent figures out who to ask, what to ask, tracks responses, and follows up automatically.

## The Problem

- You don't know who to ask
- You spend hours in meetings that could be async
- You follow up manually (and forget)
- Context gets lost across conversations
- New hires don't know where to find information

## The Solution

Every person has an AI agent. You tell your agent what you need. Your agent:

1. **Figures out who** should handle your request
2. **Formulates a clear ask** and sends it
3. **Tracks the request** and follows up automatically
4. **Reports back** when you have an answer

On the receiving end, your agent shows you **tasks** — clear asks from others that need your input. No more buried messages.

```
You → Your Agent → Their Agent → Them
                        ↓
                  (answers queue)
                        ↓
     Your Agent ← Their Agent ← Them
```

## Features

- 🤖 **Personal Agent** - Each user has their own AI agent
- 💬 **Slack Integration** - Works where your team already is
- 🖥️ **CLI Interface** - Terminal-native for developers
- 🌐 **Web Dashboard** - Visual overview of tasks and requests
- 🔄 **Auto Follow-ups** - Never manually "bump" again
- 🧠 **Shared Memory** - Team knowledge that builds over time
- 🔒 **Privacy Controls** - Public vs private conversation distinction

## Quick Start

### 1. Install

```bash
# Clone the repo
git clone https://github.com/hariPrasadCoder/agentcomm.git
cd agentcomm

# Install dependencies
npm install

# Build
npm run build
```

### 2. Configure

```bash
# Copy environment file
cp .env.example .env

# Edit with your API key
# OPENAI_API_KEY=sk-... (or ANTHROPIC_API_KEY)
```

### 3. Run Setup

```bash
# Interactive setup
npm run start -- setup

# Or directly
node dist/cli/index.js setup
```

### 4. Start Chatting

```bash
# Terminal chat interface
npm run start -- chat

# Or run the web dashboard
npm run dashboard
# Open http://localhost:3000
```

## Usage

### CLI Commands

```bash
agentcomm setup        # Configure your agent
agentcomm chat         # Start chatting with your agent
agentcomm tasks        # View your pending tasks
agentcomm status       # Check your outgoing requests
agentcomm add-member   # Add a team member
agentcomm members      # List team members
agentcomm daemon       # Run as background service
agentcomm slack        # Start Slack integration
```

### Talking to Your Agent

**Create a request:**
```
You: I need the Q4 marketing report from the marketing team
Agent: Got it! I've sent your request to Sarah (Marketing Lead).
       I'll follow up if she doesn't respond and let you know when I have an answer.
```

**Check your tasks:**
```
You: tasks
Agent: Your Task Queue (2):
       1. Request from Alex: Need API documentation for the payment integration
       2. Request from Jordan: Budget approval for design tools
```

**Respond to a task:**
```
You: 1. Here's the API docs: https://docs.example.com/payments
Agent: ✅ Response sent to Alex!
```

**Check status:**
```
You: status
Agent: Your Active Requests:
       • Q4 marketing report → Sarah (waiting_response)
       • Legal review for contract → Legal Team (pending)
```

## Slack Integration

### Setup Slack App

1. Create a new Slack app at [api.slack.com/apps](https://api.slack.com/apps)

2. Enable Socket Mode and get your App Token

3. Add Bot Token Scopes:
   - `chat:write`
   - `im:history`
   - `im:write`
   - `users:read`
   - `channels:read`
   - `commands`

4. Install to your workspace

5. Add credentials to `.env`:
   ```
   SLACK_BOT_TOKEN=xoxb-...
   SLACK_SIGNING_SECRET=...
   SLACK_APP_TOKEN=xapp-...
   ```

6. Start the Slack bot:
   ```bash
   npm run slack
   ```

### Using in Slack

- **DM the bot** to interact with your agent
- **Use `/agent`** slash command from any channel
- **View the App Home** for your dashboard

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    MEMORY LAYER                         │
│  Stores public conversations, decisions, knowledge      │
└─────────────────────────────────────────────────────────┘
                           ↑ writes
                           ↓ reads
┌─────────────────────────────────────────────────────────┐
│                    AGENT LAYER                          │
│  Personal agent per user, handles routing & tracking    │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│                 COMMUNICATION LAYER                     │
│              Slack, CLI, Web Dashboard                  │
└─────────────────────────────────────────────────────────┘
```

## Configuration

### LLM Providers

AgentComm supports OpenAI and Anthropic:

```env
# OpenAI
LLM_PROVIDER=openai
LLM_MODEL=gpt-4o
OPENAI_API_KEY=sk-...

# Anthropic
LLM_PROVIDER=anthropic
LLM_MODEL=claude-sonnet-4-20250514
ANTHROPIC_API_KEY=sk-ant-...
```

### Organizational Context

Add team members and routing rules for better request routing:

```bash
# Add team members
agentcomm add-member

# The agent learns who handles what based on:
# - Role and team assignments
# - Expertise tags
# - Past routing patterns
```

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Lint
npm run lint
```

## Roadmap

- [ ] Agent-to-agent protocol (agents negotiate directly)
- [ ] Email integration
- [ ] Microsoft Teams integration
- [ ] Vector search for memory
- [ ] Mobile app
- [ ] Calendar integration
- [ ] Meeting summary → action item extraction

## Why Open Source?

Communication tools shouldn't lock you in. Your team's knowledge and workflows should be portable. AgentComm is open source so you can:

- Self-host with full control
- Extend and customize
- Integrate with your existing tools
- Trust what's happening with your data

## Contributing

Contributions welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting PRs.

## License

MIT

---

Built with 🤖 by [Hari Prasad](https://github.com/hariPrasadCoder)
