#!/usr/bin/env node
/**
 * AgentComm CLI
 * 
 * AI-first communication proxy. Talk to your agent, it handles the rest.
 * 
 * Quick Start:
 *   npx agentcomm          # First run guides you through setup
 *   agentcomm chat         # Start chatting
 *   agentcomm slack        # Connect to Slack
 */

import { Command } from 'commander';
import chalk from 'chalk';
import * as p from '@clack/prompts';
import { Storage } from '../storage/database.js';
import { CommunicationAgent, type AgentConfig } from '../core/agent.js';
import type { OrgContext, LLMConfig } from '../core/types.js';
import dotenv from 'dotenv';
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { setTimeout as sleep } from 'timers/promises';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.agentcomm');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DB_PATH = join(CONFIG_DIR, 'agentcomm.db');

const VERSION = '0.1.0';

// ============================================================================
// BRANDING
// ============================================================================

const LOGO = `
   █████╗  ██████╗ ███████╗███╗   ██╗████████╗
  ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
  ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
  ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
  ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
  ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
   ██████╗ ██████╗ ███╗   ███╗███╗   ███╗
  ██╔════╝██╔═══██╗████╗ ████║████╗ ████║
  ██║     ██║   ██║██╔████╔██║██╔████╔██║
  ██║     ██║   ██║██║╚██╔╝██║██║╚██╔╝██║
  ╚██████╗╚██████╔╝██║ ╚═╝ ██║██║ ╚═╝ ██║
   ╚═════╝ ╚═════╝ ╚═╝     ╚═╝╚═╝     ╚═╝
`;

function printBanner(): void {
  console.log(chalk.cyan(LOGO));
  console.log(chalk.gray('  AI-first communication proxy'));
  console.log(chalk.gray(`  v${VERSION}\n`));
}

// ============================================================================
// CONFIG
// ============================================================================

interface CLIConfig {
  userId?: string;
  userName?: string;
  llmProvider: 'openai' | 'anthropic';
  llmModel: string;
  apiKey?: string;
  slackBotToken?: string;
  slackSigningSecret?: string;
  slackAppToken?: string;
  orgContext: OrgContext;
}

function ensureConfigDir(): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function loadConfig(): CLIConfig | null {
  if (existsSync(CONFIG_PATH)) {
    try {
      return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
    } catch {
      return null;
    }
  }
  return null;
}

