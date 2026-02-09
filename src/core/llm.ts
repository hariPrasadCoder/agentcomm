/**
 * LLM Integration - Unified interface for OpenAI/Anthropic
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { LLMConfig, LLMMessage, LLMResponse } from './types.js';

export class LLMClient {
  private config: LLMConfig;
  private anthropic?: Anthropic;
  private openai?: OpenAI;

  constructor(config: LLMConfig) {
    this.config = config;
    
    if (config.provider === 'anthropic') {
      this.anthropic = new Anthropic({ apiKey: config.apiKey });
    } else if (config.provider === 'openai') {
      this.openai = new OpenAI({ 
        apiKey: config.apiKey,
        baseURL: config.baseUrl 
      });
    }
  }

  async chat(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    if (this.config.provider === 'anthropic') {
      return this.chatAnthropic(messages, systemPrompt);
    } else if (this.config.provider === 'openai') {
      return this.chatOpenAI(messages, systemPrompt);
    }
    throw new Error(`Unsupported provider: ${this.config.provider}`);
  }

  private async chatAnthropic(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    if (!this.anthropic) throw new Error('Anthropic client not initialized');

    const anthropicMessages = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));

    const response = await this.anthropic.messages.create({
      model: this.config.model,
      max_tokens: 4096,
      system: systemPrompt || messages.find(m => m.role === 'system')?.content,
      messages: anthropicMessages,
    });

    const textContent = response.content.find(c => c.type === 'text');
    
    return {
      content: textContent?.text || '',
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async chatOpenAI(messages: LLMMessage[], systemPrompt?: string): Promise<LLMResponse> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const openaiMessages = systemPrompt 
      ? [{ role: 'system' as const, content: systemPrompt }, ...messages]
      : messages;

    const response = await this.openai.chat.completions.create({
      model: this.config.model,
      messages: openaiMessages.map(m => ({
        role: m.role,
        content: m.content,
      })),
    });

    return {
      content: response.choices[0]?.message?.content || '',
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
      } : undefined,
    };
  }
}

// System prompts for different agent tasks
export const SYSTEM_PROMPTS = {
  router: `You are a communication routing agent. Your job is to determine WHO should handle a request based on the organizational context provided.

Given a user's request and organizational context (teams, expertise, routing rules), determine:
1. Which team or person is best suited to answer this
2. Why they're the right choice
3. How to formulate a clear, actionable ask

Always respond in JSON format:
{
  "targetUserId": "string or null",
  "targetTeam": "string or null", 
  "confidence": 0.0-1.0,
  "reasoning": "why this target",
  "formattedRequest": "clear, actionable version of the ask"
}`,

  responder: `You are a helpful communication agent. You help users by:
1. Understanding their requests
2. Routing them to the right people
3. Tracking and following up
4. Summarizing responses

Be concise, professional, and proactive. If you don't know something, say so.
Never make up information - always verify or ask for clarification.`,

  summarizer: `You are a summarization agent. Given a conversation or set of messages, extract:
1. Key decisions made
2. Action items and owners
3. Important information that should be remembered
4. Unresolved questions

Format as structured JSON for storage.`,

  followUp: `You are composing a follow-up message. Be polite but clear about what's needed.
Include:
- Original request context (brief)
- What's still needed
- Any deadline if applicable

Keep it short and actionable.`,
};
