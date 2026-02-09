# 🤖 AgentComm

**AI-first communication proxy. Talk to your agent, it handles the rest.**

Stop chasing people for answers. Stop drowning in messages. Tell your agent what you need — it figures out who to ask, sends the request, follows up, and reports back.

## Quick Start

```bash
npx agentcomm
```

That's it. First run walks you through setup in 60 seconds.

## What It Does

```
You: "I need the Q4 marketing report"

Agent: Got it! I've sent your request to Sarah (Marketing Lead).
       I'll follow up if she doesn't respond and let you know 
       when I have an answer.

... later ...

Agent: ✅ Sarah responded! Here's the Q4 report: [link]
```

### The Problem

- You don't know who to ask
- Following up is tedious and awkward  
- Context gets lost across conversations
- Meetings that could be async

### The Solution

Everyone gets an AI agent. You talk to your agent. Your agent:

1. **Routes** your request to the right person
2. **Tracks** the request and follows up automatically
3. **Reports back** when you have an answer

On the flip side, your agent shows you **tasks** — clear asks from others that need your input.

## Installation

### Option 1: npx (Recommended)

```bash
npx agentcomm
```

### Option 2: Global Install

```bash
npm install -g agentcomm
agentcomm
```

### Option 3: From Source

```bash
git clone https://github.com/hariPrasadCoder/agentcomm.git
cd agentcomm
npm install
npm run build
npm start
```

## Commands

| Command | Description |
|---------|-------------|
| `agentcomm` | Start chatting (runs setup on first run) |
| `agentcomm tasks` | See what others need from you |
| `agentcomm status` | Check your outgoing requests |
| `agentcomm add-member` | Add a teammate |
| `agentcomm members` | List your team |
| `agentcomm slack` | Start Slack integration |
| `agentcomm dashboard` | Open web dashboard |
| `agentcomm daemon` | Run background follow-ups |
| `agentcomm reset` | Reset all local data |

## Slack Integration

AgentComm works standalone, but it's most powerful when connected to Slack — your agent can message teammates directly.

### Setup Slack

1. **Create a Slack App**
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Click "Create New App" → "From scratch"
   - Name it "AgentComm" and select your workspace

2. **Enable Socket Mode**
   - Go to "Socket Mode" in the sidebar
   - Toggle it ON
   - Create an App-Level Token with `connections:write` scope
   - Save this token (starts with `xapp-`)

3. **Add Bot Scopes**
   - Go to "OAuth & Permissions"
   - Under "Bot Token Scopes", add:
     - `chat:write`
     - `im:history`
     - `im:write`
     - `users:read`
     - `channels:read`
   - Install the app to your workspace
   - Copy the Bot Token (starts with `xoxb-`)

4. **Get Signing Secret**
   - Go to "Basic Information"
   - Copy the "Signing Secret"

5. **Connect AgentComm**
   ```bash
   agentcomm slack
   # Enter your tokens when prompted
   ```

Now teammates can DM the AgentComm bot to interact with their agents!

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    MEMORY LAYER                         │
│       Stores team knowledge (public conversations)      │
└─────────────────────────────────────────────────────────┘
                           ↑ writes
                           ↓ reads
┌─────────────────────────────────────────────────────────┐
│                    AGENT LAYER                          │
│       Personal agent per user, handles routing          │
└─────────────────────────────────────────────────────────┘
                           ↕
┌─────────────────────────────────────────────────────────┐
│                 COMMUNICATION LAYER                     │
│              Slack / CLI / Web Dashboard                │
└─────────────────────────────────────────────────────────┘
```

### Data Storage

All data is stored locally in `~/.agentcomm/`:
- `config.json` - Your settings and API keys
- `agentcomm.db` - SQLite database with users, requests, tasks

When connected to Slack, agent-to-agent communication happens through Slack DMs.

## Team Setup

For a startup/team to adopt AgentComm:

1. **Each person** runs `npx agentcomm` on their machine
2. **Connect to the same Slack workspace** via `agentcomm slack`
3. **Add teammates** with `agentcomm add-member` (or they auto-sync from Slack)

That's it — agents can now route requests to each other via Slack.

## Configuration

Config is stored in `~/.agentcomm/config.json`:

```json
{
  "userId": "...",
  "userName": "Hari",
  "llmProvider": "openai",
  "llmModel": "gpt-4o",
  "apiKey": "sk-...",
  "slackBotToken": "xoxb-...",
  "slackAppToken": "xapp-...",
  "orgContext": {
    "teams": [],
    "channels": [],
    "routingRules": []
  }
}
```

### Supported LLM Providers

- **OpenAI**: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`
- **Anthropic**: `claude-sonnet-4-20250514`, `claude-3-opus`, `claude-3-haiku`

## Examples

### Request something from another team

```
You: I need legal review on the new contractor agreement

Agent: Got it! I've sent your request to Jamie (Legal).
       Request: "Legal review needed for new contractor agreement"
       I'll follow up if they don't respond within 24 hours.
```

### Check your tasks

```
You: tasks

Agent: 📥 Your Pending Tasks (2):

       1. Request from Alex (Engineering)
          "Need API documentation for the payment integration"
       
       2. Request from Jordan (Product)
          "Can you review the new onboarding flow mockups?"
```

### Respond to a task

```
You: 1. Here's the API docs: https://docs.example.com/payments

Agent: ✅ Response sent to Alex!
```

## Roadmap

- [ ] Agent-to-agent protocol (direct negotiation)
- [ ] Microsoft Teams integration
- [ ] Email integration  
- [ ] Vector search for memory
- [ ] Calendar integration
- [ ] Mobile app

## Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT — see [LICENSE](LICENSE).

---

Built by [Hari Prasad](https://github.com/hariPrasadCoder) · [Report Bug](https://github.com/hariPrasadCoder/agentcomm/issues) · [Request Feature](https://github.com/hariPrasadCoder/agentcomm/issues)
