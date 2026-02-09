/**
 * Slack Integration for AgentComm
 * 
 * Each user in the Slack workspace can DM the AgentComm bot.
 * The bot acts as their personal communication agent.
 * 
 * Features:
 * - Personal agent per user
 * - Request routing to other team members
 * - Auto-reply from memory if agent knows the answer
 * - Task queue notifications
 * - Channel mention monitoring
 */

import { App, LogLevel } from '@slack/bolt';
import { Storage } from '../storage/database.js';
import { CommunicationAgent, type AgentConfig } from '../core/agent.js';
import type { User, OrgContext, LLMConfig } from '../core/types.js';
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
  
  // Initialize org context
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

    let user = storage.getUserBySlackId(slackUserId);
    if (!user) {
      user = storage.createUser({
        name: slackUserName,
        slackId: slackUserId,
      });
    }

    let agentRecord = storage.getAgentByUserId(user.id);
    if (!agentRecord) {
      agentRecord = storage.createAgent({
        userId: user.id,
        name: `${user.name}'s Agent`,
        status: 'active',
      });
    }

    await loadOrgContext(app, orgContext, storage);

    const agentConfig: AgentConfig = {
      llmConfig: config.llmConfig,
      dbPath: config.dbPath,
    };

    const agent = new CommunicationAgent(user, agentRecord, agentConfig, storage, orgContext);
    
    // Event: Request completed - notify the requester
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

    // Event: Task created - notify the assignee
    agent.on('task.created', async (event) => {
      const { request, fromUser } = event.payload as { request: { description: string }; fromUser: User };
      if (user.slackId) {
        await app.client.chat.postMessage({
          channel: user.slackId,
          text: `📥 New request from ${fromUser.name}:\n\n${request.description}\n\nReply here to respond, or say "tasks" to see all pending.`,
        });
      }
    });

    userAgents.set(slackUserId, agent);
    return agent;
  }

  // Helper to extract mentioned users from message
  function extractMentionedUsers(text: string): string[] {
    const mentions = text.match(/<@([A-Z0-9]+)>/g) || [];
    return mentions.map(m => m.replace(/<@|>/g, ''));
  }

  // Helper to check if message is a request for someone else
  async function parseRequestTarget(text: string, senderId: string): Promise<{
    isRequestForOther: boolean;
    targetUserId?: string;
    targetUser?: User;
    cleanedRequest: string;
  }> {
    const mentionedUsers = extractMentionedUsers(text);
    
    // Filter out bot mentions and sender
    const otherUsers = mentionedUsers.filter(id => id !== senderId);
    
    if (otherUsers.length > 0) {
      // Message mentions someone else - likely a request for them
      const targetSlackId = otherUsers[0];
      const targetUser = storage.getUserBySlackId(targetSlackId);
      
      // Clean up the message (remove the mention)
      const cleanedRequest = text.replace(/<@[A-Z0-9]+>/g, '').trim();
      
      return {
        isRequestForOther: true,
        targetUserId: targetSlackId,
        targetUser: targetUser || undefined,
        cleanedRequest,
      };
    }

    // Check for "from [name]" or "ask [name]" patterns
    const fromPattern = /(?:from|ask|need.*from|get.*from)\s+(\w+)/i;
    const match = text.match(fromPattern);
    
    if (match) {
      const targetName = match[1];
      const allUsers = storage.getAllUsers();
      const targetUser = allUsers.find(u => 
        u.name.toLowerCase().includes(targetName.toLowerCase())
      );
      
      if (targetUser && targetUser.slackId !== senderId) {
        return {
          isRequestForOther: true,
          targetUserId: targetUser.slackId,
          targetUser,
          cleanedRequest: text,
        };
      }
    }

    return {
      isRequestForOther: false,
      cleanedRequest: text,
    };
  }

  // Handle direct messages to the bot
  app.message(async ({ message, say, client }) => {
    // Only handle direct messages
    if (message.channel_type !== 'im') return;
    if (!('text' in message) || !message.text) return;
    if (!('user' in message) || !message.user) return;

    const messageText = message.text;
    const senderSlackId = message.user;

    try {
      // Get sender info
      const userInfo = await client.users.info({ user: senderSlackId });
      const senderName = userInfo.user?.real_name || userInfo.user?.name || 'Unknown';

      // Get sender's agent
      const senderAgent = await getOrCreateAgent(senderSlackId, senderName);

      // Check if this is a request for someone else
      const { isRequestForOther, targetUser, cleanedRequest } = await parseRequestTarget(messageText, senderSlackId);

      if (isRequestForOther && targetUser) {
        // This is a request FOR another person
        // Route it to their task queue
        
        const sender = storage.getUserBySlackId(senderSlackId);
        if (!sender) {
          await say("I couldn't identify you. Please try again.");
          return;
        }

        // Create request in the system
        const request = storage.createRequest({
          fromUserId: sender.id,
          fromAgentId: storage.getAgentByUserId(sender.id)?.id || '',
          toUserId: targetUser.id,
          toAgentId: storage.getAgentByUserId(targetUser.id)?.id,
          subject: cleanedRequest.slice(0, 50) + (cleanedRequest.length > 50 ? '...' : ''),
          description: cleanedRequest,
          status: 'pending',
          priority: 'normal',
        });

        // Create task for target user
        storage.createTask({
          userId: targetUser.id,
          requestId: request.id,
          title: `Request from ${senderName}`,
          description: cleanedRequest,
          status: 'pending',
          priority: 'normal',
        });

        // Notify the target user
        if (targetUser.slackId) {
          await client.chat.postMessage({
            channel: targetUser.slackId,
            text: `📥 *New request from ${senderName}:*\n\n${cleanedRequest}\n\n_Reply here to respond, or say "tasks" to see all pending._`,
          });
        }

        await say(`✅ Got it! I've sent your request to *${targetUser.name}*.\n\n> ${cleanedRequest}\n\nI'll let you know when they respond.`);
        
      } else {
        // Regular message - handle with sender's agent
        const response = await senderAgent.handleUserMessage(messageText);
        await say(response);
      }

    } catch (error) {
      console.error('Error handling message:', error);
      await say("Sorry, I encountered an error processing your message. Please try again.");
    }
  });

  // Monitor channel messages for @mentions
  app.event('message', async ({ event, client }) => {
    // Skip DMs (handled above) and bot messages
    if ((event as any).channel_type === 'im') return;
    if ((event as any).bot_id) return;
    if (!('text' in event) || !event.text) return;
    if (!('user' in event) || !event.user) return;

    const messageText = event.text;
    const senderSlackId = event.user;
    const channelId = (event as any).channel;

    // Check for user mentions
    const mentionedUsers = extractMentionedUsers(messageText);
    
    for (const mentionedSlackId of mentionedUsers) {
      // Skip if mentioning themselves or a bot
      if (mentionedSlackId === senderSlackId) continue;

      const mentionedUser = storage.getUserBySlackId(mentionedSlackId);
      if (!mentionedUser) continue;

      // Get sender info
      try {
        const senderInfo = await client.users.info({ user: senderSlackId });
        const senderName = senderInfo.user?.real_name || senderInfo.user?.name || 'Unknown';
        
        let sender = storage.getUserBySlackId(senderSlackId);
        if (!sender) {
          sender = storage.createUser({
            name: senderName,
            slackId: senderSlackId,
          });
        }

        // Get channel name for context
        let channelName = 'a channel';
        try {
          const channelInfo = await client.conversations.info({ channel: channelId });
          channelName = `#${channelInfo.channel?.name || 'channel'}`;
        } catch {}

        // Clean the message (remove mentions)
        const cleanedMessage = messageText.replace(/<@[A-Z0-9]+>/g, '').trim();
        
        // Only create task if there's actual content beyond the mention
        if (cleanedMessage.length < 5) continue;

        // Create a task for the mentioned user
        const request = storage.createRequest({
          fromUserId: sender.id,
          fromAgentId: storage.getAgentByUserId(sender.id)?.id || '',
          toUserId: mentionedUser.id,
          toAgentId: storage.getAgentByUserId(mentionedUser.id)?.id,
          subject: `Mentioned in ${channelName}`,
          description: cleanedMessage,
          context: `From ${channelName}: ${messageText}`,
          status: 'pending',
          priority: 'normal',
        });

        storage.createTask({
          userId: mentionedUser.id,
          requestId: request.id,
          title: `${senderName} mentioned you in ${channelName}`,
          description: cleanedMessage,
          status: 'pending',
          priority: 'normal',
        });

        // Notify the mentioned user via DM
        if (mentionedUser.slackId) {
          await client.chat.postMessage({
            channel: mentionedUser.slackId,
            text: `👋 *${senderName}* mentioned you in ${channelName}:\n\n> ${cleanedMessage}\n\n_Reply here if you'd like me to respond for you, or handle it directly in Slack._`,
          });
        }

      } catch (error) {
        console.error('Error processing mention:', error);
      }
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

  // App home
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
              text: { type: 'mrkdwn', text: `Hi ${userName}! I'm your communication agent.` }
            },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*📥 Incoming Tasks:* ${tasks.length} pending\n${tasks.length > 0 ? tasks.slice(0, 3).map(t => `• ${t.title}`).join('\n') : '_None_'}` }
            },
            {
              type: 'section', 
              text: { type: 'mrkdwn', text: `*📤 Your Requests:* ${requests.length} active\n${requests.length > 0 ? requests.slice(0, 3).map(r => `• ${r.subject}`).join('\n') : '_None_'}` }
            },
            { type: 'divider' },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: '*How to use:*\n• DM me: "I need X from @person"\n• Or just: "I need the Q4 report"\n• Say "tasks" to see your queue' }
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
  console.log('   • DM the bot to interact with your agent');
  console.log('   • @mention someone to route requests');
  console.log('   • Channel mentions create tasks automatically');
  
  return app;
}

// Load organizational context from Slack
async function loadOrgContext(app: App, orgContext: OrgContext, storage: Storage): Promise<void> {
  try {
    const channelResult = await app.client.conversations.list({ types: 'public_channel' });
    orgContext.channels = (channelResult.channels || []).map(c => ({
      id: c.id || '',
      name: c.name || '',
      type: 'public' as const,
      purpose: c.purpose?.value,
    }));

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

// Main entry point
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