function saveConfig(config: CLIConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function isConfigured(): boolean {
  const config = loadConfig();
  return !!(config?.userId && config?.apiKey);
}

// ============================================================================
// FIRST RUN SETUP (using @clack/prompts)
// ============================================================================

async function runSetupWizard(): Promise<void> {
  printBanner();
  
  p.intro(chalk.bgCyan(chalk.black(' AgentComm Setup ')));

  // Check for existing config
  const existingConfig = loadConfig();
  if (existingConfig?.userId) {
    const action = await p.select({
      message: 'Existing configuration found. What would you like to do?',
      options: [
        { value: 'keep', label: 'Keep existing config', hint: 'Start chatting with current settings' },
        { value: 'modify', label: 'Modify settings', hint: 'Update API key or provider' },
        { value: 'reset', label: 'Start fresh', hint: 'Delete all data and reconfigure' },
      ],
    });

    if (p.isCancel(action)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }

    if (action === 'keep') {
      p.outro(chalk.green('Ready! Run `agentcomm chat` to start.'));
      return;
    }

    if (action === 'reset') {
      const confirmReset = await p.confirm({
        message: 'This will delete all local data. Continue?',
        initialValue: false,
      });
      
      if (p.isCancel(confirmReset) || !confirmReset) {
        p.cancel('Reset cancelled.');
        process.exit(0);
      }

      if (existsSync(CONFIG_DIR)) {
        rmSync(CONFIG_DIR, { recursive: true });
      }
    }
  }

  // Setup flow
  const setupMode = await p.select({
    message: 'How would you like to set up AgentComm?',
    options: [
      { value: 'quickstart', label: 'QuickStart', hint: 'Just the basics — get chatting in 30 seconds' },
      { value: 'full', label: 'Full Setup', hint: 'Configure Slack integration and team members' },
    ],
  });

  if (p.isCancel(setupMode)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // Basic info
  const userName = await p.text({
    message: 'What\'s your name?',
    placeholder: process.env.USER || 'Your name',
    validate: (value) => {
      if (!value.trim()) return 'Name is required';
    },
  });

  if (p.isCancel(userName)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // LLM Provider
  const llmProvider = await p.select({
    message: 'Which AI provider?',
    options: [
      { value: 'openai', label: 'OpenAI', hint: 'GPT-4o, GPT-4 Turbo' },
      { value: 'anthropic', label: 'Anthropic', hint: 'Claude 3.5 Sonnet, Claude 3 Opus' },
    ],
  });

  if (p.isCancel(llmProvider)) {
    p.cancel('Setup cancelled.');
    process.exit(0);
  }

  // API Key
  const envKey = llmProvider === 'openai' ? process.env.OPENAI_API_KEY : process.env.ANTHROPIC_API_KEY;
  
  let apiKey: string;
  if (envKey) {
    const useEnvKey = await p.confirm({
      message: `Found ${llmProvider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'} in environment. Use it?`,
      initialValue: true,
    });
    
    if (p.isCancel(useEnvKey)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
    
    apiKey = useEnvKey ? envKey : '';
  } else {
    apiKey = '';
  }

  if (!apiKey) {
    const keyInput = await p.password({
      message: `Enter your ${llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key:`,
      validate: (value) => {
        if (!value.trim()) return 'API key is required';
        if (llmProvider === 'openai' && !value.startsWith('sk-')) {
          return 'OpenAI keys start with sk-';
        }
      },
    });

    if (p.isCancel(keyInput)) {
      p.cancel('Setup cancelled.');
      process.exit(0);
    }
    
    apiKey = keyInput;
  }

  // Slack setup (full mode only)
  let slackConfig = {};
  if (setupMode === 'full') {
    const setupSlack = await p.confirm({
      message: 'Set up Slack integration?',
      initialValue: false,
    });

    if (!p.isCancel(setupSlack) && setupSlack) {
      p.note(
        'Create a Slack app at https://api.slack.com/apps\n' +
        'Enable Socket Mode and add these Bot Token Scopes:\n' +
        '  • chat:write\n' +
        '  • im:history, im:write\n' +
        '  • users:read, channels:read',
        'Slack Setup'
      );

      const slackBotToken = await p.text({
        message: 'Slack Bot Token (xoxb-...):',
        placeholder: 'xoxb-...',
        validate: (v) => v && !v.startsWith('xoxb-') ? 'Should start with xoxb-' : undefined,
      });

      const slackAppToken = await p.text({
        message: 'Slack App Token (xapp-...):',
        placeholder: 'xapp-...',
        validate: (v) => v && !v.startsWith('xapp-') ? 'Should start with xapp-' : undefined,
      });

      const slackSigningSecret = await p.text({
        message: 'Slack Signing Secret:',
        placeholder: 'Your signing secret',
      });

      if (!p.isCancel(slackBotToken) && !p.isCancel(slackAppToken)) {
        slackConfig = {
          slackBotToken: slackBotToken || undefined,
          slackAppToken: slackAppToken || undefined,
          slackSigningSecret: slackSigningSecret || undefined,
        };
      }
    }
  }

  // Create user and agent
  const s = p.spinner();
  s.start('Setting up your agent...');
  
  await sleep(500); // Brief pause for effect
  
  ensureConfigDir();
  const storage = new Storage(DB_PATH);
  
  const user = storage.createUser({ name: String(userName) });
  storage.createAgent({
    userId: user.id,
    name: `${user.name}'s Agent`,
    status: 'active',
  });

  const config: CLIConfig = {
    userId: user.id,
    userName: String(userName),
    llmProvider: llmProvider as 'openai' | 'anthropic',
    llmModel: llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
    apiKey,
    ...slackConfig,
    orgContext: { teams: [], channels: [], routingRules: [] },
  };

  saveConfig(config);
  
  s.stop('Agent ready!');

  // Next steps
  const nextSteps = [
    `${chalk.cyan('agentcomm')}           Start chatting`,
    `${chalk.cyan('agentcomm add-member')} Add teammates`,
    `${chalk.cyan('agentcomm slack')}      Connect to Slack`,
    `${chalk.cyan('agentcomm dashboard')}  Open web UI`,
  ];

  p.note(nextSteps.join('\n'), 'Next Steps');
  
  p.outro(chalk.green('Setup complete! 🎉'));

  // Offer to start chatting
  const startNow = await p.confirm({
    message: 'Start chatting now?',
    initialValue: true,
  });

  if (!p.isCancel(startNow) && startNow) {
    console.log();
    await startChat();
  }
}

// ============================================================================
// CHAT MODE
// ============================================================================

async function startChat(): Promise<void> {
  const config = loadConfig();
  
  if (!config?.userId || !config?.apiKey) {
    await runSetupWizard();
    return;
  }

  const storage = new Storage(DB_PATH);
  const user = storage.getUser(config.userId);
  const agentRecord = storage.getAgentByUserId(config.userId);
  
  if (!user || !agentRecord) {
    console.log(chalk.yellow('User not found. Running setup...\n'));
    await runSetupWizard();
    return;
  }

  const llmConfig: LLMConfig = {
    provider: config.llmProvider,
    model: config.llmModel,
    apiKey: config.apiKey,
  };

  const agent = new CommunicationAgent(
    user, 
    agentRecord, 
    { llmConfig, dbPath: DB_PATH }, 
    storage, 
    config.orgContext
  );

  // Event handlers
  agent.on('request.completed', (event) => {
    const payload = event.payload as { request: { subject: string }; response: string };
    console.log(chalk.green(`\n✅ Request "${payload.request.subject}" completed!`));
    console.log(chalk.gray(`Response: ${payload.response}\n`));
  });

  console.log(chalk.cyan(`
┌─────────────────────────────────────────────────┐
│  🤖 AgentComm — ${user.name}'s Agent${' '.repeat(Math.max(0, 22 - user.name.length))}│
├─────────────────────────────────────────────────┤
│  Commands: tasks, status, help, exit            │
└─────────────────────────────────────────────────┘
`));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(chalk.cyan('You › '), async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        prompt();
        return;
      }

      // Built-in commands
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(chalk.gray('\nGoodbye! 👋\n'));
        rl.close();
        process.exit(0);
      }

      if (trimmed.toLowerCase() === 'help') {
        console.log(chalk.gray(`
  Commands:
    tasks     See what others need from you
    status    Check your outgoing requests
    exit      Quit the chat

  Or just type naturally:
    "I need the Q4 report from marketing"
    "What's on my plate?"
`));
        prompt();
        return;
      }

      // Show thinking indicator
      process.stdout.write(chalk.gray('  Thinking...'));
      
      try {
        const response = await agent.handleUserMessage(trimmed);
        // Clear "Thinking..." and show response
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        console.log(chalk.green('Agent › ') + response + '\n');
      } catch (error) {
        process.stdout.write('\r' + ' '.repeat(20) + '\r');
        console.log(chalk.red('Error: ') + (error as Error).message + '\n');
      }

      prompt();
    });
  };

  prompt();
}

