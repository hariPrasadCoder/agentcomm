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
import ora from 'ora';
import inquirer from 'inquirer';
import { Storage } from '../storage/database.js';
import { CommunicationAgent, type AgentConfig } from '../core/agent.js';
import type { User, Agent, OrgContext, LLMConfig } from '../core/types.js';
import dotenv from 'dotenv';
import { createInterface } from 'readline';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const CONFIG_DIR = join(homedir(), '.agentcomm');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');
const DB_PATH = join(CONFIG_DIR, 'agentcomm.db');

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
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
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
// FIRST RUN EXPERIENCE
// ============================================================================

async function firstRunSetup(): Promise<void> {
  console.log(chalk.cyan(`
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   🤖  Welcome to AgentComm                                    ║
║                                                               ║
║   AI-first communication proxy.                               ║
║   Talk to your agent, it handles the rest.                    ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
`));

  console.log(chalk.gray('Let\'s get you set up in 60 seconds.\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'userName',
      message: 'What\'s your name?',
      default: process.env.USER || 'User',
    },
    {
      type: 'list',
      name: 'llmProvider',
      message: 'Which AI provider do you want to use?',
      choices: [
        { name: 'OpenAI (GPT-4o)', value: 'openai' },
        { name: 'Anthropic (Claude)', value: 'anthropic' },
      ],
    },
    {
      type: 'password',
      name: 'apiKey',
      message: (answers) => `Enter your ${answers.llmProvider === 'openai' ? 'OpenAI' : 'Anthropic'} API key:`,
      validate: (input) => input.length > 0 || 'API key is required',
    },
    {
      type: 'confirm',
      name: 'setupSlack',
      message: 'Do you want to connect to Slack? (You can do this later)',
      default: false,
    },
  ]);

  let slackConfig = {};
  if (answers.setupSlack) {
    console.log(chalk.gray('\nFor Slack, you\'ll need a Slack app. Create one at https://api.slack.com/apps\n'));
    
    const slackAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'slackBotToken',
        message: 'Slack Bot Token (xoxb-...):',
      },
      {
        type: 'input',
        name: 'slackAppToken',
        message: 'Slack App Token (xapp-...):',
      },
      {
        type: 'input',
        name: 'slackSigningSecret',
        message: 'Slack Signing Secret:',
      },
    ]);
    slackConfig = slackAnswers;
  }

  // Initialize storage and create user
  ensureConfigDir();
  const storage = new Storage(DB_PATH);
  
  const user = storage.createUser({ name: answers.userName });
  const agent = storage.createAgent({
    userId: user.id,
    name: `${user.name}'s Agent`,
    status: 'active',
  });

  const config: CLIConfig = {
    userId: user.id,
    userName: answers.userName,
    llmProvider: answers.llmProvider,
    llmModel: answers.llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
    apiKey: answers.apiKey,
    ...slackConfig,
    orgContext: { teams: [], channels: [], routingRules: [] },
  };

  saveConfig(config);

  console.log(chalk.green(`
✅ Setup complete!

Your agent is ready. Here's what you can do:

  ${chalk.cyan('agentcomm')}              Start chatting with your agent
  ${chalk.cyan('agentcomm tasks')}        See what others need from you
  ${chalk.cyan('agentcomm status')}       Check your outgoing requests
  ${chalk.cyan('agentcomm add-member')}   Add a teammate
  ${chalk.cyan('agentcomm slack')}        Start Slack integration
  ${chalk.cyan('agentcomm dashboard')}    Open web dashboard

Config saved to: ${chalk.gray(CONFIG_PATH)}
`));

  // Ask if they want to start chatting now
  const { startNow } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'startNow',
      message: 'Start chatting with your agent now?',
      default: true,
    },
  ]);

  if (startNow) {
    await startChat();
  }
}

// ============================================================================
// CHAT MODE
// ============================================================================

