// ================================================================
// *** BASE PROVIDER — Abstract interface for all AI providers ***
// ================================================================

export class BaseProvider {
  constructor(config) {
    this.config = config;
  }

  /**
   * Single generation attempt — one API call.
   * Returns UnifiedResponse or throws on error.
   */
  async generate(prompts, options = {}) {
    const startTime = Date.now();
    const request = this.buildRequest(prompts, options);
    const timeout = options.timeout || this.config.AI_TIMEOUT_MS || 60000;
    const parentSignal = options.abortSignal || null;

    // Combine per-call timeout with parent abort signal using manual AbortController
    const controller = new AbortController();
    const timeoutTimer = setTimeout(function () { controller.abort(); }, timeout);

    let cleanup = function () {
      clearTimeout(timeoutTimer);
    };

    if (parentSignal) {
      if (parentSignal.aborted) {
        controller.abort();
      } else {
        parentSignal.addEventListener('abort', function () { controller.abort(); }, { once: true });
      }
    }

    let response;
    try {
      response = await fetch(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(request.body),
        signal: controller.signal
      });
      cleanup();
    } catch (fetchErr) {
      cleanup();
      if (fetchErr.name === 'TimeoutError' || fetchErr.name === 'AbortError') {
        const fromParent = parentSignal && parentSignal.aborted;
        console.log('[ABORT] provider=' + this.name + ' aborted=' + (fromParent ? 'parent signal' : 'timeout ' + timeout + 'ms'));
        throw this.normalizeError({ statusCode: 408, message: fromParent ? 'Aborted by parent signal' : 'Request timed out after ' + timeout + 'ms', provider: this.name });
      }
      throw this.normalizeError({ statusCode: 0, message: fetchErr.message, provider: this.name });
    }

    let raw;
    try {
      raw = await response.json();
    } catch (_) {
      const text = await response.text().catch(() => '');
      throw this.normalizeError({ statusCode: response.status, body: { raw: text.slice(0, 500) }, provider: this.name });
    }

    const latency = Date.now() - startTime;

    if (!response.ok) {
      throw this.normalizeError({ statusCode: response.status, body: raw, provider: this.name });
    }

    return this.parseResponse(raw, latency);
  }

  /**
   * Generation with retry for transient API errors only.
   * Retries: 429 (rate limit), 5xx (server errors), timeouts (408, 0).
   * Does NOT retry JSON parsing failures — those are handled by the orchestrator.
   *
   * Time-budget-aware: uses remainingBudget from options to avoid
   * starting a retry that cannot complete before the hard deadline.
   */
  async generateWithRetry(prompts, options = {}) {
    const maxRetries = options.apiRetries ?? this.config.AI_API_RETRIES ?? 1;
    const baseTimeout = options.timeout || this.config.AI_TIMEOUT_MS || 60000;
    const remainingBudget = options.remainingBudget ?? Infinity;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const callOptions = { ...options };
        if (attempt > 0) {
          callOptions.timeout = this._retryTimeout(baseTimeout, remainingBudget);
        }
        return await this.generate(prompts, callOptions);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && this.isRetryable(err)) {
          const delay = this._retryDelay(attempt, remainingBudget);
          const estimatedCost = delay + this._retryTimeout(baseTimeout, remainingBudget);
          const willRetry = remainingBudget >= estimatedCost;

          console.log('[RETRY_DECISION] remainingBudget=' + remainingBudget +
            'ms retryDelay=' + delay +
            'ms willRetry=' + willRetry +
            ' errorType=' + (err.statusCode || 'unknown') +
            ' provider=' + this.name +
            ' attempt=' + (attempt + 1) + '/' + (maxRetries + 1));

          if (!willRetry) {
            console.log('[RETRY_DECISION] Budget too low — rethrowing last error');
            throw err;
          }

          await this.sleep(delay);
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Compute retry timeout: use at most the base timeout, but never
   * exceed 60% of remaining budget so there is room for backoff delay.
   * Floored at 30s to give the retry a fair chance.
   */
  _retryTimeout(baseTimeout, remainingBudget) {
    const budgetCap = Math.floor(remainingBudget * 0.6);
    return Math.min(baseTimeout, Math.max(budgetCap, 30000));
  }

  /**
   * Exponential backoff capped at 8s, also limited by 15 % of remaining budget.
   */
  _retryDelay(attempt, remainingBudget) {
    const baseDelay = Math.min(Math.pow(2, attempt) * 1000, 8000);
    return Math.min(baseDelay, Math.floor(remainingBudget * 0.15));
  }

  /**
   * Vision generation with retry — default implementation.
   * Providers that support vision (e.g. Qwen VL) SHOULD override
   * generateVision() and may override this for custom retry logic.
   */
  async generateVisionWithRetry(prompts, imageData, options = {}) {
    const maxRetries = options.apiRetries ?? this.config.AI_API_RETRIES ?? 1;
    const baseTimeout = options.timeout || this.config.IMAGE_TIMEOUT_MS || 150000;
    const remainingBudget = options.remainingBudget ?? Infinity;
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const callOptions = { ...options };
        if (attempt > 0) {
          callOptions.timeout = this._retryTimeout(baseTimeout, remainingBudget);
        }
        return await this.generateVision(prompts, imageData, callOptions);
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries && this.isRetryable(err)) {
          const delay = this._retryDelay(attempt, remainingBudget);
          const estimatedCost = delay + this._retryTimeout(baseTimeout, remainingBudget);
          const willRetry = remainingBudget >= estimatedCost;

          console.log('[RETRY_DECISION][VISION] remainingBudget=' + remainingBudget +
            'ms retryDelay=' + delay +
            'ms willRetry=' + willRetry +
            ' errorType=' + (err.statusCode || 'unknown') +
            ' provider=' + this.name +
            ' attempt=' + (attempt + 1) + '/' + (maxRetries + 1));

          if (!willRetry) throw err;

          await this.sleep(delay);
          continue;
        }
        throw err;
      }
    }

    throw lastError;
  }

  /**
   * Vision generation — single attempt. Providers with vision support
   * MUST override this.
   */
  async generateVision(prompts, imageData, options = {}) {
    throw new Error(this.name + ': generateVision() not implemented');
  }

  // ─── Abstract methods (must override) ───

  buildRequest(prompts, options) {
    throw new Error(this.name + ': buildRequest() not implemented');
  }

  parseResponse(raw, latency) {
    throw new Error(this.name + ': parseResponse() not implemented');
  }

  // ─── Optional overrides ───

  extractUsage(raw) {
    return null;
  }

  isRetryable(err) {
    const code = err.statusCode || 0;
    return code === 429 || code >= 500 || code === 0 || code === 408;
  }

  normalizeError(err) {
    let msg = err.message;
    if (!msg && err.body) {
      if (typeof err.body === 'object') {
        msg = err.body.message || err.body.error?.message || JSON.stringify(err.body).slice(0, 200);
      } else {
        msg = String(err.body).slice(0, 200);
      }
    }
    const e = new Error(msg || (this.name + ': Unknown error'));
    e.statusCode = err.statusCode || 0;
    e.retryable = this.isRetryable(err);
    e.provider = this.name;
    return e;
  }

  // ─── Helpers ───

  get name() {
    return 'unknown';
  }

  sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  getSystemPrompt(prompts) {
    return (prompts && prompts.system) || '';
  }

  getUserPrompt(prompts) {
    return (prompts && prompts.user) || '';
  }
}
