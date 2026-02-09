# 🤖 AgentComm

**AI-first communication for teams. Talk to your agent, it handles the rest.**

```bash
npx agentcomm
```

One command. 30 seconds. You're chatting with your AI communication agent.

---

## ⚡ Setup in 30 Seconds

```bash
npx agentcomm
```

That's it. The setup wizard guides you through:

```
◆  How would you like to set up AgentComm?
│  ● QuickStart — Just the basics, get chatting in 30 seconds
│  ○ Full Setup — Configure Slack integration and team members
```

You'll enter:
1. Your name
2. OpenAI or Anthropic
3. Your API key

Done. Start chatting.

---

## 🏢 Team Setup (10 people, 5 minutes)

### Admin (once):
```bash
npx agentcomm org init

# You'll enter:
#   Organization name: Acme Startup
#   Slack Bot Token: xoxb-...
#   Slack App Token: xapp-...
#   Signing Secret: ...
#
# You'll get an invite code:
#   🎟️ eyJvcmdOYW1lIjoiQWNtZS...
```

### Team Members:
```bash
npx agentcomm join eyJvcmdOYW1lIjoiQWNtZS...

# You'll enter:
#   Your name: Sarah
#   Your AI provider: OpenAI
#   Your API key: sk-...
#
# Done! Welcome to Acme Startup! 🎉
```

**That's the entire team setup.** Share the invite code in Slack, everyone runs one command, you're connected.

---

## 🤔 What Is This?

AgentComm puts an AI agent between you and your team's communication.

**Instead of:**
```
You → Slack → Find the right person → Send message → Wait → Follow up → Wait...
```

**You do:**
```
You → Your Agent → Agent figures out who to ask → Tracks it → Follows up → Reports back
```

### Example

```
You: I need the Q4 marketing report

Agent: Got it! I've sent your request to Sarah (Marketing Lead).
       I'll follow up if she doesn't respond and let you know 
       when I have an answer.

... later ...

Agent: ✅ Sarah responded! Here's the Q4 report: [link]
```

### Your Agent Handles:
- **Routing** — Figures out who should answer your question
- **Tracking** — Keeps track of open requests
- **Follow-ups** — Automatically nudges if no response
- **Task Queue** — Shows you what others need from you

---

## 📦 Installation Options

### Recommended: npx (no install)
```bash
npx agentcomm
```

### Global install
```bash
npm install -g agentcomm
agentcomm
```

### From source
```bash
git clone https://github.com/hariPrasadCoder/agentcomm.git
cd agentcomm
npm install && npm run build
npm start
```

---

## 🎮 Commands

### Daily Use
| Command | What it does |
|---------|--------------|
| `agentcomm` | Chat with your agent |
| `agentcomm tasks` | See what others need from you |
| `agentcomm status` | Check your outgoing requests |

### Team Management
| Command | What it does |
|---------|--------------|
| `agentcomm org init` | Create organization (admin) |
| `agentcomm org invite` | Generate new invite code |
| `agentcomm join <code>` | Join org with invite code |
| `agentcomm add-member` | Manually add a teammate |
| `agentcomm members` | List team members |

### Integrations
| Command | What it does |
|---------|--------------|
| `agentcomm slack` | Start Slack integration |
| `agentcomm dashboard` | Open web UI |

### Utilities
| Command | What it does |
|---------|--------------|
| `agentcomm setup` | Re-run setup wizard |
| `agentcomm reset` | Delete all local data |

---

## 💬 Slack Integration

AgentComm is most powerful when connected to Slack — agents communicate through Slack DMs.

### Option 1: Team Already Set Up
If your admin gave you an invite code:
```bash
npx agentcomm join <invite-code>
agentcomm slack
```
Done!

### Option 2: Set Up Slack Yourself

1. **Create Slack app** at [api.slack.com/apps](https://api.slack.com/apps)

2. **Enable Socket Mode** → Get App Token (`xapp-...`)

3. **Add Bot Scopes:**
   - `chat:write`
   - `im:history`
   - `im:write`
   - `users:read`
   - `channels:read`

4. **Install to workspace** → Get Bot Token (`xoxb-...`)

5. **Run:**
   ```bash
   agentcomm slack
   # Enter tokens when prompted
   ```

---

## 🖥️ Beautiful Terminal UI

AgentComm uses the same terminal UI library as OpenClaw:

```
┌─────────────────────────────────────────────────┐
│  🤖 AgentComm — Sarah's Agent                   │
├─────────────────────────────────────────────────┤
│  Commands: tasks, status, help, exit            │
└─────────────────────────────────────────────────┘

You › I need the design specs from the product team

  Thinking...

Agent › Got it! I've sent your request to Alex (Product Design).
        I'll follow up if they don't respond and let you know 
        when I have an answer.
```

Features:
- Clean, modern prompts
- Progress spinners
- Color-coded output
- Keyboard shortcuts

---

## 🔧 How It Works

```
┌─────────────────────────────────────────────────┐
│              YOUR AGENT                         │
│  Lives on your machine, talks to LLM            │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│              SLACK                              │
│  Agents communicate via DMs                     │
└─────────────────────────────────────────────────┘
                    ↕
┌─────────────────────────────────────────────────┐
│              THEIR AGENT                        │
│  Lives on their machine                         │
└─────────────────────────────────────────────────┘
```

**Each person:**
- Runs AgentComm locally
- Has their own LLM API key (costs stay separate)
- Connects to the same Slack workspace

**Data stored locally:**
- `~/.agentcomm/config.json` — Settings
- `~/.agentcomm/agentcomm.db` — Local database

---

## 🤖 Supported AI Providers

| Provider | Models |
|----------|--------|
| **OpenAI** | gpt-4o, gpt-4-turbo, gpt-3.5-turbo |
| **Anthropic** | claude-sonnet-4-20250514, claude-3-opus |

Set via environment variable or during setup:
```bash
export OPENAI_API_KEY=sk-...
# or
export ANTHROPIC_API_KEY=sk-ant-...
```

---

## 📋 Example Workflows

### Request from another team
```
You: I need legal review on the contractor agreement

Agent: Got it! I've sent your request to Jamie (Legal).
       I'll follow up if they don't respond within 24 hours.
```

### Check your task queue
```
You: tasks

Agent: 📥 Pending Tasks (2):

       1. Request from Alex
          "Need API docs for payment integration"
       
       2. Request from Jordan
          "Review the new onboarding mockups"
```

### Respond to a task
```
You: 1. Here's the docs: https://docs.example.com/payments

Agent: ✅ Response sent to Alex!
```

---

## 🗺️ Roadmap

- [ ] Agent-to-agent direct protocol
- [ ] Microsoft Teams integration
- [ ] Email integration
- [ ] Vector search for team knowledge
- [ ] Calendar integration
- [ ] Mobile app

---

## 🤝 Contributing

Contributions welcome! See [CONTRIBUTING.md](CONTRIBUTING.md).

```bash
git clone https://github.com/hariPrasadCoder/agentcomm.git
cd agentcomm
npm install
npm run dev
```

---

## 📄 License

MIT — see [LICENSE](LICENSE).

---

<p align="center">
  Built by <a href="https://github.com/hariPrasadCoder">Hari Prasad</a><br>
  <a href="https://github.com/hariPrasadCoder/agentcomm/issues">Report Bug</a> · 
  <a href="https://github.com/hariPrasadCoder/agentcomm/issues">Request Feature</a>
</p>
