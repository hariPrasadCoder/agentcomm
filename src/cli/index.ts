#!/usr/bin/env node
/**
 * AgentComm CLI
 * 
 * A terminal-based interface to interact with your communication agent.
 * Similar to OpenClaw, runs locally and provides a chat interface.
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
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

dotenv.config();

const CONFIG_PATH = join(homedir(), '.agentcomm', 'config.json');
const DB_PATH = join(homedir(), '.agentcomm', 'agentcomm.db');

interface CLIConfig {
  userId?: string;
  userName?: string;
  llmProvider: 'openai' | 'anthropic';
  llmModel: string;
  apiKey?: string;
  orgContext: OrgContext;
}

function loadConfig(): CLIConfig {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  }
  return {
    llmProvider: 'openai',
    llmModel: 'gpt-4o',
    orgContext: { teams: [], channels: [], routingRules: [] },
  };
}

function saveConfig(config: CLIConfig): void {
  const dir = join(homedir(), '.agentcomm');
  if (!existsSync(dir)) {
    require('fs').mkdirSync(dir, { recursive: true });
  }
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

const program = new Command();

program
  .name('agentcomm')
  .description('AI-first communication proxy. Talk to your agent, it handles the rest.')
  .version('0.1.0');

// Setup command
program
  .command('setup')
  .description('Configure AgentComm')
  .action(async () => {
    console.log(chalk.cyan('\n🤖 AgentComm Setup\n'));
    
    const config = loadConfig();
    
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'userName',
        message: 'What\'s your name?',
        default: config.userName || process.env.USER,
      },
      {
        type: 'list',
        name: 'llmProvider',
        message: 'Which LLM provider?',
        choices: ['openai', 'anthropic'],
        default: config.llmProvider,
      },
      {
        type: 'input',
        name: 'llmModel',
        message: 'Which model?',
        default: (answers: { llmProvider: string }) => 
          answers.llmProvider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o',
      },
      {
        type: 'password',
        name: 'apiKey',
        message: 'API Key (leave blank to use env var):',
      },
    ]);

    const storage = new Storage(DB_PATH);
    
    // Create or update user
    let user = config.userId ? storage.getUser(config.userId) : null;
    if (!user) {
      user = storage.createUser({ name: answers.userName });
    }

    // Create agent if needed
    let agent = storage.getAgentByUserId(user.id);
    if (!agent) {
      agent = storage.createAgent({
        userId: user.id,
        name: `${user.name}'s Agent`,
        status: 'active',
      });
    }

    const newConfig: CLIConfig = {
      userId: user.id,
      userName: answers.userName,
      llmProvider: answers.llmProvider,
      llmModel: answers.llmModel,
      apiKey: answers.apiKey || undefined,
      orgContext: config.orgContext,
    };

    saveConfig(newConfig);
    
    console.log(chalk.green('\n✅ Setup complete! Run `agentcomm chat` to start.\n'));
  });

// Add team member command
program
  .command('add-member')
  .description('Add a team member to your org')
  .action(async () => {
    const config = loadConfig();
    const storage = new Storage(DB_PATH);
    
    const answers = await inquirer.prompt([
      { type: 'input', name: 'name', message: 'Name:' },
      { type: 'input', name: 'email', message: 'Email (optional):' },
      { type: 'input', name: 'role', message: 'Role (optional):' },
      { type: 'input', name: 'team', message: 'Team (optional):' },
      { type: 'input', name: 'expertise', message: 'Expertise (comma-separated):' },
    ]);

    const user = storage.createUser({
      name: answers.name,
      email: answers.email || undefined,
      role: answers.role || undefined,
      team: answers.team || undefined,
      expertise: answers.expertise ? answers.expertise.split(',').map((s: string) => s.trim()) : undefined,
    });

    // Also create an agent for them
    storage.createAgent({
      userId: user.id,
      name: `${user.name}'s Agent`,
      status: 'active',
    });

    console.log(chalk.green(`\n✅ Added ${user.name} to your organization.\n`));
  });

// List members command
program
  .command('members')
  .description('List team members')
  .action(() => {
    const storage = new Storage(DB_PATH);
    const users = storage.getAllUsers();
    
    console.log(chalk.cyan('\n📋 Team Members:\n'));
    
    if (users.length === 0) {
      console.log('  No members yet. Run `agentcomm add-member` to add someone.\n');
      return;
    }

    users.forEach(u => {
      console.log(`  ${chalk.bold(u.name)}${u.role ? ` (${u.role})` : ''}`);
      if (u.team) console.log(`    Team: ${u.team}`);
      if (u.expertise?.length) console.log(`    Expertise: ${u.expertise.join(', ')}`);
      console.log();
    });
  });

// Chat command (main interaction)
program
  .command('chat')
  .description('Start chatting with your agent')
  .action(async () => {
    const config = loadConfig();
    
    if (!config.userId) {
      console.log(chalk.yellow('Please run `agentcomm setup` first.\n'));
      return;
    }

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow('Please set your API key in setup or via environment variable.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const user = storage.getUser(config.userId);
    const agentRecord = storage.getAgentByUserId(config.userId);
    
    if (!user || !agentRecord) {
      console.log(chalk.yellow('User not found. Please run `agentcomm setup` again.\n'));
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

    // Set up event handlers for terminal notifications
    agent.on('request.completed', (event) => {
      const payload = event.payload as { request: { subject: string }; response: string };
      console.log(chalk.green(`\n✅ Request "${payload.request.subject}" completed!`));
      console.log(chalk.gray(`Response: ${payload.response}\n`));
    });

    console.log(chalk.cyan(`\n🤖 AgentComm - Your Communication Agent`));
    console.log(chalk.gray(`Type your message and press Enter. Type 'exit' to quit.\n`));

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const prompt = () => {
      rl.question(chalk.blue('You: '), async (input) => {
        const trimmed = input.trim();
        
        if (trimmed.toLowerCase() === 'exit') {
          console.log(chalk.gray('\nGoodbye! 👋\n'));
          rl.close();
          process.exit(0);
        }

        if (!trimmed) {
          prompt();
          return;
        }

        const spinner = ora('Thinking...').start();
        
        try {
          const response = await agent.handleUserMessage(trimmed);
          spinner.stop();
          console.log(chalk.green('Agent: ') + response + '\n');
        } catch (error) {
          spinner.stop();
          console.log(chalk.red('Error: ') + (error as Error).message + '\n');
        }

        prompt();
      });
    };

    prompt();
  });

// Tasks command
program
  .command('tasks')
  .description('Show your pending tasks')
  .action(() => {
    const config = loadConfig();
    if (!config.userId) {
      console.log(chalk.yellow('Please run `agentcomm setup` first.\n'));
      return;
    }

    const storage = new Storage(DB_PATH);
    const tasks = storage.getTasksForUser(config.userId, 'pending');
    
    console.log(chalk.cyan('\n📥 Your Pending Tasks:\n'));
    
    if (tasks.length === 0) {
      console.log('  🎉 No pending tasks!\n');
      return;
    }

    tasks.forEach((t, i) => {
      const request = storage.getRequest(t.requestId);
      const from = request?.fromUserId ? storage.getUser(request.fromUserId)?.name : 'Unknown';
      console.log(`  ${i + 1}. ${chalk.bold(t.title)} (from ${from})`);
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
    if (!config.userId) {
      console.log(chalk.yellow('Please run `agentcomm setup` first.\n'));
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
      console.log(`  • ${chalk.bold(r.subject)} → ${target} (${statusColor(r.status)})`);
    });
    console.log();
  });

// Daemon command (for background operation)
program
  .command('daemon')
  .description('Run AgentComm as a background service')
  .action(async () => {
    const config = loadConfig();
    
    if (!config.userId) {
      console.log(chalk.yellow('Please run `agentcomm setup` first.\n'));
      return;
    }

    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.log(chalk.yellow('Please set your API key.\n'));
      return;
    }

    console.log(chalk.cyan('🤖 AgentComm daemon starting...'));
    console.log(chalk.gray('Running follow-up checks every hour.\n'));

    const storage = new Storage(DB_PATH);
    const user = storage.getUser(config.userId);
    const agentRecord = storage.getAgentByUserId(config.userId);
    
    if (!user || !agentRecord) return;

    const llmConfig: LLMConfig = {
      provider: config.llmProvider,
      model: config.llmModel,
      apiKey,
    };

    const agent = new CommunicationAgent(
      user, 
      agentRecord, 
      { llmConfig, dbPath: DB_PATH }, 
      storage, 
      config.orgContext
    );

    // Process follow-ups every hour
    const processFollowUps = async () => {
      console.log(chalk.gray(`[${new Date().toISOString()}] Checking for follow-ups...`));
      await agent.processFollowUps();
    };

    await processFollowUps();
    setInterval(processFollowUps, 60 * 60 * 1000);

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log(chalk.gray('\nShutting down daemon...\n'));
      process.exit(0);
    });
  });

// Slack command
program
  .command('slack')
  .description('Start the Slack integration')
  .action(async () => {
    const { startSlackApp } = await import('../slack/index.js');
    const config = loadConfig();
    
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    await startSlackApp({
      token: process.env.SLACK_BOT_TOKEN || '',
      signingSecret: process.env.SLACK_SIGNING_SECRET || '',
      appToken: process.env.SLACK_APP_TOKEN || '',
      llmConfig: {
        provider: config.llmProvider,
        model: config.llmModel,
        apiKey: apiKey || '',
      },
      dbPath: DB_PATH,
    });
  });

program.parse();
