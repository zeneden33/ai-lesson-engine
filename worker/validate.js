// ================================================================
// *** VALIDATION LAYER — 7 مستويات للتحقق من البيانات ***
// ================================================================

// L1: INPUT VALIDATION — فحص ما يرسله المستخدم
export function validateGenerateInput(body, config) {
  const errors = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body is required'] };
  }

  const topic = body.topic;

  if (!topic || typeof topic !== 'string') {
    errors.push({ field: 'topic', message: 'Topic is required and must be a string' });
    return { valid: false, errors };
  }

  const trimmed = topic.trim();

  if (trimmed.length === 0) {
    errors.push({ field: 'topic', message: 'Topic cannot be empty' });
  }
  if (trimmed.length < config.MIN_TOPIC_LENGTH) {
    errors.push({ field: 'topic', message: `Topic must be at least ${config.MIN_TOPIC_LENGTH} characters` });
  }
  if (trimmed.length > config.MAX_TOPIC_LENGTH) {
    errors.push({ field: 'topic', message: `Topic must be at most ${config.MAX_TOPIC_LENGTH} characters` });
  }

  if (/<[^>]*>/i.test(trimmed)) {
    errors.push({ field: 'topic', message: 'Topic cannot contain HTML tags' });
  }

  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(trimmed)) {
    errors.push({ field: 'topic', message: 'Topic contains invalid control characters' });
  }

  const validLevels = ['beginner', 'intermediate', 'advanced'];
  if (body.level && !validLevels.includes(body.level)) {
    errors.push({ field: 'level', message: `Level must be one of: ${validLevels.join(', ')}` });
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    sanitized: {
      topic: trimmed,
      level: body.level || 'beginner',
      content: typeof body.content === 'string' ? body.content.trim().slice(0, 2000) : ''
    }
  };
}


// L2: JSON PARSE — تحويل رد AI من نص إلى JSON
export function parseAIGeneratedJSON(text) {
  if (!text || typeof text !== 'string') {
    return { valid: false, error: 'Empty response from AI' };
  }

  let clean = text.trim();

  const jsonStart = clean.indexOf('{');
  const jsonEnd = clean.lastIndexOf('}');

  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
    return { valid: false, error: 'No JSON object found in AI response' };
  }

  clean = clean.slice(jsonStart, jsonEnd + 1).trim();

  try {
    const data = JSON.parse(clean);
    return { valid: true, data };
  } catch (err) {
    return { valid: false, error: `Invalid JSON: ${err.message}` };
  }
}


// L3: STRUCTURAL — هل كل المفاتيح الأساسية موجودة؟
const REQUIRED_TOP_KEYS = [
  'meta', 'hook', 'thinking', 'vocab', 'dialogue',
  'dialogueScenes', 'explain', 'grammarMeta', 'grammar',
  'exercisesMeta', 'exercises', 'smartFeedback'
];

export function validateStructure(json) {
  const errors = [];
  for (const key of REQUIRED_TOP_KEYS) {
    if (!(key in json)) {
      errors.push(`Missing top-level key: "${key}"`);
    }
  }

  const extraKeys = [];
  const allowedKeys = new Set(REQUIRED_TOP_KEYS);
  for (const key of Object.keys(json)) {
    if (!allowedKeys.has(key) && !key.startsWith('_')) {
      extraKeys.push(key);
    }
  }

  return { valid: errors.length === 0, errors: [...errors, ...(extraKeys.length > 0 ? [`Unknown keys: ${extraKeys.join(', ')}`] : [])] };
}


// L4: TYPE CONSTRAINTS — هل كل قيمة من النوع الصحيح؟
const TYPE_RULES = {
  'meta': 'object',
  'hook': 'object',
  'thinking': 'array',
  'vocab': 'array',
  'dialogue': 'array',
  'dialogueScenes': 'array',
  'explain': 'array',
  'grammarMeta': 'object',
  'grammar': 'array',
  'exercisesMeta': 'object',
  'exercises': 'object',
  'smartFeedback': 'object'
};