async function startChat(): Promise<void> {
  const config = loadConfig();
  
  if (!config?.userId || !config?.apiKey) {
    console.log(chalk.yellow('Please run setup first.\n'));
    await firstRunSetup();
    return;
  }

  const storage = new Storage(DB_PATH);
  const user = storage.getUser(config.userId);
  const agentRecord = storage.getAgentByUserId(config.userId);
  
  if (!user || !agentRecord) {
    console.log(chalk.yellow('User not found. Running setup again...\n'));
    await firstRunSetup();
    return;
  }

  const llmConfig: LLMConfig = {
    provider: config.llmProvider,
    model: config.llmModel,
    apiKey: config.apiKey,
  };

  const agentConfig: AgentConfig = {
    llmConfig,
    dbPath: DB_PATH,
  };

  const agent = new CommunicationAgent(user, agentRecord, agentConfig, storage, config.orgContext);

  // Event handlers for notifications
  agent.on('request.completed', (event) => {
    const payload = event.payload as { request: { subject: string }; response: string };
    console.log(chalk.green(`\n✅ Request "${payload.request.subject}" completed!`));
    console.log(chalk.gray(`Response: ${payload.response}\n`));
  });

  console.log(chalk.cyan(`
🤖 AgentComm - ${user.name}'s Agent
${chalk.gray('━'.repeat(40))}
Type your message and press Enter.
Commands: ${chalk.gray('tasks, status, exit')}
${chalk.gray('━'.repeat(40))}
`));

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const prompt = () => {
    rl.question(chalk.blue('You › '), async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        prompt();
        return;
      }

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        console.log(chalk.gray('\nGoodbye! 👋\n'));
        rl.close();
        process.exit(0);
      }

      const spinner = ora({ text: 'Thinking...', color: 'cyan' }).start();
      
      try {
        const response = await agent.handleUserMessage(trimmed);
        spinner.stop();
        console.log(chalk.green('Agent › ') + response + '\n');
      } catch (error) {
        spinner.stop();
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
  .version('0.1.0');

// Default command (no arguments) - either setup or chat
program
  .action(async () => {
    if (!isConfigured()) {
      await firstRunSetup();
    } else {
      await startChat();
    }
  });

// Setup command
program
  .command('setup')
  .description('Configure AgentComm (re-run setup)')
  .action(async () => {
    await firstRunSetup();
  });

// Chat command
program
  .command('chat')
  .description('Start chatting with your agent')
  .action(async () => {
    await startChat();
  });

// Tasks command
program
  .command('tasks')
  .description('Show your pending tasks')
  .action(() => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Please run `agentcomm` first to set up.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const tasks = storage.getTasksForUser(config.userId, 'pending');
    
    console.log(chalk.cyan('\n📥 Your Pending Tasks:\n'));
    
    if (tasks.length === 0) {
      console.log('  🎉 No pending tasks! You\'re all caught up.\n');
      return;
    }

    tasks.forEach((t, i) => {
      const request = storage.getRequest(t.requestId);
      const from = request?.fromUserId ? storage.getUser(request.fromUserId)?.name : 'Unknown';
      console.log(`  ${chalk.bold(`${i + 1}.`)} ${t.title} ${chalk.gray(`(from ${from})`)}`);
      if (t.description) console.log(`     ${chalk.gray(t.description)}`);
      console.log();
    });
  });

// Status command
program
  .command('status')
  .description('Show status of your outgoing requests')
  .action(() => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Please run `agentcomm` first to set up.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const requests = storage.getRequestsByFromUser(config.userId);
    const active = requests.filter(r => r.status !== 'completed' && r.status !== 'cancelled');
    
    console.log(chalk.cyan('\n📤 Your Active Requests:\n'));
    
    if (active.length === 0) {
      console.log('  No active requests.\n');
      return;
    }

    active.forEach(r => {
      const target = r.toUserId ? storage.getUser(r.toUserId)?.name : 'Unknown';
      const statusColor = r.status === 'waiting_response' ? chalk.yellow : chalk.blue;
      console.log(`  • ${chalk.bold(r.subject)} → ${target} ${statusColor(`(${r.status})`)}`);
    });
    console.log();
  });

// Add team member
program
  .command('add-member')
  .description('Add a team member to your organization')
  .action(async () => {
    const config = loadConfig();
    if (!config?.userId) {
      console.log(chalk.yellow('Please run `agentcomm` first to set up.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Name:', validate: (i) => i.length > 0 || 'Required' },
      { type: 'input', name: 'email', message: 'Email (optional):' },
      { type: 'input', name: 'role', message: 'Role (e.g., "Engineer", "Designer"):' },
      { type: 'input', name: 'team', message: 'Team (e.g., "Engineering", "Marketing"):' },
      { type: 'input', name: 'expertise', message: 'Expertise (comma-separated, e.g., "frontend, react, css"):' },
    ]);

    const user = storage.createUser({
      name: answers.name,
      email: answers.email || undefined,
      role: answers.role || undefined,
      team: answers.team || undefined,
      expertise: answers.expertise ? answers.expertise.split(',').map((s: string) => s.trim()) : undefined,
    });

    storage.createAgent({
      userId: user.id,
      name: `${user.name}'s Agent`,
      status: 'active',
    });

    console.log(chalk.green(`\n✅ Added ${user.name} to your organization!\n`));
    console.log(chalk.gray(`Your agent will now consider ${user.name} when routing requests.\n`));
  });

