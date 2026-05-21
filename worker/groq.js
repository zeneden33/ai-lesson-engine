// ================================================================
// *** GROQ PROVIDER — Groq (OpenAI-compatible API) integration ***
// ================================================================

import { BaseProvider } from './base.js';

export class GroqProvider extends BaseProvider {
  get name() { return 'groq'; }

  buildRequest(prompts, options) {
    const model = options.model || this.config.GROQ_MODEL || 'mixtral-8x7b-32768';
    const apiKey = this.config.GROQ_API_KEY;
    if (!apiKey) throw new Error('GROQ_API_KEY is not configured');

    const url = 'https://api.groq.com/openai/v1/chat/completions';

    const messages = [];
    const sysPrompt = this.getSystemPrompt(prompts);
    if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
    messages.push({ role: 'user', content: this.getUserPrompt(prompts) });

    const body = {
      model: model,
      messages: messages,
      temperature: options.temperature ?? 0.3,
      max_tokens: options.maxTokens || 8192,
      top_p: 0.95
    };

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body
    };
  }

  parseResponse(raw, latency) {
    if (!raw.choices || raw.choices.length === 0) {
      throw Object.assign(new Error('Groq: No choices returned'), { statusCode: 422, retryable: false });
    }

    const choice = raw.choices[0];
    const text = choice.message ? choice.message.content : null;

    if (!text) {
      throw Object.assign(new Error('Groq: Empty response content'), { statusCode: 422, retryable: false });
    }

    return {
      text,
      model: raw.model || this.config.GROQ_MODEL || 'mixtral-8x7b-32768',
      provider: 'groq',
      latency,
      finishReason: choice.finish_reason || 'STOP',
      usage: this.extractUsage(raw),
      raw
    };
  }

  extractUsage(raw) {
    if (raw.usage) {
      return {
        promptTokens: raw.usage.prompt_tokens || 0,
        completionTokens: raw.usage.completion_tokens || 0,
        totalTokens: raw.usage.total_tokens || 0
      };
    }
    return null;
  }
}
