// ================================================================
// *** RELIABILITY METRICS — Generation success/failure tracking ***
// ================================================================

const metrics = {
  totalAttempts: 0,
  totalGenerations: 0,
  successes: 0,
  failures: {
    validation: 0,
    ai_error: 0,
    timeout: 0,
    other: 0
  },
  retries: 0,
  totalRetriesUsed: 0,
  validationLayerFailures: {},
  generationTimes: [],
  byTopic: new Map()
};

const MAX_HISTORY = 1000;

export function recordAttempt() {
  metrics.totalAttempts++;
}

export function recordGeneration(timeMs) {
  metrics.totalGenerations++;
  metrics.generationTimes.push(timeMs);
  if (metrics.generationTimes.length > MAX_HISTORY) {
    metrics.generationTimes.shift();
  }
}

export function recordSuccess(topic, attempts, timeMs) {
  metrics.successes++;
  recordTopic(topic, 'success');
  if (attempts > 1) {
    metrics.totalRetriesUsed += (attempts - 1);
  }
}

export function recordFailure(type, detail = '') {
  if (metrics.failures[type] !== undefined) {
    metrics.failures[type]++;
  } else {
    metrics.failures.other++;
  }
}

export function recordRetry() {
  metrics.retries++;
}

export function recordValidationLayerFailure(layer) {
  if (!metrics.validationLayerFailures[layer]) {
    metrics.validationLayerFailures[layer] = 0;
  }
  metrics.validationLayerFailures[layer]++;
}

function recordTopic(topic, status) {
  const key = topic.slice(0, 30);
  if (!metrics.byTopic.has(key)) {
    metrics.byTopic.set(key, { total: 0, success: 0, fail: 0 });
  }
  const entry = metrics.byTopic.get(key);
  entry.total++;
  if (status === 'success') entry.success++;
  else entry.fail++;
}

// ================================================================
// Summary
// ================================================================

export function getMetricsSummary(resetAfterRead = false) {
  const totalFailures = Object.values(metrics.failures).reduce((a, b) => a + b, 0);
  const total = metrics.successes + totalFailures;
  const avgTime = metrics.generationTimes.length > 0
    ? metrics.generationTimes.reduce((a, b) => a + b, 0) / metrics.generationTimes.length
    : 0;

  // Top failing topics
  const failingTopics = [...metrics.byTopic.entries()]
    .filter(([, v]) => v.fail > 0)
    .sort((a, b) => b[1].fail - a[1].fail)
    .slice(0, 5)
    .map(([topic, stats]) => ({ topic, ...stats }));

  const summary = {
    totalGenerations: metrics.totalGenerations,
    successful: metrics.successes,
    failed: totalFailures,
    successRate: total > 0 ? (metrics.successes / total * 100).toFixed(1) + '%' : 'N/A',
    retriesUsed: metrics.totalRetriesUsed,
    averageRetriesPerGeneration: metrics.totalGenerations > 0
      ? (metrics.totalRetriesUsed / metrics.totalGenerations).toFixed(2)
      : '0',
    failureBreakdown: { ...metrics.failures },
    validationLayerFailures: { ...metrics.validationLayerFailures },
    averageGenerationTimeMs: Math.round(avgTime),
    fastestGenerationMs: metrics.generationTimes.length > 0
      ? Math.min(...metrics.generationTimes) : null,
    slowestGenerationMs: metrics.generationTimes.length > 0
      ? Math.max(...metrics.generationTimes) : null,
    topFailingTopics: failingTopics.length > 0 ? failingTopics : 'none'
  };

  if (resetAfterRead) resetMetrics();
  return summary;
}

export function resetMetrics() {
  metrics.totalAttempts = 0;
  metrics.totalGenerations = 0;
  metrics.successes = 0;
  metrics.failures = { validation: 0, ai_error: 0, timeout: 0, other: 0 };
  metrics.retries = 0;
  metrics.totalRetriesUsed = 0;
  metrics.validationLayerFailures = {};
  metrics.generationTimes = [];
  metrics.byTopic.clear();
}