// List members
program
  .command('members')
  .alias('team')
  .description('List team members')
  .action(() => {
    const storage = new Storage(DB_PATH);
    const users = storage.getAllUsers();
    
    console.log(chalk.cyan('\n👥 Team Members:\n'));
    
    if (users.length === 0) {
      console.log('  No members yet. Run `agentcomm add-member` to add someone.\n');
      return;
    }

    users.forEach(u => {
      console.log(`  ${chalk.bold(u.name)}${u.role ? chalk.gray(` · ${u.role}`) : ''}`);
      if (u.team) console.log(`    ${chalk.gray(`Team: ${u.team}`)}`);
      if (u.expertise?.length) console.log(`    ${chalk.gray(`Expertise: ${u.expertise.join(', ')}`)}`);
      console.log();
    });
  });

// Slack integration
program
  .command('slack')
  .description('Start the Slack integration')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.slackBotToken || !config?.slackAppToken) {
      console.log(chalk.yellow('\nSlack not configured. Let\'s set it up.\n'));
      console.log(chalk.gray('You\'ll need a Slack app. Create one at: https://api.slack.com/apps\n'));
      
      const answers = await inquirer.prompt([
        { type: 'input', name: 'slackBotToken', message: 'Slack Bot Token (xoxb-...):', validate: (i) => i.startsWith('xoxb-') || 'Should start with xoxb-' },
        { type: 'input', name: 'slackAppToken', message: 'Slack App Token (xapp-...):', validate: (i) => i.startsWith('xapp-') || 'Should start with xapp-' },
        { type: 'input', name: 'slackSigningSecret', message: 'Slack Signing Secret:' },
      ]);

      const newConfig = { ...config, ...answers };
      saveConfig(newConfig);
      console.log(chalk.green('\n✅ Slack credentials saved!\n'));
    }

    const updatedConfig = loadConfig()!;
    
    const { startSlackApp } = await import('../slack/index.js');
    
    console.log(chalk.cyan('\n🚀 Starting Slack integration...\n'));
    
    await startSlackApp({
      token: updatedConfig.slackBotToken!,
      signingSecret: updatedConfig.slackSigningSecret || '',
      appToken: updatedConfig.slackAppToken!,
      llmConfig: {
        provider: updatedConfig.llmProvider,
        model: updatedConfig.llmModel,
        apiKey: updatedConfig.apiKey || '',
      },
      dbPath: DB_PATH,
    });
  });

// Web dashboard
program
  .command('dashboard')
  .alias('web')
  .description('Start the web dashboard')
  .action(async () => {
    if (!isConfigured()) {
      console.log(chalk.yellow('Please run `agentcomm` first to set up.\n'));
      return;
    }

    console.log(chalk.cyan('\n🌐 Starting web dashboard...\n'));
    await import('../web/server.js');
  });

// Daemon mode
program
  .command('daemon')
  .description('Run AgentComm as a background service (auto follow-ups)')
  .action(async () => {
    const config = loadConfig();
    
    if (!config?.userId || !config?.apiKey) {
      console.log(chalk.yellow('Please run `agentcomm` first to set up.\n'));
      return;
    }

    console.log(chalk.cyan('🤖 AgentComm daemon starting...'));
    console.log(chalk.gray('Running follow-up checks every hour. Press Ctrl+C to stop.\n'));

    const storage = new Storage(DB_PATH);
    const user = storage.getUser(config.userId);
    const agentRecord = storage.getAgentByUserId(config.userId);
    
    if (!user || !agentRecord) return;

    const agent = new CommunicationAgent(
      user, 
      agentRecord, 
      { 
        llmConfig: { provider: config.llmProvider, model: config.llmModel, apiKey: config.apiKey },
        dbPath: DB_PATH 
      }, 
      storage, 
      config.orgContext
    );

    const processFollowUps = async () => {
      console.log(chalk.gray(`[${new Date().toISOString()}] Checking for follow-ups...`));
      await agent.processFollowUps();
    };

    await processFollowUps();
    setInterval(processFollowUps, 60 * 60 * 1000);

    process.on('SIGINT', () => {
      console.log(chalk.gray('\nShutting down daemon...\n'));
      process.exit(0);
    });
  });

// Reset command
program
  .command('reset')
  .description('Reset AgentComm (delete all local data)')
  .action(async () => {
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: chalk.red('This will delete all local data. Are you sure?'),
        default: false,
      },
    ]);

    if (confirm) {
      const { rmSync } = await import('fs');
      if (existsSync(CONFIG_DIR)) {
        rmSync(CONFIG_DIR, { recursive: true });
      }
      console.log(chalk.green('\n✅ AgentComm has been reset. Run `agentcomm` to set up again.\n'));
    }
  });

program.parse();