export function validateTypes(json) {
  const errors = [];
  for (const [key, expected] of Object.entries(TYPE_RULES)) {
    const val = json[key];
    if (val === undefined) continue;
    const actual = Array.isArray(val) ? 'array' : typeof val;
    if (actual !== expected) {
      errors.push(`"${key}": expected ${expected}, got ${actual}`);
    }
  }
  return { valid: errors.length === 0, errors };
}


// L5: BUSINESS RULES — قوانين العمل الخاصة بالمشروع
export function validateBusinessRules(json) {
  const errors = [];
  const addError = (msg) => errors.push(msg);

  // meta
  if (json.meta?.pageTitle && !json.meta.pageTitle.includes('|')) {
    addError('meta.pageTitle must contain "|" separator');
  }

  // hook
  if (json.hook?.compare?.length !== 2) {
    addError(`hook.compare: expected exactly 2 items, got ${json.hook?.compare?.length}`);
  }

  // thinking
  if (json.thinking) {
    const len = json.thinking.length;
    if (len < 3 || len > 5) addError(`thinking: expected 3-5 items, got ${len}`);
  }

  // vocab
  if (json.vocab) {
    const len = json.vocab.length;
    if (len < 15 || len > 35) addError(`vocab: expected 15-35 items, got ${len}`);

    const emojiMap = new Map();
    for (let i = 0; i < json.vocab.length; i++) {
      const emoji = json.vocab[i].emoji;
      if (emojiMap.has(emoji)) {
        addError(`vocab[${emojiMap.get(emoji)}] and vocab[${i}]: duplicate emoji "${emoji}"`);
      } else {
        emojiMap.set(emoji, i);
      }
    }
  }

  // dialogue
  if (json.dialogue) {
    const len = json.dialogue.length;
    if (len < 6 || len > 12) addError(`dialogue: expected 6-12 lines, got ${len}`);
  }

  // dialogueScenes
  if (json.dialogueScenes?.length !== 2) {
    addError(`dialogueScenes: expected exactly 2 scenes, got ${json.dialogueScenes?.length}`);
  }

  // explain
  if (json.explain) {
    const len = json.explain.length;
    if (len < 4 || len > 6) addError(`explain: expected 4-6 items, got ${len}`);
  }

  // grammar
  if (json.grammar) {
    if (json.grammar.length < 2) addError(`grammar: expected at least 2 items, got ${json.grammar.length}`);
    const hasPattern = json.grammar.some(g => g.type === 'pattern');
    const hasConjugation = json.grammar.some(g => g.type === 'conjugation');
    if (!hasPattern) addError('grammar: must include at least one pattern');
    if (!hasConjugation) addError('grammar: must include at least one conjugation');
  }

  // exercises
  if (json.exercises) {
    const ex = json.exercises;

    if (ex.mcq?.length !== 3) addError(`exercises.mcq: expected 3 questions, got ${ex.mcq?.length}`);
    for (let i = 0; i < (ex.mcq || []).length; i++) {
      if (ex.mcq[i].options?.length !== 4) addError(`exercises.mcq[${i}].options: expected 4, got ${ex.mcq[i].options?.length}`);
      if (typeof ex.mcq[i].correct !== 'number' || ex.mcq[i].correct < 0 || ex.mcq[i].correct > 3) {
        addError(`exercises.mcq[${i}].correct: must be integer 0-3`);
      }
    }

    const tf = ex.trueFalse || [];
    if (tf.length < 4 || tf.length > 6) addError(`exercises.trueFalse: expected 4-6 items, got ${tf.length}`);

    if (ex.fillBlanks?.length !== 3) addError(`exercises.fillBlanks: expected 3 items, got ${ex.fillBlanks?.length}`);

    const dw = ex.dragWords || [];
    if (dw.length < 4 || dw.length > 8) addError(`exercises.dragWords: expected 4-8 items, got ${dw.length}`);

    if (ex.dragZones?.length !== 2) addError(`exercises.dragZones: expected exactly 2 zones`);

    if (ex.correctError?.options?.length !== 4) {
      addError(`exercises.correctError.options: expected 4 options`);
    }
    if (ex.correctError?.options) {
      const correctCount = ex.correctError.options.filter(o => o.correct === true).length;
      if (correctCount !== 1) addError(`exercises.correctError: expected exactly 1 correct option, got ${correctCount}`);
    }

    if (ex.listeningExercise?.options?.length !== 3) {
      addError(`exercises.listeningExercise.options: expected 3 options, got ${ex.listeningExercise?.options?.length}`);
    }

    if (ex.selectWords) {
      const correctKeys = ex.selectWords.title_en && ex.selectWords.title_zh;
      if (!correctKeys) addError('exercises.selectWords: missing title_en or title_zh');
    }
  }

  // smartFeedback
  if (json.smartFeedback) {
    const keys = Object.keys(json.smartFeedback);
    if (keys.length < 3) addError(`smartFeedback: expected at least 3 keys, got ${keys.length}`);
    if (keys.length > 5) addError(`smartFeedback: expected at most 5 keys, got ${keys.length}`);
  }

  return { valid: errors.length === 0, errors };
}