// ============================================================================
// CLI COMMANDS
// ============================================================================

const program = new Command();

program
  .name('agentcomm')
  .description('AI-first communication proxy. Talk to your agent, it handles the rest.')
  .version(VERSION);

// Default action
program
  .action(async () => {
    if (!isConfigured()) {
      await runSetupWizard();
    } else {
      await startChat();
    }
  });

// Setup
program
  .command('setup')
  .description('Configure AgentComm')
  .action(runSetupWizard);

// Chat
program
  .command('chat')
  .description('Start chatting with your agent')
  .action(startChat);

// Tasks
program
  .command('tasks')
  .description('Show your pending tasks')
  .action(() => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Run `agentcomm` first to set up.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const tasks = storage.getTasksForUser(config.userId, 'pending');
    
    console.log(chalk.cyan('\n📥 Pending Tasks\n'));
    
    if (tasks.length === 0) {
      console.log(chalk.gray('  No pending tasks — you\'re all caught up! 🎉\n'));
      return;
    }

    tasks.forEach((t, i) => {
      const request = storage.getRequest(t.requestId);
      const from = request?.fromUserId ? storage.getUser(request.fromUserId)?.name : 'Unknown';
      console.log(`  ${chalk.bold(`${i + 1}.`)} ${t.title}`);
      console.log(`     ${chalk.gray(`from ${from}`)}`);
      if (t.description) console.log(`     ${chalk.gray(t.description)}`);
      console.log();
    });
  });

// Status
program
  .command('status')
  .description('Show your outgoing requests')
  .action(() => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Run `agentcomm` first to set up.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const requests = storage.getRequestsByFromUser(config.userId);
    const active = requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    
    console.log(chalk.cyan('\n📤 Active Requests\n'));
    
    if (active.length === 0) {
      console.log(chalk.gray('  No active requests.\n'));
      return;
    }

    active.forEach(r => {
      const target = r.toUserId ? storage.getUser(r.toUserId)?.name : 'Unassigned';
      const statusIcon = r.status === 'waiting_response' ? '⏳' : '📨';
      console.log(`  ${statusIcon} ${chalk.bold(r.subject)}`);
      console.log(`     ${chalk.gray(`→ ${target} (${r.status})`)}\n`);
    });
  });

// Add member
program
  .command('add-member')
  .description('Add a team member')
  .action(async () => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Run `agentcomm` first to set up.\n'));
      return;
    }

    p.intro(chalk.bgCyan(chalk.black(' Add Team Member ')));

    const name = await p.text({
      message: 'Name',
      validate: (v) => !v?.trim() ? 'Required' : undefined,
    });
    if (p.isCancel(name)) return;

    const role = await p.text({
      message: 'Role (e.g., "Engineer", "Designer")',
      placeholder: 'Optional',
    });

    const team = await p.text({
      message: 'Team (e.g., "Engineering", "Marketing")',
      placeholder: 'Optional',
    });

    const expertise = await p.text({
      message: 'Expertise (comma-separated)',
      placeholder: 'e.g., frontend, react, design',
    });

    const storage = new Storage(DB_PATH);
    const user = storage.createUser({
      name: String(name),
      role: role && !p.isCancel(role) ? String(role) : undefined,
      team: team && !p.isCancel(team) ? String(team) : undefined,
      expertise: expertise && !p.isCancel(expertise) 
        ? String(expertise).split(',').map(s => s.trim()).filter(Boolean) 
        : undefined,
    });

    storage.createAgent({
      userId: user.id,
      name: `${user.name}'s Agent`,
      status: 'active',
    });

    p.outro(chalk.green(`Added ${user.name}!`));
  });

