// ================================================================
// *** GEMINI PROVIDER — Google Gemini API integration ***
// ================================================================

import { BaseProvider } from './base.js';

export class GeminiProvider extends BaseProvider {
  get name() { return 'gemini'; }

  buildRequest(prompts, options) {
    const model = options.model || this.config.GEMINI_MODEL || 'gemini-2.0-flash';
    const apiKey = this.config.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY is not configured');

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + apiKey;

    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: this.getSystemPrompt(prompts) + '\n\n=== USER REQUEST ===\n\n' + this.getUserPrompt(prompts) }
          ]
        }
      ],
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: options.maxTokens || 8192,
        candidateCount: 1
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
      ]
    };

    return { url, headers: { 'Content-Type': 'application/json' }, body };
  }

  parseResponse(raw, latency) {
    const candidate = raw.candidates && raw.candidates[0];

    if (!candidate) {
      const reason = raw.promptFeedback ? raw.promptFeedback.blockReason : null;
      throw Object.assign(new Error('Gemini: No candidates' + (reason ? ' (blocked: ' + reason + ')' : '')), { statusCode: 422, retryable: false });
    }

    if (candidate.finishReason && candidate.finishReason !== 'STOP') {
      const retryable = candidate.finishReason !== 'SAFETY' && candidate.finishReason !== 'RECITATION';
      throw Object.assign(new Error('Gemini: Generation stopped early (' + candidate.finishReason + ')'), { statusCode: 422, retryable });
    }

    const text = candidate.content && candidate.content.parts && candidate.content.parts[0] ? candidate.content.parts[0].text : null;
    if (!text) {
      throw Object.assign(new Error('Gemini: Empty response content'), { statusCode: 422, retryable: false });
    }

    return {
      text,
      model: this.config.GEMINI_MODEL || 'gemini-2.0-flash',
      provider: 'gemini',
      latency,
      finishReason: candidate.finishReason || 'STOP',
      usage: this.extractUsage(raw),
      raw
    };
  }

  extractUsage(raw) {
    if (raw.usageMetadata) {
      return {
        promptTokens: raw.usageMetadata.promptTokenCount || 0,
        completionTokens: raw.usageMetadata.candidatesTokenCount || 0,
        totalTokens: raw.usageMetadata.totalTokenCount || 0
      };
    }
    return null;
  }
}