// L6: SEMANTIC RULES — علاقات بين الحقول
export function validateSemanticRules(json) {
  const errors = [];

  if (json.exercises) {
    const ex = json.exercises;

    // dragZones.accept == dragWords.cat
    if (Array.isArray(ex.dragWords) && ex.dragZones && ex.dragZones.length > 0) {
      const wordCats = new Set(ex.dragWords.map(w => w.cat));
      const zoneAccepts = new Set(ex.dragZones.map(z => z.accept));

      const missing = [...wordCats].filter(c => !zoneAccepts.has(c));
      if (missing.length > 0) {
        errors.push(`dragZones missing categories: ${missing.join(', ')}`);
      }

      const extra = [...zoneAccepts].filter(a => !wordCats.has(a));
      if (extra.length > 0) {
        errors.push(`dragZones has unused categories: ${extra.join(', ')}`);
      }
    }

    // listeningExercise.text must match exactly one option
    if (ex.listeningExercise?.text && ex.listeningExercise?.options) {
      const match = ex.listeningExercise.options.find(o => o.en === ex.listeningExercise.text);
      if (!match) {
        errors.push('listeningExercise.text must match one of options[].en verbatim');
      }
    }

    // selectWords: first 4 vocab are correct, next 4 are wrong (implicit constraint)
    if (json.vocab && json.vocab.length >= 8) {
      // فقط تأكيد إن في vocab كافي — الـ Viewer يستخدم أول 4 صح، الـ 4 التالية خطأ
    }
  }

  return { valid: errors.length === 0, errors };
}


// L7: SAFETY — أمان المحتوى
export function validateSafety(json) {
  const errors = [];
  const MAX_BYTES = 512000;

  const textSegments = [];

  function collectStrings(obj) {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      textSegments.push(obj);
    } else if (Array.isArray(obj)) {
      for (const item of obj) collectStrings(item);
    } else if (typeof obj === 'object') {
      for (const val of Object.values(obj)) collectStrings(val);
    }
  }

  collectStrings(json);

  for (let i = 0; i < textSegments.length; i++) {
    const str = textSegments[i];

    if (/<script[\s>/]/i.test(str)) {
      errors.push('Content contains prohibited <script> tags');
      break;
    }

    if (str.includes('__proto__') || str.includes('constructor.prototype')) {
      errors.push('Content contains prototype pollution');
      break;
    }

    if (/javascript\s*:/i.test(str)) {
      errors.push('Content contains javascript: URI scheme');
      break;
    }

    if (/on\w+\s*=/i.test(str) && /['"].*['"]/.test(str)) {
      errors.push('Content contains inline event handlers');
      break;
    }
  }

  const encoder = new TextEncoder();
  const totalBytes = encoder.encode(JSON.stringify(json)).length;
  if (totalBytes > MAX_BYTES) {
    errors.push(`Response too large: ${(totalBytes / 1024).toFixed(1)}KB (max ${MAX_BYTES / 1024}KB)`);
  }

  return { valid: errors.length === 0, errors };
}


