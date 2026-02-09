# Contributing to AgentComm

Thanks for your interest in contributing! Here's how to get started.

## Development Setup

1. Fork and clone the repo
2. Install dependencies: `npm install`
3. Copy `.env.example` to `.env` and add your API key
4. Run in dev mode: `npm run dev`

## Project Structure

```
src/
├── core/           # Agent logic, LLM integration, types
├── storage/        # SQLite database layer
├── slack/          # Slack Bolt app integration
├── cli/            # Commander-based CLI
└── web/            # Express + WebSocket dashboard
```

## Making Changes

1. Create a branch: `git checkout -b feature/my-feature`
2. Make your changes
3. Run tests: `npm test`
4. Run linter: `npm run lint`
5. Commit with a clear message
6. Open a PR

## What We're Looking For

- **New integrations** - Microsoft Teams, Discord, email
- **Better routing** - ML-based routing, learning from patterns
- **Memory improvements** - Vector search, embeddings
- **UI/UX** - Better dashboard, mobile support
- **Documentation** - Tutorials, examples, translations

## Code Style

- TypeScript strict mode
- Meaningful variable names
- Comments for complex logic
- Keep functions focused

## Questions?

Open an issue or reach out to [@hariPrasadCoder](https://github.com/hariPrasadCoder).
