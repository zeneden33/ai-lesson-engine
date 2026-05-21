// ================================================================
// *** PROVIDER REGISTRY — Dynamic provider resolution + fallback ***
// ================================================================

import { GeminiProvider } from './gemini.js';
import { GroqProvider } from './groq.js';
import { QwenProvider } from './qwen.js';
import { FreellmProvider } from './freellm.js';

const PROVIDER_MAP = Object.freeze({
  gemini: GeminiProvider,
  groq: GroqProvider,
  qwen: QwenProvider,
  freellm: FreellmProvider
});

export function getProvider(config) {
  const name = (config.AI_PROVIDER || 'gemini').toLowerCase();
  const ProviderClass = PROVIDER_MAP[name];
  if (!ProviderClass) {
    throw new Error('Unknown AI provider: "' + name + '". Available: ' + Object.keys(PROVIDER_MAP).join(', '));
  }
  return new ProviderClass(config);
}

export function getFallbackProvider(config) {
  const name = (config.AI_FALLBACK_PROVIDER || '').toLowerCase();
  if (!name || name === (config.AI_PROVIDER || 'gemini').toLowerCase()) return null;
  const ProviderClass = PROVIDER_MAP[name];
  return ProviderClass ? new ProviderClass(config) : null;
}

export function getProviderNames() {
  return Object.keys(PROVIDER_MAP);
}

export function isProviderSupported(name) {
  return !!PROVIDER_MAP[(name || '').toLowerCase()];
}