// MASTER VALIDATOR — تشغيل كل الطبقات ما عدا L1 و L2
export function validateLesson(json) {
  const layers = [
    { name: 'L3-Structure', fn: validateStructure },
    { name: 'L4-Types', fn: validateTypes },
    { name: 'L5-BusinessRules', fn: validateBusinessRules },
    { name: 'L6-SemanticRules', fn: validateSemanticRules },
    { name: 'L7-Safety', fn: validateSafety }
  ];

  const allErrors = [];
  const layerResults = {};

  for (const layer of layers) {
    const result = layer.fn(json);
    layerResults[layer.name] = result;
    if (!result.valid) {
      for (const err of result.errors) {
        allErrors.push(`[${layer.name}] ${err}`);
      }
    }
  }

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    layerResults
  };
}

// VALIDATION METRICS — تحليل إحصاءات الـ validation
export function validationMetrics(results) {
  const total = results.length;
  let passed = 0;
  let failed = 0;
  const layerFailures = {};
  const errorPatterns = {};

  for (const r of results) {
    if (r.valid) { passed++; continue; }
    failed++;

    if (r.layerResults) {
      for (const [layer, lr] of Object.entries(r.layerResults)) {
        if (!lr.valid) {
          if (!layerFailures[layer]) layerFailures[layer] = 0;
          layerFailures[layer]++;
          if (lr.errors) {
            for (const err of lr.errors) {
              const pattern = err.replace(/".*?"/g, '"..."').replace(/\d+/g, 'N');
              if (!errorPatterns[pattern]) errorPatterns[pattern] = 0;
              errorPatterns[pattern]++;
            }
          }
        }
      }
    }
  }

  return {
    total, passed, failed,
    passRate: total > 0 ? (passed / total * 100).toFixed(1) + '%' : '0%',
    layerFailures,
    topErrorPatterns: Object.entries(errorPatterns)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([pattern, count]) => ({ pattern, count }))
  };
}

// ─── Filler vocab pool for auto-fill ───
const FILLER_VOCAB = [
  { en: 'understand', zh: '理解', emoji: '🧠', type: 'Verb · 动词' },
  { en: 'important', zh: '重要', emoji: '⭐', type: 'Adjective · 形容词' },
  { en: 'practice', zh: '练习', emoji: '✏️', type: 'Verb · 动词' },
  { en: 'meaning', zh: '意思', emoji: '📖', type: 'Noun · 名词' },
  { en: 'sentence', zh: '句子', emoji: '📝', type: 'Noun · 名词' },
  { en: 'question', zh: '问题', emoji: '❓', type: 'Noun · 名词' },
  { en: 'answer', zh: '答案', emoji: '✅', type: 'Noun · 名词' },
  { en: 'listen', zh: '听', emoji: '👂', type: 'Verb · 动词' },
  { en: 'speak', zh: '说', emoji: '🗣️', type: 'Verb · 动词' },
  { en: 'read', zh: '读', emoji: '📚', type: 'Verb · 动词' },
  { en: 'write', zh: '写', emoji: '✍️', type: 'Verb · 动词' },
  { en: 'correct', zh: '正确', emoji: '✔️', type: 'Adjective · 形容词' },
  { en: 'lesson', zh: '课程', emoji: '📘', type: 'Noun · 名词' },
  { en: 'example', zh: '例子', emoji: '🔍', type: 'Noun · 名词' },
  { en: 'word', zh: '单词', emoji: '🔤', type: 'Noun · 名词' },
  { en: 'phrase', zh: '短语', emoji: '💬', type: 'Noun · 名词' },
  { en: 'grammar', zh: '语法', emoji: '📐', type: 'Noun · 名词' },
  { en: 'dialogue', zh: '对话', emoji: '🎭', type: 'Noun · 名词' },
  { en: 'exercise', zh: '练习', emoji: '🏋️', type: 'Noun · 名词' },
  { en: 'translate', zh: '翻译', emoji: '🔄', type: 'Verb · 动词' },
  { en: 'remember', zh: '记住', emoji: '💡', type: 'Verb · 动词' },
  { en: 'helpful', zh: '有帮助', emoji: '🤝', type: 'Adjective · 形容词' },
  { en: 'conversation', zh: '会话', emoji: '🗨️', type: 'Noun · 名词' },
  { en: 'pronounce', zh: '发音', emoji: '🔊', type: 'Verb · 动词' },
  { en: 'vocabulary', zh: '词汇', emoji: '📕', type: 'Noun · 名词' },
  { en: 'carefully', zh: '仔细地', emoji: '🎯', type: 'Adverb · 副词' },
  { en: 'together', zh: '一起', emoji: '👥', type: 'Adverb · 副词' },
  { en: 'mistake', zh: '错误', emoji: '⚠️', type: 'Noun · 名词' },
  { en: 'improve', zh: '提高', emoji: '📈', type: 'Verb · 动词' },
  { en: 'review', zh: '复习', emoji: '🔄', type: 'Verb · 动词' }
];

