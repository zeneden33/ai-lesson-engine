// ================================================================
// *** GENERATE — Orchestrator. No provider implementation. ***
// *** Delegates to providers/ via registry.                    ***
// ================================================================

import { getProvider, getFallbackProvider } from './providers/registry.js';
import { SYSTEM_TEMPLATE, IMAGE_SYSTEM_TEMPLATE, buildUserPrompt, buildImageUserPrompt, buildRetryPrompt } from './prompt.js';
import { parseAIGeneratedJSON, validateLesson, autoRepair } from './validate.js';
import { AIError, AIResponseError } from './errors.js';
import { captureDebugEntry } from './debug.js';

// ─── Timer helper ───
function elapsed(start) { return Date.now() - start; }

// ─── Rough token estimator (4 chars ≈ 1 token for CJK+English mixed) ───
function estimateTokens(text) {
  if (!text) return 0;
  const words = text.split(/\s+/).length;
  const chars = text.length;
  return Math.ceil(chars / 3);
}

// Log helper with timestamps + tag
function tsLog(msg) {
  console.log('[' + new Date().toISOString().slice(11, 23) + '] ' + msg);
}

// ─── Summarize + deduplicate vision extraction output ───
function summarizeExtractedContent(text) {
  if (!text || text.length <= 3000) return text;
  const lines = text.split('\n');
  const seen = new Set();
  const deduped = [];
  for (const line of lines) {
    const key = line.trim().slice(0, 60).toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(line);
  }
  let result = deduped.join('\n');
  if (result.length > 4000) result = result.slice(0, 4000) + '\n...[summarized]';
  return result;
}

// ─── Check abort signal helper ───
function checkAborted(signal, label) {
  if (signal && signal.aborted) {
    tsLog('[ABORT] ' + label + ' — parent signal aborted');
    throw new AIError('Operation aborted: ' + label);
  }
}

// ─── Extract single-word topic from vision-extracted content ───
function extractImageTopic(text) {
  if (!text) return 'English';
  var stops = ['The','This','That','These','Those','What','When','Where','How','Which','With','From','Your','They','There','Their','For','And','Not','Topic','Title','Unit','Lesson','Page','Header','Label','Image','Photo','Picture','Show','Shows','Has','Have','Can','Will','Get','Use','Put','One','Two','First','Last','Each','Every','Into','Over','Next','Also','More','Than','Then','Just','Like','Very','Much','Many','Some','Such','Most','New','Old','Great'];
  var m = text.match(/\b([A-Z][a-z]{3,12})\b/g);
  if (m) {
    for (var i = 0; i < m.length; i++) {
      if (stops.indexOf(m[i]) === -1) return m[i];
    }
    return m[0];
  }
  return 'English';
}

// ================================================================
// generateLesson — Text-based orchestrator
//
// Three-level retry strategy:
//   Level 1: provider.generateWithRetry() — transient API errors (429, 5xx, timeout)
//   Level 2: JSON parse retry — malformed JSON, feed parse errors back to AI
//   Level 3: Validation retry — structurally valid but incomplete JSON,
//             feed validation errors back to AI for self-correction
//   Fallback: if primary provider fails, tries AI_FALLBACK_PROVIDER
// ================================================================

