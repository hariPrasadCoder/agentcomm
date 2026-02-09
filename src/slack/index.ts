/**
 * Slack Integration for AgentComm
 * 
 * Each user in the Slack workspace can DM the AgentComm bot.
 * The bot acts as their personal communication agent.
 */

import { App, LogLevel } from '@slack/bolt';
import { Storage } from '../storage/database.js';
import { CommunicationAgent, type AgentConfig } from '../core/agent.js';
import type { User, Agent, OrgContext, LLMConfig } from '../core/types.js';
import dotenv from 'dotenv';

dotenv.config();

// Store active agents per user
const userAgents = new Map<string, CommunicationAgent>();

export interface SlackConfig {
  token: string;
  signingSecret: string;
  appToken: string;
  llmConfig: LLMConfig;
  dbPath?: string;
}

export async function startSlackApp(config: SlackConfig): Promise<App> {
  const storage = new Storage(config.dbPath);
  
  // Initialize org context (can be loaded from config or Slack API)
  const orgContext: OrgContext = {
    teams: [],
    channels: [],
    routingRules: [],
  };

  const app = new App({
    token: config.token,
    signingSecret: config.signingSecret,
    socketMode: true,
    appToken: config.appToken,
    logLevel: LogLevel.INFO,
  });

  // Helper to get or create agent for user
  async function getOrCreateAgent(slackUserId: string, slackUserName: string): Promise<CommunicationAgent> {
    if (userAgents.has(slackUserId)) {
      return userAgents.get(slackUserId)!;
    }

    // Get or create user in database
    let user = storage.getUserBySlackId(slackUserId);
    if (!user) {
      user = storage.createUser({
        name: slackUserName,
        slackId: slackUserId,
      });
    }

    // Get or create agent for user
    let agentRecord = storage.getAgentByUserId(user.id);
    if (!agentRecord) {
      agentRecord = storage.createAgent({
        userId: user.id,
        name: `${user.name}'s Agent`,
        status: 'active',
      });
    }

    // Load org context from Slack
    await loadOrgContext(app, orgContext, storage);

    const agentConfig: AgentConfig = {
      llmConfig: config.llmConfig,
      dbPath: config.dbPath,
    };

    const agent = new CommunicationAgent(user, agentRecord, agentConfig, storage, orgContext);
    
    // Set up event handlers for Slack notifications
    agent.on('request.completed', async (event) => {
      const { request, response } = event.payload as { request: { fromUserId: string; subject: string }; response: string };
      const requester = storage.getUser(request.fromUserId);
      if (requester?.slackId) {
        await app.client.chat.postMessage({
          channel: requester.slackId,
          text: `✅ Your request "${request.subject}" has been answered!\n\n> ${response}`,
        });
      }
    });

    agent.on('task.created', async (event) => {
      const { request, fromUser } = event.payload as { request: { description: string }; fromUser: User };
      if (user.slackId) {
        await app.client.chat.postMessage({
          channel: user.slackId,
          text: `📥 New request from ${fromUser.name}:\n\n${request.description}\n\nReply here to respond.`,
        });
      }
    });

    userAgents.set(slackUserId, agent);
    return agent;
  }

  // Handle direct messages
  app.message(async ({ message, say, client }) => {
    // Only handle direct messages
    if (message.channel_type !== 'im') return;
    if (!('text' in message) || !message.text) return;
    if (!('user' in message) || !message.user) return;

    try {
      // Get user info
      const userInfo = await client.users.info({ user: message.user });
      const userName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';

      // Get or create agent
      const agent = await getOrCreateAgent(message.user, userName);

      // Process the message
      const response = await agent.handleUserMessage(message.text);
      
      await say(response);
    } catch (error) {
      console.error('Error handling message:', error);
      await say("Sorry, I encountered an error processing your message. Please try again.");
    }
  });

  // Slash command: /agent
  app.command('/agent', async ({ command, ack, respond }) => {
    await ack();

    try {
      const userInfo = await app.client.users.info({ user: command.user_id });
      const userName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
      
      const agent = await getOrCreateAgent(command.user_id, userName);
      const response = await agent.handleUserMessage(command.text || 'What are my tasks?');
      
      await respond(response);
    } catch (error) {
      console.error('Error handling command:', error);
      await respond("Sorry, I encountered an error. Please try again.");
    }
  });

  // App home opened
  app.event('app_home_opened', async ({ event, client }) => {
    try {
      const userInfo = await client.users.info({ user: event.user });
      const userName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';
      
      const agent = await getOrCreateAgent(event.user, userName);
      const user = agent.getUser();
      const tasks = storage.getTasksForUser(user.id, 'pending');
      const requests = storage.getRequestsByFromUser(user.id)
        .filter(r => r.status !== 'completed' && r.status !== 'cancelled');

      await client.views.publish({
        user_id: event.user,
        view: {
          type: 'home',
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: '🤖 AgentComm', emoji: true }
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `Hi ${userName}! I'm your communication agent. DM me to get started.` }
            },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*📥 Your Tasks:* ${tasks.length} pending` }
            },
            {
              type: 'section', 
              text: { type: 'mrkdwn', text: `*📤 Your Requests:* ${requests.length} active` }
            },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '*Quick Commands:*\n• "I need..." - Create a new request\n• "tasks" - See your pending tasks\n• "status" - Check your request status' }
            }
          ]
        }
      });
    } catch (error) {
      console.error('Error updating app home:', error);
    }
  });

  // Start the app
  await app.start();
  console.log('⚡ AgentComm Slack app is running!');
  
  return app;
}

// Load organizational context from Slack
async function loadOrgContext(app: App, orgContext: OrgContext, storage: Storage): Promise<void> {
  try {
    // Load channels
    const channelResult = await app.client.conversations.list({ types: 'public_channel' });
    orgContext.channels = (channelResult.channels || []).map(c => ({
      id: c.id || '',
      name: c.name || '',
      type: 'public' as const,
      purpose: c.purpose?.value,
    }));

    // Load users and create in database
    const userResult = await app.client.users.list();
    for (const member of userResult.members || []) {
      if (member.is_bot || member.deleted) continue;
      
      const existing = storage.getUserBySlackId(member.id || '');
      if (!existing && member.id) {
        storage.createUser({
          name: member.real_name || member.name || 'Unknown',
          slackId: member.id,
          email: member.profile?.email,
        });
      }
    }
  } catch (error) {
    console.error('Error loading org context:', error);
  }
}

// Main entry point when running directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const config: SlackConfig = {
    token: process.env.SLACK_BOT_TOKEN || '',
    signingSecret: process.env.SLACK_SIGNING_SECRET || '',
    appToken: process.env.SLACK_APP_TOKEN || '',
    llmConfig: {
      provider: (process.env.LLM_PROVIDER as 'openai' | 'anthropic') || 'openai',
      model: process.env.LLM_MODEL || 'gpt-4o',
      apiKey: process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '',
    },
    dbPath: process.env.DB_PATH || './agentcomm.db',
  };

  if (!config.token || !config.signingSecret || !config.appToken) {
    console.error('Missing Slack credentials. Please set SLACK_BOT_TOKEN, SLACK_SIGNING_SECRET, and SLACK_APP_TOKEN');
    process.exit(1);
  }

  startSlackApp(config).catch(console.error);
}
