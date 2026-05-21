// ================================================================
// *** DEBUG LOGGING — Trace IDs + Raw Capture + Production/Dev Mode ***
// ================================================================

const buffer = [];
let MAX_ENTRIES = 100;

export function configure(maxEntries) {
  MAX_ENTRIES = maxEntries || 100;
}

export function generateTraceId() {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return 'trace_' + timestamp + '_' + random;
}

export function captureDebugEntry(entry) {
  const debugEntry = {
    traceId: entry.traceId,
    timestamp: new Date().toISOString(),
    topic: entry.topic,
    level: entry.level,
    generationTimeMs: entry.generationTimeMs,
    attempts: entry.attempts || 1,
    success: entry.success !== false,
    rawResponse: entry.rawResponse ? entry.rawResponse.slice(0, 10000) : null,
    preRepairData: entry.preRepairData || null,
    postRepairData: entry.postRepairData || null,
    validationErrors: entry.validationErrors || [],
    layerResults: entry.layerResults || null,
    error: entry.error || null
  };

  buffer.push(debugEntry);

  if (buffer.length > MAX_ENTRIES) {
    buffer.shift();
  }
}

export function getDebugLogs(limit) {
  limit = limit || 50;
  return buffer.slice(-limit);
}

export function getDebugLog(traceId) {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i].traceId === traceId) return buffer[i];
  }
  return null;
}

export function clearDebugLogs() {
  buffer.length = 0;
}

export function getDebugStats() {
  return { size: buffer.length, max: MAX_ENTRIES, enabled: true };
}