export async function generateLesson(topic, level, content, config, traceId) {
  const overallStart = Date.now();
  const MAX_TOTAL_MS = config.GENERATE_TOTAL_TIMEOUT_MS || 300000;
  const abortSignal = config.abortSignal || null;
  tsLog('[GEN] ===== generateLesson START ===== topic="' + topic.slice(0, 60) + '..." level=' + level);
  tsLog('[PROFILE] GENERATE_TOTAL_TIMEOUT_MS=' + MAX_TOTAL_MS + 'ms abortSignal=' + (abortSignal ? 'present' : 'none'));

  const systemPrompt = SYSTEM_TEMPLATE;
  const userPrompt = buildUserPrompt(topic, level, content);

  const contentChars = (content || '').length;
  const contentTokens = estimateTokens(content || '');
  const systemTokens = estimateTokens(systemPrompt);
  const userTokens = estimateTokens(userPrompt);
  tsLog('[GEN] Content size: ' + contentChars + ' chars, ~' + contentTokens + ' tokens');
  tsLog('[GEN] System prompt: ~' + systemTokens + ' tokens, User prompt: ~' + userTokens + ' tokens');
  tsLog('[GEN] Total estimated prompt tokens: ~' + (systemTokens + userTokens) + ' tokens');

  // Adaptive timeout: scale with prompt size for predictable bounded generation.
  // Formula: max(baseTimeout, promptTokens * 30ms), capped at 1.5× base.
  // This prevents false timeouts on unusually long prompts without inflating
  // the base timeout for normal-sized requests.
  const totalPromptTokens = systemTokens + userTokens;
  function computeTimeout(baseMs) {
    const scaled = Math.min(totalPromptTokens * 30, Math.floor(baseMs * 1.5));
    return Math.max(baseMs, scaled);
  }

  const prompts = { system: systemPrompt, user: userPrompt };
  const maxRetries = config.MAX_RETRIES || 2;
  const totalAttempts = maxRetries + 1;
  tsLog('[GEN] Max retries=' + maxRetries + ', total attempts=' + totalAttempts);

  let validationErrorsCache = null;
  let phaseTimes = {};

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const attemptStart = Date.now();

    // Check abort + overall timeout before each attempt
    checkAborted(abortSignal, 'generateLesson attempt ' + (attempt + 1));
    if (elapsed(overallStart) > MAX_TOTAL_MS) {
      tsLog('[TIMEOUT] OVERALL TIMEOUT after ' + elapsed(overallStart) + 'ms (limit ' + MAX_TOTAL_MS + 'ms)');
      throw new AIError('Generation timed out after ' + Math.round(elapsed(overallStart) / 1000) + 's');
    }

    tsLog('[GEN] --- Attempt ' + (attempt + 1) + '/' + totalAttempts + ' ---');

    // Inject retry feedback on subsequent attempts (slimmed — Phase 4)
    if (attempt > 0) {
      const feedback = [];
      if (validationErrorsCache) {
        const errorSummary = validationErrorsCache.length <= 5
          ? validationErrorsCache.join('; ')
          : validationErrorsCache.slice(0, 5).join('; ') + ' (and ' + (validationErrorsCache.length - 5) + ' more)';
        feedback.push('Validation errors: ' + errorSummary);
        tsLog('[RETRY] Attempt ' + (attempt + 1) + ': injecting ' + validationErrorsCache.length + ' errors (slimmed)');
      }
      const retryPromptAddition = '\n\n[RETRY ' + attempt + '] Fix:\n' + feedback.join('\n') + '\nOutput ONLY valid JSON.';
      prompts.user = userPrompt + retryPromptAddition;
      tsLog('[GEN] Retry prompt size: user=' + prompts.user.length + ' chars, ~' + estimateTokens(prompts.user) + ' tokens');
    }

    // Try providers in order: primary → fallback
    const providersToTry = [getProvider(config)];
    const fallback = getFallbackProvider(config);
    if (fallback) {
      providersToTry.push(fallback);
      tsLog('[GEN] Fallback provider available: ' + fallback.name);
    }

    let result = null;
    let providerName = '';

    for (const provider of providersToTry) {
      checkAborted(abortSignal, 'provider ' + provider.name + ' attempt ' + (attempt + 1));
      const provStart = Date.now();

      // Time-budget-aware retry: coarse check at orchestrator level.
      // Fine-grained check (per-retry) happens inside generateWithRetry().
      const budgetForCall = MAX_TOTAL_MS - elapsed(overallStart);
      let effectiveTimeout = computeTimeout(config.AI_TIMEOUT_MS || 60000);
      let effectiveApiRetries = config.AI_API_RETRIES;

      if (budgetForCall < effectiveTimeout) {
        // Cannot even complete one full call — floor timeout, no retries
        effectiveTimeout = Math.max(budgetForCall, 30000);
        effectiveApiRetries = 0;
        tsLog('[PROFILE] Budget tight (' + budgetForCall + 'ms < base ' + effectiveTimeout + 'ms) — reduced timeout=' + effectiveTimeout + 'ms, retries=0');
      }

      tsLog('[GEN] Calling provider.generateWithRetry() provider=' + provider.name + ' timeout=' + effectiveTimeout + 'ms apiRetries=' + effectiveApiRetries + ' remainingBudget=' + budgetForCall + 'ms');
      try {
        result = await provider.generateWithRetry(prompts, {
          apiRetries: effectiveApiRetries,
          timeout: effectiveTimeout,
          abortSignal: abortSignal,
          remainingBudget: budgetForCall
        });
        providerName = provider.name;
        const provLatency = result.latency || elapsed(provStart);
        const outChars = (result.text || '').length;
        const outTokens = estimateTokens(result.text || '');
        tsLog('[GEN] Provider returned OK provider=' + provider.name + ' latency=' + provLatency + 'ms output=' + outChars + ' chars ~' + outTokens + ' tok model=' + (result.model || '?'));
        break;
      } catch (err) {
        tsLog('[GEN] Provider FAILED provider=' + provider.name + ' err=' + err.message + ' statusCode=' + (err.statusCode || '?') + ' elapsed=' + elapsed(provStart) + 'ms');
        if (config.DEBUG_MODE) {
          captureDebugEntry({
            traceId: traceId || 'unknown',
            topic, level,
            success: false,
            attempts: attempt + 1,
            error: 'Provider "' + provider.name + '" failed: ' + err.message,
            generationTimeMs: elapsed(overallStart)
          });
        }
      }
    }

    if (!result) {
      tsLog('[GEN] No provider returned a result on attempt ' + (attempt + 1));
      if (attempt >= maxRetries) {
        tsLog('[GEN] All attempts exhausted — throwing AIError');
        throw new AIError('Generation failed: all providers exhausted after ' + (maxRetries + 1) + ' attempts');
      }
      tsLog('[GEN] Continuing to next attempt (no result from any provider)');
      phaseTimes['attempt_' + attempt] = elapsed(attemptStart);
      continue;
    }

    const providerDone = elapsed(attemptStart);
    tsLog('[GEN] Provider phase done in ' + providerDone + 'ms');

    // === Level 2: JSON parse ===
    checkAborted(abortSignal, 'JSON parse attempt ' + (attempt + 1));
    const parseStart = Date.now();
    tsLog('[GEN] Parsing AI JSON response text.length=' + (result.text || '').length + ' chars');
    const parsed = parseAIGeneratedJSON(result.text);
    const parseLatency = elapsed(parseStart);
    tsLog('[GEN] parseAIGeneratedJSON: valid=' + parsed.valid + ' latency=' + parseLatency + 'ms');

    if (!parsed.valid) {
      tsLog('[GEN] JSON PARSE FAILED: ' + parsed.error);
      validationErrorsCache = [parsed.error];
      phaseTimes['attempt_' + attempt] = elapsed(attemptStart);
      tsLog('[GEN] Continuing to next attempt (malformed JSON)');
      continue;
    }

    tsLog('[GEN] JSON parsed OK, top-level keys: ' + Object.keys(parsed.data).join(', '));

    // === Level 3: Structural validation (7 layers) ===
    checkAborted(abortSignal, 'validation attempt ' + (attempt + 1));
    const valStart = Date.now();
    tsLog('[VALIDATION] Starting 7-layer validation...');
    const validation = validateLesson(parsed.data);
    const valLatency = elapsed(valStart);
    tsLog('[VALIDATION] valid=' + validation.valid + ' latency=' + valLatency + 'ms errors=' + validation.errors.length);

    if (!validation.valid) {
      tsLog('[VALIDATION] FAILED — ' + validation.errors.length + ' errors');
      for (let ei = 0; ei < Math.min(validation.errors.length, 10); ei++) {
        tsLog('[VALIDATION]   Error ' + (ei + 1) + ': ' + validation.errors[ei]);
      }
      if (validation.errors.length > 10) {
        tsLog('[VALIDATION]   ... and ' + (validation.errors.length - 10) + ' more errors');
      }

      // Try auto-repair first
      const repairStart = Date.now();
      tsLog('[REPAIR] Attempting auto-repair...');
      const repair = autoRepair(parsed.data);
      tsLog('[REPAIR] ' + repair.repairs.length + ' repairs applied in ' + elapsed(repairStart) + 'ms');
      if (repair.repairs.length > 0) {
        for (let ri = 0; ri < repair.repairs.length; ri++) {
          tsLog('[REPAIR]   ' + repair.repairs[ri]);
        }
      }

      const reValStart = Date.now();
      const reValidation = validateLesson(repair.data);
      tsLog('[VALIDATION] Re-validation after repair: valid=' + reValidation.valid + ' errors=' + reValidation.errors.length + ' latency=' + elapsed(reValStart) + 'ms');

      if (reValidation.valid) {
        tsLog('[REPAIR] Auto-repair SUCCEEDED — using repaired data');
        tsLog('[FINAL_VALIDATE] passed=true repaired=true attempts=' + (attempt + 1) + '/' + totalAttempts + ' totalTime=' + elapsed(overallStart) + 'ms');
        tsLog('[GEN] ===== generateLesson SUCCESS (repaired) in ' + elapsed(overallStart) + 'ms, attempt ' + (attempt + 1) + '/' + totalAttempts + ' =====');
        return {
          success: true,
          data: repair.data,
          raw: result.text,
          attempts: attempt + 1,
          provider: providerName,
          usage: result.usage,
          latency: result.latency,
          model: result.model,
          repaired: true,
          repairs: repair.repairs
        };
      }

      // Auto-repair not enough — feed validation errors back to AI
      validationErrorsCache = reValidation.errors.length > 0 ? reValidation.errors : validation.errors;
      tsLog('[RETRY] Auto-repair NOT enough — ' + validationErrorsCache.length + ' errors remain, will retry');

      if (config.DEBUG_MODE) {
        captureDebugEntry({
          traceId: traceId || 'unknown',
          topic, level,
          success: false,
          attempts: attempt + 1,
          error: 'Validation failed: ' + validationErrorsCache.slice(0, 5).join('; '),
          generationTimeMs: elapsed(overallStart)
        });
      }

      phaseTimes['attempt_' + attempt] = elapsed(attemptStart);
      tsLog('[GEN] Attempt ' + (attempt + 1) + ' total time: ' + elapsed(attemptStart) + 'ms');
      continue;
    }

    // === Success: valid JSON + passes validation ===
    tsLog('[FINAL_VALIDATE] passed=true repaired=false attempts=' + (attempt + 1) + '/' + totalAttempts + ' totalTime=' + elapsed(overallStart) + 'ms');
    tsLog('[GEN] ===== generateLesson SUCCESS in ' + elapsed(overallStart) + 'ms, attempt ' + (attempt + 1) + '/' + totalAttempts + ' =====');
    return {
      success: true,
      data: parsed.data,
      raw: result.text,
      attempts: attempt + 1,
      provider: providerName,
      usage: result.usage,
      latency: result.latency,
      model: result.model,
      repaired: false,
      repairs: []
    };
  }

  // All retries exhausted
  const totalTime = elapsed(overallStart);
  tsLog('[GEN] All ' + totalAttempts + ' attempts exhausted in ' + totalTime + 'ms — throwing AIResponseError');
  if (validationErrorsCache) {
    tsLog('[GEN] Final validation errors (' + validationErrorsCache.length + '):');
    for (let ei = 0; ei < Math.min(validationErrorsCache.length, 15); ei++) {
      tsLog('[GEN]   ' + validationErrorsCache[ei]);
    }
  }
  throw new AIResponseError({
    message: 'AI failed to produce valid lesson after ' + (maxRetries + 1) + ' attempts',
    errors: validationErrorsCache || ['Unknown error']
  });
}