// ─── Emoji validation ───
function isValidEmoji(s) {
  if (!s || typeof s !== 'string' || s.length > 10) return false;
  return !/[a-zA-Z0-9_]/.test(s);
}

const EMOJI_FALLBACK = '📝';

// ─── Split mixed en+zh string (e.g. "Ticket • 机票" → en:"Ticket", zh:"机票") ───
function splitMixedEnZh(text) {
  if (!text) return null;
  // Common delimiters between English and Chinese
  var m = text.match(/^(.+?)\s*[•·|–—-]\s*([\u4e00-\u9fff\u3400-\u4dbf].+)$/);
  if (m) return { en: m[1].trim(), zh: m[2].trim() };
  // Chinese followed by English? unlikely but handle
  m = text.match(/^([\u4e00-\u9fff\u3400-\u4dbf].+?)\s*[•·|–—-]\s*(.+)$/);
  if (m) return { en: m[2].trim(), zh: m[1].trim() };
  return null;
}

function hasChinese(s) {
  if (!s) return false;
  return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(s);
}

function sanitizeVocabItem(item, log) {
  if (!item || typeof item !== 'object') return;
  var push = log || function() {};
  // 1. Emoji: must be a valid short emoji string
  if (item.emoji !== undefined && !isValidEmoji(item.emoji)) {
    push('vocab emoji fixed: "' + String(item.emoji).slice(0, 20) + '" → ' + EMOJI_FALLBACK);
    item.emoji = EMOJI_FALLBACK;
  }
  // 2. en: if it contains Chinese, try to split mixed content
  if (typeof item.en === 'string' && hasChinese(item.en)) {
    var split = splitMixedEnZh(item.en);
    if (split) {
      push('vocab en split: "' + item.en.slice(0, 30) + '" → en="' + split.en + '" zh="' + split.zh + '"');
      item.en = split.en;
      if (!item.zh) item.zh = split.zh;
    } else {
      var cleaned = item.en.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+/g, '').trim();
      if (cleaned && cleaned !== item.en) {
        push('vocab en cleaned: removed CJK from "' + item.en.slice(0, 30) + '" → "' + cleaned + '"');
        item.en = cleaned;
      }
    }
  }
  // 3. zh: ensure string type
  if (!item.zh && item.zh !== '') item.zh = '';
  // 4. type: default if missing
  if (!item.type) item.type = 'Noun · 名词';
}