// Members
program
  .command('members')
  .alias('team')
  .description('List team members')
  .action(() => {
    const storage = new Storage(DB_PATH);
    const users = storage.getAllUsers();
    
    console.log(chalk.cyan('\n👥 Team\n'));
    
    if (users.length === 0) {
      console.log(chalk.gray('  No members yet. Run `agentcomm add-member`.\n'));
      return;
    }

    users.forEach(u => {
      console.log(`  ${chalk.bold(u.name)}${u.role ? chalk.gray(` · ${u.role}`) : ''}`);
      if (u.team) console.log(`    ${chalk.gray(`Team: ${u.team}`)}`);
      if (u.expertise?.length) console.log(`    ${chalk.gray(`Knows: ${u.expertise.join(', ')}`)}`);
      console.log();
    });
  });

// Slack
program
  .command('slack')
  .description('Start Slack integration')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.slackBotToken || !config?.slackAppToken) {
      p.intro(chalk.bgCyan(chalk.black(' Slack Setup ')));
      
      p.note(
        'Create a Slack app at https://api.slack.com/apps\n\n' +
        'Required:\n' +
        '1. Enable Socket Mode → get App Token (xapp-...)\n' +
        '2. Add Bot Token Scopes: chat:write, im:history, im:write, users:read\n' +
        '3. Install to workspace → get Bot Token (xoxb-...)\n' +
        '4. Copy Signing Secret from Basic Information',
        'Setup Instructions'
      );

      const slackBotToken = await p.text({
        message: 'Bot Token (xoxb-...)',
        validate: (v) => v && !v.startsWith('xoxb-') ? 'Should start with xoxb-' : undefined,
      });
      if (p.isCancel(slackBotToken)) return;

      const slackAppToken = await p.text({
        message: 'App Token (xapp-...)',
        validate: (v) => v && !v.startsWith('xapp-') ? 'Should start with xapp-' : undefined,
      });
      if (p.isCancel(slackAppToken)) return;

      const slackSigningSecret = await p.text({
        message: 'Signing Secret',
      });

      const newConfig = { 
        ...config, 
        slackBotToken: String(slackBotToken),
        slackAppToken: String(slackAppToken),
        slackSigningSecret: slackSigningSecret ? String(slackSigningSecret) : undefined,
      };
      saveConfig(newConfig as CLIConfig);
      
      p.outro(chalk.green('Slack configured!'));
    }

    const updatedConfig = loadConfig()!;
    
    if (!updatedConfig.apiKey) {
      console.log(chalk.yellow('API key not configured. Run `agentcomm setup`.\n'));
      return;
    }

    console.log(chalk.cyan('\n🚀 Starting Slack bot...\n'));
    
    const { startSlackApp } = await import('../slack/index.js');
    
    await startSlackApp({
      token: updatedConfig.slackBotToken!,
      signingSecret: updatedConfig.slackSigningSecret || '',
      appToken: updatedConfig.slackAppToken!,
      llmConfig: {
        provider: updatedConfig.llmProvider,
        model: updatedConfig.llmModel,
        apiKey: updatedConfig.apiKey,
      },
      dbPath: DB_PATH,
    });
  });

// Dashboard
program
  .command('dashboard')
  .alias('web')
  .description('Start web dashboard')
  .action(async () => {
    if (!isConfigured()) {
      console.log(chalk.yellow('Run `agentcomm` first to set up.\n'));
      return;
    }
    console.log(chalk.cyan('\n🌐 Starting dashboard...\n'));
    await import('../web/server.js');
  });

// Reset
program
  .command('reset')
  .description('Delete all local data')
  .action(async () => {
    const confirm = await p.confirm({
      message: chalk.red('Delete all AgentComm data? This cannot be undone.'),
      initialValue: false,
    });

    if (p.isCancel(confirm) || !confirm) {
      console.log(chalk.gray('Cancelled.\n'));
      return;
    }

    if (existsSync(CONFIG_DIR)) {
      rmSync(CONFIG_DIR, { recursive: true });
    }
    
    console.log(chalk.green('\n✅ Reset complete. Run `agentcomm` to start fresh.\n'));
  });

program.parse();
