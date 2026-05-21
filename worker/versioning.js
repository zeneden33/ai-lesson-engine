// ================================================================
// *** SCHEMA VERSIONING — Version detection + migration pipeline ***
// ================================================================

export const SCHEMA_VERSION = '1.0.0';
export const SCHEMA_BACK_COMPAT = ['1.0.0'];

const VERSIONS = {
  '1.0.0': {
    introduced: '2026-05-13',
    changes: 'Initial stable schema — 12 sections, 22 exercise types',
    compat: true
  }
};

// ================================================================
// Version detection
// ================================================================

export function detectVersion(lesson) {
  const meta = lesson._meta || lesson.meta || {};
  const version = meta.schemaVersion || meta._schemaVersion || SCHEMA_VERSION;

  if (!VERSIONS[version]) {
    return {
      valid: false,
      version,
      error: `Unknown schema version: ${version}`,
      suggested: SCHEMA_VERSION
    };
  }

  return { valid: true, version };
}

export function isCompatible(lesson) {
  const detected = detectVersion(lesson);
  if (!detected.valid) return { compatible: false, ...detected };

  const isCurrent = detected.version === SCHEMA_VERSION;
  const isBackCompat = SCHEMA_BACK_COMPAT.includes(detected.version);

  return {
    compatible: isCurrent || isBackCompat,
    version: detected.version,
    current: isCurrent
  };
}

// ================================================================
// Inject version into lesson data
// ================================================================

export function injectVersion(lesson) {
  if (!lesson._meta) lesson._meta = {};
  lesson._meta.schemaVersion = SCHEMA_VERSION;
  lesson._meta.schemaCompat = SCHEMA_BACK_COMPAT;
  return lesson;
}

// ================================================================
// Migration: transform older versions to current
// ================================================================

export function migrateToCurrent(lesson) {
  const compat = isCompatible(lesson);
  if (compat.current) return { migrated: false, data: lesson };

  const sourceVersion = compat.version;
  const migrated = JSON.parse(JSON.stringify(lesson));

  const pipeline = [
    // Each migration function transforms one step
    // Future: add v1.0.0 → v1.1.0 migration here
  ];

  for (const migrateFn of pipeline) {
    migrateFn(migrated, sourceVersion);
  }

  injectVersion(migrated);

  return {
    migrated: true,
    fromVersion: sourceVersion,
    toVersion: SCHEMA_VERSION,
    data: migrated
  };
}

// ================================================================
// Schema diff — compare two lessons for structural differences
// ================================================================

export function diffSchema(actual, expected, path = '') {
  const diffs = [];

  const expectedKeys = new Set(Object.keys(expected));
  const actualKeys = new Set(Object.keys(actual));

  for (const key of actualKeys) {
    if (!expectedKeys.has(key) && !key.startsWith('_')) {
      diffs.push({
        type: 'extra',
        path: `${path}.${key}`,
        value: actual[key]
      });
    }
  }

  for (const key of expectedKeys) {
    const fullPath = path ? `${path}.${key}` : key;
    const exp = expected[key];
    const act = actual[key];

    if (act === undefined) {
      diffs.push({ type: 'missing', path: fullPath, expected: typeof exp });
      continue;
    }

    if (Array.isArray(exp) && !Array.isArray(act)) {
      diffs.push({ type: 'type_mismatch', path: fullPath, expected: 'array', got: typeof act });
    } else if (Array.isArray(exp) && Array.isArray(act) && typeof exp[0] === 'object') {
      if (act.length < exp.length) {
        diffs.push({ type: 'too_few', path: fullPath, expected: `≥${exp.length}`, got: act.length });
      }
    }
  }

  return diffs;
}

// ================================================================
// Stats: aggregate versions across multiple lessons
// ================================================================

export function analyzeVersionDistribution(lessons) {
  const distribution = {};
  let unknown = 0;
  let compatible = 0;
  let incompatible = 0;

  for (const lesson of lessons) {
    const detected = detectVersion(lesson);
    const version = detected.valid ? detected.version : 'unknown';

    if (!distribution[version]) distribution[version] = 0;
    distribution[version]++;

    if (!detected.valid) {
      unknown++;
    } else {
      const compat = isCompatible(lesson);
      if (compat.compatible) compatible++;
      else incompatible++;
    }
  }

  return { distribution, compatible, incompatible, unknown, total: lessons.length };
}