// AUTO-REPAIR — إصلاح الأخطاء الشائعة محليًا دون retry كامل
export function autoRepair(json) {
  const repairs = [];
  const result = JSON.parse(JSON.stringify(json));

  // ── 1. Vocab auto-fill + sanitize ───────────────────────────
  if (Array.isArray(result.vocab)) {
    // Sanitize every vocab item first
    for (var vi = 0; vi < result.vocab.length; vi++) {
      sanitizeVocabItem(result.vocab[vi], function(msg) { repairs.push(msg); });
    }

    // Deduplicate emojis across vocab
    var seenEmojis = {};
    var fallback = ['📌','💡','📄','💬','✨','🌍','🌐','💭','📋','🔵'];
    for (vi = 0; vi < result.vocab.length; vi++) {
      var v = result.vocab[vi];
      if (v && v.emoji) {
        if (seenEmojis[v.emoji]) {
          var dup = v.emoji;
          for (var fi = 0; fi < fallback.length; fi++) {
            var candidate = fallback[(vi + fi) % fallback.length];
            if (!seenEmojis[candidate]) {
              v.emoji = candidate;
              break;
            }
          }
          if (v.emoji === dup) v.emoji = '🔹';
          repairs.push('vocab[' + vi + '].emoji: deduplicated');
        }
        seenEmojis[v.emoji] = true;
      }
    }

    // Ensure minimum 15 vocab items
    const MIN_VOCAB = 15;
    if (result.vocab.length < MIN_VOCAB) {
      const needed = MIN_VOCAB - result.vocab.length;
      // Collect emojis already in use so filler entries don't collide
      const usedEmojis = new Set();
      for (const item of result.vocab) {
        if (item && item.emoji) usedEmojis.add(item.emoji);
      }
      // Collect used types for variety
      const usedTypes = new Set();
      for (const item of result.vocab) {
        if (item && item.type) usedTypes.add(item.type);
      }
      const typeList = [...usedTypes];
      let fillerIdx = 0;
      let poolIdx = 0;
      while (fillerIdx < needed && poolIdx < FILLER_VOCAB.length) {
        const candidate = FILLER_VOCAB[poolIdx++];
        if (!usedEmojis.has(candidate.emoji)) {
          const fillItem = {
            en: candidate.en,
            zh: candidate.zh,
            emoji: candidate.emoji,
            type: typeList.length > 0 ? typeList[fillerIdx % typeList.length] : candidate.type
          };
          result.vocab.push(fillItem);
          usedEmojis.add(candidate.emoji);
          fillerIdx++;
        }
      }
      if (fillerIdx > 0) {
        repairs.push('Vocab auto-filled: added ' + fillerIdx + ' items to reach minimum ' + MIN_VOCAB);
      }
    }
  }

  // ── 2. DragZones normalization ──────────────────────────────
  if (Array.isArray(result.exercises?.dragWords)) {
    const EXACT_ZONE_COUNT = 2;
    const wordCats = [...new Set(result.exercises.dragWords.map(w => w.cat).filter(Boolean))];

    // Ensure dragZones exists
    if (!Array.isArray(result.exercises.dragZones)) {
      result.exercises.dragZones = [];
    }

    const zoneAccepts = result.exercises.dragZones.map(z => z.accept);

    // Strategy: keep exactly EXACT_ZONE_COUNT zones.
    // If more than EXACT_ZONE_COUNT unique categories exist, remap extras.
    if (wordCats.length <= EXACT_ZONE_COUNT) {
      // ≤2 categories: ensure one zone per category, no remapping needed
      for (const cat of wordCats) {
        if (!zoneAccepts.includes(cat)) {
          result.exercises.dragZones.push({
            accept: cat,
            emoji: '📦',
            en: cat.charAt(0).toUpperCase() + cat.slice(1),
            zh: cat
          });
          repairs.push('Added dragZone for category "' + cat + '"');
        }
      }
      // Remove extra zones beyond EXACT_ZONE_COUNT
      while (result.exercises.dragZones.length > EXACT_ZONE_COUNT) {
        result.exercises.dragZones.pop();
        repairs.push('Removed extra dragZone');
      }
      // Pad to exactly EXACT_ZONE_COUNT if needed
      while (result.exercises.dragZones.length < EXACT_ZONE_COUNT) {
        var idx = result.exercises.dragZones.length + 1;
        var accept = 'category-' + idx;
        result.exercises.dragZones.push({
          accept: accept,
          emoji: ['📦','🎯','⭐','🔤'][idx % 4],
          en: 'Category ' + idx,
          zh: '分类' + idx
        });
        repairs.push('Added generic dragZone ' + idx);
      }
    } else {
      // >2 categories: keep the first 2 category-derived zones (or first 2 existing zones),
      // remap all other dragWords to one of the kept zones.
      var keptZones = [];
      var keptAccepts = [];

      // Take existing zones that match a dragWord category (preferred)
      for (var zi = 0; zi < result.exercises.dragZones.length && keptZones.length < EXACT_ZONE_COUNT; zi++) {
        var z = result.exercises.dragZones[zi];
        if (wordCats.includes(z.accept)) {
          keptZones.push(z);
          keptAccepts.push(z.accept);
        }
      }
      // Fill remaining slots from dragWord categories not yet assigned
      for (var ci = 0; ci < wordCats.length && keptZones.length < EXACT_ZONE_COUNT; ci++) {
        var cat = wordCats[ci];
        if (!keptAccepts.includes(cat)) {
          keptZones.push({
            accept: cat,
            emoji: '📦',
            en: cat.charAt(0).toUpperCase() + cat.slice(1),
            zh: cat
          });
          keptAccepts.push(cat);
        }
      }

      // Remap all dragWords to the kept zone accepts
      var zoneIdx = 0;
      for (var dwi = 0; dwi < result.exercises.dragWords.length; dwi++) {
        var dw = result.exercises.dragWords[dwi];
        if (dw && dw.cat && !keptAccepts.includes(dw.cat)) {
          var target = keptAccepts[zoneIdx % EXACT_ZONE_COUNT];
          repairs.push('Remapped dragWord "' + (dw.en || '') + '" cat "' + dw.cat + '" → "' + target + '"');
          dw.cat = target;
          zoneIdx++;
        }
      }

      result.exercises.dragZones = keptZones;
    }

    // Ensure every zone has at least one matching dragWord
    var finalAccepts = result.exercises.dragZones.map(function(z) { return z.accept; });
    var finalCats = new Set(result.exercises.dragWords.map(function(w) { return w.cat; }));
    finalAccepts.forEach(function(accept) {
      if (!finalCats.has(accept)) {
        result.exercises.dragWords.push({ en: accept, cat: accept });
        repairs.push('Added dragWord for zone "' + accept + '"');
      }
    });
  }

  // ── 3. Fix MCQ options count to exactly 4 ──────────────────
  if (result.exercises?.mcq) {
    for (let i = 0; i < result.exercises.mcq.length; i++) {
      const q = result.exercises.mcq[i];
      if (q && q.options) {
        if (q.options.length < 4) {
          while (q.options.length < 4) {
            q.options.push('Option ' + (q.options.length + 1));
          }
          repairs.push('exercises.mcq[' + i + '].options: padded to 4 options');
        } else if (q.options.length > 4) {
          q.options.length = 4;
          if (q.correct > 3) q.correct = 0;
          repairs.push('exercises.mcq[' + i + '].options: trimmed to 4 options');
        }
      }
    }
  }

  // ── 4. Ensure listeningExercise.text matches options ─────────
  if (result.exercises?.listeningExercise?.text && result.exercises?.listeningExercise?.options) {
    const match = result.exercises.listeningExercise.options.find(o => o.en === result.exercises.listeningExercise.text);
    if (!match) {
      const options = result.exercises.listeningExercise.options;
      if (options.length > 0) {
        const correct = options.find(o => o.correct === true);
        if (correct) {
          result.exercises.listeningExercise.text = correct.en;
          repairs.push('Fixed listeningExercise.text to match correct option');
        }
      }
    }
  }

  return { data: result, repairs };
}