// ================================================================
// generateLessonFromImage — Image-based orchestrator
//
// Uses Qwen VL model (qwen-vl-max) to extract lesson content from
// an uploaded image. Same retry/validation pipeline as text version.
// ================================================================

export async function generateLessonFromImage(imageData, mimeType, level, config, traceId) {
  const overallStart = Date.now();
  const MAX_TOTAL_MS = config.GENERATE_TOTAL_TIMEOUT_MS || 300000;
  const abortSignal = config.abortSignal || null;
  tsLog('[GEN] ===== generateLessonFromImage START =====');
  tsLog('[PROFILE] abortSignal=' + (abortSignal ? 'present' : 'none') + ' IMAGE_TIMEOUT_MS=' + (config.IMAGE_TIMEOUT_MS || 150000) + ' MAX_TOTAL_MS=' + MAX_TOTAL_MS);

  // Step 1: Extract text/description from image using VL model
  const extractPrompt = { system: '', user: 'Extract text, vocabulary, grammar, and exercises from this image. Focus on educationally relevant content. Keep concise.' };
  const provider = getProvider(config);
  let extractedContent = '';

  try {
    checkAborted(abortSignal, 'generateVision extraction');
    tsLog('[GEN] Calling provider.generateVisionWithRetry...');
    const visionStart = Date.now();
    const visionBudget = MAX_TOTAL_MS - elapsed(overallStart);
    const visionResult = await provider.generateVisionWithRetry(extractPrompt, imageData, {
      timeout: config.IMAGE_TIMEOUT_MS || 150000,
      abortSignal: abortSignal,
      apiRetries: config.AI_API_RETRIES || 1,
      remainingBudget: visionBudget
    });
    extractedContent = summarizeExtractedContent(visionResult.text);
    const visionLatency = elapsed(visionStart);
    const rawTokens = estimateTokens(visionResult.text);
    const slimTokens = estimateTokens(extractedContent);
    tsLog('[GEN] generateVision succeeded latency=' + visionLatency + 'ms raw=' + visionResult.text.length + ' chars ~' + rawTokens + ' tok → slimmed=' + extractedContent.length + ' chars ~' + slimTokens + ' tok (saved ' + (rawTokens - slimTokens) + ' tok)');
    if (config.DEBUG_MODE) {
      captureDebugEntry({
        traceId: traceId || 'unknown',
        topic: 'image:' + mimeType, level: level || 'beginner',
        success: true, attempts: 1,
        error: null, generationTimeMs: visionLatency,
        rawResponse: 'Vision extract: ' + extractedContent.slice(0, 500)
      });
    }
  } catch (err) {
    tsLog('[GEN] generateVision FAILED: ' + err.message);
    if (config.DEBUG_MODE) {
      captureDebugEntry({
        traceId: traceId || 'unknown',
        topic: 'image:' + mimeType, level: level || 'beginner',
        success: false, attempts: 1,
        error: 'Vision extraction failed: ' + err.message, generationTimeMs: elapsed(overallStart)
      });
    }
    throw new AIError('Image content extraction failed: ' + err.message);
  }

  // Step 2: Use extracted content as context for text-based generation
  checkAborted(abortSignal, 'text generation phase');
  const topic = extractImageTopic(extractedContent) || 'English';
  tsLog('[GEN] Text generation phase: topic="' + topic + '" extracted=' + extractedContent.length + ' chars');
  tsLog('[GEN] Extracted content preview: ' + extractedContent.slice(0, 300).replace(/\n/g, '\\n'));

  const genStart = Date.now();
  const result = await generateLesson(topic, level, extractedContent, config, traceId);
  const genLatency = elapsed(genStart);
  tsLog('[GEN] Text generation completed in ' + genLatency + 'ms');

  tsLog('[GEN] ===== generateLessonFromImage DONE in ' + elapsed(overallStart) + 'ms =====');
  return result;
}
