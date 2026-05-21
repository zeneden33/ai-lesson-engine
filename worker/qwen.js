// ================================================================
// *** QWEN PROVIDER — Alibaba Qwen (DashScope API) integration ***
// ================================================================

import { BaseProvider } from './base.js';

export class QwenProvider extends BaseProvider {
  get name() { return 'qwen'; }

  buildVisionRequest(prompts, imageData, options) {
    const model = options.model || this.config.QWEN_VL_MODEL || 'qwen-vl-max';
    const apiKey = this.config.QWEN_API_KEY;
    if (!apiKey) throw new Error('QWEN_API_KEY is not configured');

    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation';

    const content = [{ image: imageData }];
    const userText = this.getUserPrompt(prompts);
    if (userText) content.push({ text: userText });

    const messages = [{ role: 'user', content: content }];
    const sysPrompt = this.getSystemPrompt(prompts);
    if (sysPrompt) {
      messages.unshift({ role: 'system', content: [{ text: sysPrompt }] });
    }

    const body = {
      model: model,
      input: { messages: messages },
      parameters: {
        temperature: options.temperature ?? 0.2,
        max_tokens: Math.min(options.maxTokens || 8192, 8192),
        top_p: 0.9,
        result_format: 'message'
      }
    };
    if (options.responseFormat !== false) {
      body.parameters.result_format = 'message';
    }

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body
    };
  }

  async generateVision(prompts, imageData, options = {}) {
    const startTime = Date.now();
    const request = this.buildVisionRequest(prompts, imageData, options);
    const timeout = options.timeout || this.config.IMAGE_TIMEOUT_MS || 150000;
    const parentSignal = options.abortSignal || null;
    console.log('[QWV] generateVision start, timeout=' + timeout + 'ms parentSignal=' + (parentSignal ? 'present' : 'none'));

    // Combine per-call timeout with parent abort signal
    const controller = new AbortController();
    const timer = setTimeout(function() { controller.abort(); }, timeout);

    let cleanup = function() {
      clearTimeout(timer);
    };

    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener('abort', function() { controller.abort(); }, { once: true });
      }
    }

    let response;
    try {
      console.log('[QWV] sending fetch to Qwen VL...');
      response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      cleanup();
      console.log('[QWV] fetch returned, status=' + response.status);
    } catch (fetchErr) {
      cleanup();
      console.log('[QWV] fetch error: name=' + fetchErr.name + ' msg=' + fetchErr.message);
      if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
        const fromParent = parentSignal && parentSignal.aborted;
        console.log('[ABORT] Qwen VL aborted=' + (fromParent ? 'parent signal' : 'timeout ' + timeout + 'ms'));
        throw this.normalizeError({ statusCode: 408, message: fromParent ? 'Vision aborted by parent signal' : 'Vision request timed out after ' + timeout + 'ms', provider: this.name });
      }
      throw this.normalizeError({ statusCode: 0, message: fetchErr.message, provider: this.name });
    }

    console.log('[QWV] parsing response JSON...');
    let raw;
    try {
      raw = await response.json();
      console.log('[QWV] JSON parsed OK');
    } catch (_) {
      const text = await response.text().catch(() => '');
      console.log('[QWV] JSON parse failed, text=' + text.slice(0, 200));
      throw this.normalizeError({ statusCode: response.status, body: { raw: text.slice(0, 500) }, provider: this.name });
    }

    const latency = Date.now() - startTime;
    console.log('[QWV] total latency=' + latency + 'ms, response.ok=' + response.ok);

    if (!response.ok) {
      console.log('[QWV] response not OK, status=' + response.status);
      throw this.normalizeError({ statusCode: response.status, body: raw, provider: this.name });
    }

    console.log('[QWV] parsing response...');
    return this.parseResponse(raw, latency);
  }

  /**
   * Vision generation with retry for transient errors (429, 5xx, timeout).
   */
  async generateVisionWithRetry(prompts, imageData, options = {}) {
    const maxRetries = options.apiRetries ?? this.config.AI_API_RETRIES ?? 1;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        console.log('[QRV] generateVision attempt ' + (attempt + 1) + '/' + (maxRetries + 1));
        return await this.generateVision(prompts, imageData, options);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && this.isRetryable(err)) {
          const delay = Math.min(Math.pow(2, attempt) * 1000, 8000);
          console.log('[QRV] retryable error, retrying in ' + delay + 'ms: ' + err.message);
          await this.sleep(delay);
          continue;
        }
        console.log('[QRV] non-retryable or exhausted: ' + err.message);
        throw err;
      }
    }

    throw lastError;
  }

  buildRequest(prompts, options) {
    const model = options.model || this.config.QWEN_MODEL || 'qwen-max';
    const apiKey = this.config.QWEN_API_KEY;
    if (!apiKey) throw new Error('QWEN_API_KEY is not configured');

    const url = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation';

    const messages = [];
    const sysPrompt = this.getSystemPrompt(prompts);
    if (sysPrompt) messages.push({ role: 'system', content: sysPrompt });
    messages.push({ role: 'user', content: this.getUserPrompt(prompts) });

    const body = {
      model: model,
      input: { messages: messages },
      parameters: {
        temperature: options.temperature ?? 0.2,
        max_tokens: Math.min(options.maxTokens || 8192, 8192),
        top_p: 0.9,
        result_format: 'message',
        enable_search: false
      }
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
    const output = raw.output;
    if (!output) {
      throw Object.assign(new Error('Qwen: No output in response'), { statusCode: 422, retryable: false });
    }

    let text = output.text || null;
    if (!text && output.choices && output.choices.length > 0) {
      var msg = output.choices[0].message;
      if (msg) {
        if (typeof msg.content === 'string') {
          text = msg.content;
        } else if (Array.isArray(msg.content)) {
          text = msg.content.map(function(c) { return c.text || ''; }).filter(Boolean).join('\n');
        }
      }
    }

    if (!text) {
      throw Object.assign(new Error('Qwen: Empty response content'), { statusCode: 422, retryable: false });
    }

    return {
      text,
      model: raw.model || this.config.QWEN_MODEL || 'qwen-max',
      provider: 'qwen',
      latency,
      finishReason: output.finish_reason || 'STOP',
      usage: this.extractUsage(raw),
      raw
    };
  }

  extractUsage(raw) {
    if (raw.usage) {
      return {
        promptTokens: raw.usage.input_tokens || raw.usage.prompt_tokens || 0,
        completionTokens: raw.usage.output_tokens || raw.usage.completion_tokens || 0,
        totalTokens: raw.usage.total_tokens || 0
      };
    }
    return null;
  }
}
