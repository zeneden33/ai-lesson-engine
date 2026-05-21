// ================================================================
// *** STRESS TEST — Batch Generation + Validation Suite ***
// *** Usage: node scripts/stress-test.js                    ***
// *** Options:                                              ***
// ***   --count=50     Number of topics to test (default 50)***
// ***   --api=real     Use real Gemini API (needs API key)  ***
// ***   --api=mock     Use mock generator (default, no key) ***
// ***   --topics=file  Custom topics file                    ***
// ================================================================

import { validateLesson, validationMetrics, autoRepair } from '../worker/src/validate.js';
import { detectVersion, analyzeVersionDistribution, injectVersion, diffSchema } from '../worker/src/versioning.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ================================================================
// 100 Diverse Test Topics
// ================================================================

const DEFAULT_TOPICS = [
  // Daily Life (10)
  'Shopping for clothes', 'At the restaurant', 'Ordering coffee', 'Taking a taxi',
  'Asking for directions', 'At the supermarket', 'Making a phone call', 'Visiting the doctor',
  'At the hotel check-in', 'Going to the bank',
  // Travel (8)
  'Booking a flight', 'At the airport', 'Renting a car', 'Asking about hotel amenities',
  'Buying train tickets', 'At the tourist information center', 'Packing for a trip', 'Customs and immigration',
  // Work & Business (8)
  'Job interview', 'Office meeting', 'Writing a business email', 'Presenting a project',
  'Negotiating a contract', 'Networking at a conference', 'Asking for a raise', 'Team collaboration',
  // Education (8)
  'First day at school', 'Asking the teacher a question', 'Studying for an exam', 'In the library',
  'Group discussion', 'Giving a presentation', 'Applying to university', 'Scholarship interview',
  // Health & Fitness (6)
  'At the gym', 'Talking to a personal trainer', 'Describing symptoms to a doctor', 'Buying medicine at a pharmacy',
  'Making a dentist appointment', 'Healthy eating habits',
  // Technology (6)
  'Buying a new phone', 'Setting up Wi-Fi', 'Troubleshooting a computer', 'Subscribing to a streaming service',
  'Using social media', 'Online shopping',
  // Social & Relationships (8)
  'Meeting new people', 'Making friends', 'Inviting someone to a party', 'Accepting and declining invitations',
  'Talking about hobbies', 'Describing your family', 'Celebrating a birthday', 'Going on a date',
  // Home & Living (6)
  'Renting an apartment', 'Furnishing a room', 'Cooking a recipe', 'Cleaning the house',
  'Talking to a landlord', 'Paying utility bills',
  // Nature & Environment (6)
  'Weather forecast', 'At the park', 'Describing a landscape', 'Environmental protection',
  'Planting a garden', 'Visiting a farm',
  // Culture & Entertainment (8)
  'Going to the cinema', 'Watching a sports game', 'Visiting a museum', 'Reading a book review',
  'Talking about music', 'At a concert', 'Playing a board game', 'Photography tips',
  // Emergencies & Services (6)
  'Reporting an emergency', 'Calling the police', 'At the hospital emergency room', 'Reporting a lost item',
  'Car breakdown', 'Power outage',
  // Advanced Topics (10)
  'Discussing climate change', 'Debating technology ethics', 'Artificial intelligence in education',
  'Globalization and culture', 'Renewable energy sources', 'Space exploration', 'Mental health awareness',
  'Remote work pros and cons', 'Digital privacy', 'Sustainable living',
  // Beginner Friendly (10)
  'Introducing yourself', 'Counting numbers', 'Telling the time', 'Days of the week',
  'Colors and shapes', 'Family members', 'Pets and animals', 'Fruits and vegetables',
  'Parts of the body', 'Weather and seasons'
];

// ================================================================
// Mock Lesson Generator (no API key needed)
// ================================================================

function generateMockLesson(topic, index) {
  const words = topic.toLowerCase().split(' ').filter(w => w.length > 2);
  const mainWord = words[0] || 'lesson';
  const capitalized = mainWord.charAt(0).toUpperCase() + mainWord.slice(1);

  return {
    meta: {
      pageTitle: `${capitalized} | English Lesson`,
      brandTitle: capitalized,
      brandIcon: ['📚', '🎯', '💡', '🌟', '📖', '✏️', '🗣️', '🧠'][index % 8]
    },
    hook: {
      emojis: '🎯 💡 🌟 📚',
      title_en: `How do you ${topic}?`,
      title_zh: `你如何${topic}？`,
      tagline: `📚 Unit ${Math.floor(index / 10) + 1} · Lesson ${(index % 10) + 1}`,
      compare: [
        { emoji: '🧑', en: 'Beginner', zh: '初学者', type: 'beginner' },
        { emoji: '🎓', en: 'Advanced', zh: '高级', type: 'advanced' }
      ]
    },
    thinking: [
      { en: `Have you ever ${topic.toLowerCase()}?`, zh: `你曾经${topic}吗？`, emoji: '🤔' },
      { en: `What do you know about ${topic.toLowerCase()}?`, zh: `你对${topic}了解多少？`, emoji: '💭' },
      { en: `Why is ${mainWord.toLowerCase()} important?`, zh: `为什么${mainWord}重要？`, emoji: '❓' },
      { en: `How can you improve at ${topic.toLowerCase()}?`, zh: `你如何提高${topic}的能力？`, emoji: '🎯' }
    ],
    vocab: [
      { en: mainWord, zh: `${mainWord}的翻译`, emoji: '📝', type: 'Noun · 名词' },
      { en: 'Practice', zh: '练习', emoji: '✏️', type: 'Verb · 动词' },
      { en: 'Important', zh: '重要的', emoji: '⭐', type: 'Adjective · 形容词' },
      { en: 'Helpful', zh: '有帮助的', emoji: '🤝', type: 'Adjective · 形容词' },
      { en: 'Learn', zh: '学习', emoji: '📖', type: 'Verb · 动词' },
      { en: 'Understand', zh: '理解', emoji: '🧠', type: 'Verb · 动词' },
      { en: 'Question', zh: '问题', emoji: '❓', type: 'Noun · 名词' },
      { en: 'Answer', zh: '答案', emoji: '✅', type: 'Noun · 名词' },
      { en: 'Example', zh: '例子', emoji: '🔍', type: 'Noun · 名词' },
      { en: 'Beginner', zh: '初学者', emoji: '🌱', type: 'Noun · 名词' },
      { en: 'Advanced', zh: '高级', emoji: '🚀', type: 'Adjective · 形容词' },
      { en: 'Confident', zh: '自信的', emoji: '💪', type: 'Adjective · 形容词' },
      { en: 'Fluently', zh: '流利地', emoji: '🎤', type: 'Adverb · 副词' },
      { en: 'Carefully', zh: '仔细地', emoji: '👀', type: 'Adverb · 副词' },
      { en: 'Communication', zh: '交流', emoji: '💬', type: 'Noun · 名词' },
      { en: 'Excellent', zh: '优秀的', emoji: '🏆', type: 'Adjective · 形容词' }
    ],
    dialogue: [
      { speaker: 'Student', role: 'student', en: `Excuse me, can you help me with ${topic.toLowerCase()}?`, zh: `打扰一下，你能帮我${topic}吗？` },
      { speaker: 'Teacher', role: 'teacher', en: `Of course! What would you like to know about ${topic.toLowerCase()}?`, zh: `当然！你想了解关于${topic}的什么？` },
      { speaker: 'Student', role: 'student', en: `I want to learn how to ${topic.toLowerCase()} better.`, zh: `我想学习如何更好地${topic}。` },
      { speaker: 'Teacher', role: 'teacher', en: `That's great! Let's start with the basics.`, zh: `太好了！让我们从基础开始。` },
      { speaker: 'Student', role: 'student', en: `What is the most important thing to remember?`, zh: `最重要的事情是什么？` },
      { speaker: 'Teacher', role: 'teacher', en: `Practice every day and don't be afraid to make mistakes.`, zh: `每天练习，不要害怕犯错。` },
      { speaker: 'Student', role: 'student', en: `Thank you for the advice!`, zh: `谢谢你的建议！` },
      { speaker: 'Teacher', role: 'teacher', en: `You're welcome! Keep up the good work.`, zh: `不客气！继续保持。` }
    ],
    dialogueScenes: [
      { emoji: '🏫', label_en: 'In the classroom', label_zh: '在教室里', gradient: 'linear-gradient(135deg,#e8f5e9,#a5d6a7)' },
      { emoji: '📝', label_en: 'Practicing together', label_zh: '一起练习', gradient: 'linear-gradient(135deg,#fff8e1,#ffe082)' }
    ],
    explain: [
      { label: '① Starting a conversation', en: `"Can you help me with..." is a polite way to ask for assistance.`, zh: `"Can you help me with..." 是请求帮助的礼貌方式。`, note: `🔖 Use "Can you help me with + noun"` },
      { label: '② Expressing desire to learn', en: `"I want to learn how to..." expresses your learning goal.`, zh: `"I want to learn how to..." 表达你的学习目标。`, note: `🔖 Follow with the skill you want to learn` },
      { label: '③ Asking for key information', en: `"What is the most important thing?" asks for priorities.`, zh: `"What is the most important thing?" 询问重点。`, note: `🔖 Most important = key priority` },
      { label: '④ Receiving encouragement', en: `Teachers often say "Don't be afraid to make mistakes" to encourage students.`, zh: `老师常说 "Don't be afraid to make mistakes" 来鼓励学生。`, note: `🔖 Mistakes = learning opportunities` }
    ],
    grammarMeta: { title: `Grammar: Questions with 'Can' and 'How'`, subtitle: `语法 — 用Can和How提问` },
    grammar: [
      { type: 'pattern', title: '📐 Asking for help', en: 'Can you + base verb + object?', zh: 'Can you + 动词原形 + 宾语？' },
      { type: 'pattern', title: '📐 Asking about knowledge', en: 'What do you know about + topic?', zh: 'What do you know about + 话题？' },
      { type: 'conjugation', title: '🔄 Verb: to learn', items: [
        { pronoun: 'I', verb: 'learn', zh: '我学习' }, { pronoun: 'You', verb: 'learn', zh: '你学习' },
        { pronoun: 'He', verb: 'learns', zh: '他学习' }, { pronoun: 'She', verb: 'learns', zh: '她学习' },
        { pronoun: 'We', verb: 'learn', zh: '我们学习' }, { pronoun: 'They', verb: 'learn', zh: '他们学习' }
      ]}
    ],
    exercisesMeta: { title: 'Exercises' },
    exercises: {
      mcq: [
        { question: `What is the best way to improve at ${mainWord.toLowerCase()}?`, options: ['Practice daily', 'Never practice', 'Only read', 'Give up'], correct: 0 },
        { question: 'What should you not be afraid of?', options: ['Success', 'Mistakes', 'Perfection', 'Sleeping'], correct: 1 },
        { question: '"Can you help me" is a ___ way to ask.', options: ['Rude', 'Polite', 'Loud', 'Fast'], correct: 1 }
      ],
      trueFalse: [
        { en: 'Practice helps you improve.', zh: '练习帮助你提高。', correct: true },
        { en: 'Mistakes are bad.', zh: '错误是坏事。', correct: false },
        { en: 'Asking questions is good.', zh: '提问是好事。', correct: true },
        { en: 'You should be afraid of mistakes.', zh: '你应该害怕犯错。', correct: false },
        { en: 'Teachers encourage students.', zh: '老师鼓励学生。', correct: true }
      ],
      fillBlanks: [
        { sentence: 'Can you help me ___ practice?', answer: 'with' },
        { sentence: 'Don\'t be afraid to make ___.', answer: 'mistakes' },
        { sentence: '___ every day to improve.', answer: 'Practice' }
      ],
      dragWords: [
        { en: 'Practice daily', cat: 'good' }, { en: 'Ask questions', cat: 'good' },
        { en: 'Give up', cat: 'bad' }, { en: 'Fear mistakes', cat: 'bad' },
        { en: 'Study regularly', cat: 'good' }, { en: 'Ignore feedback', cat: 'bad' }
      ],
      dragZones: [
        { accept: 'good', emoji: '✅', en: 'Good Habits', zh: '好习惯' },
        { accept: 'bad', emoji: '❌', en: 'Bad Habits', zh: '坏习惯' }
      ],
      orderWords: ['you', 'can', 'help', 'me'],
      orderTarget: 'Can you help me',
      correctError: { sentence: 'He don\'t like practice.', options: [
        { en: 'don\'t → doesn\'t', correct: true }, { en: 'like → likes', correct: false },
        { en: 'practice → practicing', correct: false }, { en: 'No error', correct: false }
      ]},
      rewrite: { sentence: 'I practice every day. → She ___ every day.', answer: 'practices', instruction: 'Rewrite using "She"' },
      guidedWriting: { title: 'Guided Writing', instruction: '引导写作', sentences: [
        { prefix: 'I want to learn', placeholder: '... (topic)' },
        { prefix: 'The most important thing is', placeholder: '...' },
        { prefix: 'I will practice', placeholder: '... (how often)' }
      ]},
      listeningExercise: { text: 'Practice every day and don\'t be afraid to make mistakes.', options: [
        { en: 'Practice every day and don\'t be afraid to make mistakes.', correct: true },
        { en: 'Practice every week and don\'t worry about mistakes.', correct: false },
        { en: 'Never practice and avoid all mistakes.', correct: false }
      ]},
      speedChallenge: { title: '⚡ Speed Challenge', instruction: '30-second challenge' },
      multiStep: { title: 'Multi-Step Thinking', instruction: '多步推理', story: {
        en: `A student wants to improve ${mainWord.toLowerCase()}. They practice for 30 minutes every day. After one month, they feel more confident.`,
        zh: `一个学生想提高${mainWord}。他们每天练习30分钟。一个月后，他们感到更自信了。`
      }, questions: [
        { en: 'How long does the student practice daily?', zh: '学生每天练习多长时间？', options: [
          { en: '15 minutes', correct: false }, { en: '30 minutes', correct: true }, { en: '60 minutes', correct: false }
        ]},
        { en: 'How does the student feel after one month?', zh: '一个月后学生感觉如何？', options: [
          { en: 'More confident', correct: true }, { en: 'Less confident', correct: false }, { en: 'The same', correct: false }
        ]}
      ]},
      paragraph: { sentence: 'I want to ___ English. I practice every ___. My teacher is very ___.', answers: ['learn', 'day', 'helpful'] },
      contextAnalysis: { dialogue: 'Student: Can you help me?\nTeacher: Of course!', question: 'Who is offering help?', options: [
        { en: 'The student', correct: false }, { en: 'The teacher', correct: true }
      ]},
      scenario: { setup_en: 'You are in an English class. You don\'t understand a grammar point.', setup_zh: '你在英语课上。你不明白一个语法点。', question: 'What do you say?', options: [
        { en: 'I don\'t understand. Can you explain?', correct: true }, { en: 'This is boring.', correct: false }, { en: 'I already know this.', correct: false }
      ]},
      visualChoice: { emoji: '💡', options: [
        { en: 'A good idea', correct: true }, { en: 'A bad idea', correct: false }, { en: 'A chair', correct: false }
      ]},
      sentenceTransform: { title: 'Sentence Transformation', instruction: '陈述句 → 疑问句', sentence: 'You can help me. ← <input class="fill-input" data-answer="Can you help me" style="min-width:130px">?', answer: 'Can you help me' },
      challenge: { zh: '完成对话', sentence: 'Can you ___ me? I want to ___ English. ___ you help?', answers: ['help', 'learn', 'Can'] },
      selectWords: { title_en: 'Select words related to learning', title_zh: '选择与学习相关的词' },
      dialogueFill: { lines: [
        { speaker: 'Student', text: 'Can you help me ___ practice?', answer: 'with' },
        { speaker: 'Teacher', text: 'What do you want to ___?', answer: 'learn' },
        { speaker: 'Student', text: 'I want to ___ better.', answer: 'improve' },
        { speaker: 'Teacher', text: '___ every day!', answer: 'Practice' }
      ]},
      patternFill: { title: 'Verb Conjugation', instruction: '动词变位', lines: [
        { pronoun: 'I', verb: 'learn', suffix: 'English every day.' },
        { pronoun: 'You', verb: 'learn', suffix: 'new words.' },
        { pronoun: 'He', verb: 'learns', suffix: 'quickly.' },
        { pronoun: 'She', verb: 'learns', suffix: 'from her teacher.' },
        { pronoun: 'We', verb: 'learn', suffix: 'together.' }
      ]}
    },
    smartFeedback: {
      'dont': { context: 'He', correct: "doesn't", en: '💡 With "He/She/It" use "doesn\'t" not "don\'t"', zh: '💡 用 "他/她/它" 时用 doesn\'t 不用 don\'t' },
      'practice': { context: 'daily habit', correct: 'practice', en: '💡 "Practice" can be a noun or verb', zh: '💡 "Practice" 可以是名词或动词' },
      'afraid': { context: 'fear', correct: 'afraid', en: '💡 "Afraid" = feeling fear. "I am afraid of mistakes."', zh: '💡 "Afraid" = 感到害怕。' }
    }
  };
}


// ================================================================
// Real API Batch Generator
// ================================================================

async function generateRealLesson(topic, index, apiKey) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const systemPrompt = `You are a JSON lesson generator. Output ONLY valid JSON. Include ALL 22 exercise types. Follow the schema exactly.`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nTopic: "' + topic + '"\nLevel: beginner\nGenerate complete lesson JSON.' }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 8192 }
    })
  });

  if (!response.ok) throw new Error(`API error ${response.status}`);
  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : null;
}


// ================================================================
// Inconsistency Detection
// ================================================================

function detectInconsistencies(json) {
  const issues = [];

  if (json?.exercises) {
    const ex = json.exercises;

    // Check dragZones vs dragWords
    if (ex.dragWords && ex.dragZones) {
      const cats = new Set(ex.dragWords.map(w => w.cat));
      const accepts = new Set(ex.dragZones.map(z => z.accept));
      const missing = [...cats].filter(c => !accepts.has(c));
      if (missing.length) issues.push(`Inconsistency: dragZones missing cats: ${missing.join(',')}`);
    }

    // Check listeningExercise text match
    if (ex.listeningExercise?.text && ex.listeningExercise?.options) {
      const match = ex.listeningExercise.options.find(o => o.en === ex.listeningExercise.text);
      if (!match && ex.listeningExercise.options.length > 0) {
        issues.push('Inconsistency: listeningExercise.text not found in options');
      }
    }

    // Check duplicate type values in exercises
    if (ex.correctError?.options) {
      const trueCount = ex.correctError.options.filter(o => o.correct === true).length;
      if (trueCount !== 1) issues.push(`Inconsistency: correctError has ${trueCount} correct options (expected 1)`);
    }
  }

  // Check for hallucinated keys
  const allowedTopKeys = new Set([
    'meta', 'hook', 'thinking', 'vocab', 'dialogue', 'dialogueScenes',
    'explain', 'grammarMeta', 'grammar', 'exercisesMeta', 'exercises', 'smartFeedback', '_meta'
  ]);
  if (json) {
    for (const key of Object.keys(json)) {
      if (!allowedTopKeys.has(key)) {
        issues.push(`Hallucinated top-level key: "${key}"`);
      }
    }
  }

  return issues;
}


// ================================================================
// Configuration Comparison — detect variation across generations
// ================================================================

function compareAcrossGenerations(results) {
  const variations = {};

  const validResults = results.filter(r => r.valid);

  if (validResults.length < 2) return {};

  // Check hook.compare length consistency
  const compareLengths = new Set(validResults.map(r => r.data?.hook?.compare?.length));
  if (compareLengths.size > 1) {
    variations.hookCompareLength = [...compareLengths];
  }

  // Check dialogueScenes length consistency
  const scenesLengths = new Set(validResults.map(r => r.data?.dialogueScenes?.length));
  if (scenesLengths.size > 1) {
    variations.dialogueScenesLength = [...scenesLengths];
  }

  // Check vocab size range
  const vocabSizes = validResults.map(r => r.data?.vocab?.length || 0);
  variations.vocabSizeRange = [Math.min(...vocabSizes), Math.max(...vocabSizes)];

  // Check emoji uniqueness rate
  let totalWithDupes = 0;
  for (const r of validResults) {
    if (!r.data?.vocab) continue;
    const emojis = r.data.vocab.map(v => v.emoji);
    const unique = new Set(emojis);
    if (unique.size !== emojis.length) totalWithDupes++;
  }
  variations.emojiDuplicateRate = validResults.length > 0 ? (totalWithDupes / validResults.length * 100).toFixed(1) + '%' : 'N/A';

  // Average generation time
  const times = validResults.map(r => r.timeMs).filter(t => t);
  variations.avgGenerationTimeMs = times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : 0;

  return variations;
}


// ================================================================
// Report Generation
// ================================================================

function generateReport(results, config) {
  const valid = results.filter(r => r.valid);
  const invalid = results.filter(r => !r.valid);
  const metrics = validationMetrics(results);

  const inconsistencies = results.flatMap(r => r.issues).filter(Boolean);
  const inconsistencyTypes = {};
  for (const iss of inconsistencies) {
    const type = iss.split(':')[0];
    if (!inconsistencyTypes[type]) inconsistencyTypes[type] = 0;
    inconsistencyTypes[type]++;
  }

  const hallucinatedKeys = new Map();
  for (const r of results) {
    for (const iss of r.issues || []) {
      if (iss.startsWith('Hallucinated')) {
        const key = iss.replace('Hallucinated top-level key: ', '').replace(/"/g, '');
        hallucinatedKeys.set(key, (hallucinatedKeys.get(key) || 0) + 1);
      }
    }
  }

  const report = {
    title: 'AI LESSON ENGINE — STRESS TEST REPORT',
    timestamp: new Date().toISOString(),
    config: {
      totalTopics: config.count,
      apiMode: config.apiMode,
      mockTopicsWithErrors: config.injectErrors
    },
    summary: {
      total: results.length,
      passed: valid.length,
      failed: invalid.length,
      passRate: results.length > 0 ? (valid.length / results.length * 100).toFixed(1) + '%' : '0%',
      avgGenerationTimeMs: metrics.total > 0 ? Math.round(results.reduce((s, r) => s + (r.timeMs || 0), 0) / results.length) : 0
    },
    validationMetrics: metrics,
    consistency: {
      totalInconsistenciesFound: inconsistencies.length,
      affectedLessons: new Set(invalid.map(r => r.index)).size,
      inconsistencyTypes,
      hallucinatedKeys: Object.fromEntries(hallucinatedKeys)
    },
    crossGenerationComparison: compareAcrossGenerations(results),
    topFailedTopics: invalid.slice(0, 10).map(r => ({
      index: r.index,
      topic: r.topic,
      errors: r.errors?.slice(0, 5)
    })),
    score: calculateScore(valid.length, results.length, inconsistencies.length)
  };

  return report;
}

function calculateScore(passed, total, inconsistencies) {
  if (total === 0) return 0;
  const passScore = (passed / total) * 60;
  const consistencyPenalty = Math.min(inconsistencies * 2, 20);
  const qualityScore = Math.max(0, Math.min(100, passScore - consistencyPenalty + 20));
  return Math.round(qualityScore);
}


// ================================================================
// Main
// ================================================================

async function main() {
  const args = process.argv.slice(2);
  const count = parseInt(args.find(a => a.startsWith('--count='))?.split('=')[1] || '50', 10);
  const apiMode = args.find(a => a.startsWith('--api='))?.split('=')[1] || 'mock';
  const apiKey = process.env.GEMINI_API_KEY;
  const injectErrors = args.includes('--inject-errors');

  const topics = DEFAULT_TOPICS.slice(0, count);
  const results = [];

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  STRESS TEST — ${count} Topics`);
  console.log(`  Mode: ${apiMode.toUpperCase()}`);
  console.log(`═══════════════════════════════════════════════\n`);

  for (let i = 0; i < topics.length; i++) {
    const topic = topics[i];
    const startTime = Date.now();
    process.stdout.write(`  [${i + 1}/${count}] "${topic}"... `);

    try {
      let data;

      if (apiMode === 'mock') {
        data = generateMockLesson(topic, i);
        await sleep(10); // Simulate slight delay
      } else {
        if (!apiKey) throw new Error('GEMINI_API_KEY environment variable required for real API mode');
        data = await generateRealLesson(topic, i, apiKey);
      }

      const validation = validateLesson(data);
      const issues = detectInconsistencies(data);
      const version = detectVersion(data);
      const timeMs = Date.now() - startTime;

      const result = {
        index: i,
        topic,
        valid: validation.valid && issues.length === 0,
        errors: validation.errors,
        issues,
        data,
        timeMs,
        version
      };

      results.push(result);

      if (result.valid) {
        console.log(`✅ PASS (${timeMs}ms)`);
      } else {
        console.log(`❌ FAIL (${timeMs}ms)`);
        if (validation.errors.length > 0) {
          console.log(`     Validation: ${validation.errors.slice(0, 3).join('; ')}`);
        }
        if (issues.length > 0) {
          console.log(`     Inconsistencies: ${issues.slice(0, 2).join('; ')}`);
        }
      }

    } catch (err) {
      results.push({
        index: i, topic, valid: false, errors: [err.message], issues: [], timeMs: Date.now() - startTime
      });
      console.log(`❌ ERROR: ${err.message.slice(0, 60)}`);
    }
  }

  // Generate and display report
  const report = generateReport(results, { count, apiMode, injectErrors });

  console.log(`\n═══════════════════════════════════════════════`);
  console.log(`  REPORT`);
  console.log(`═══════════════════════════════════════════════\n`);
  console.log(`  Pass Rate:     ${report.summary.passRate}`);
  console.log(`  Passed:        ${report.summary.passed}/${report.summary.total}`);
  console.log(`  Failed:        ${report.summary.failed}/${report.summary.total}`);
  console.log(`  Avg Time:      ${report.summary.avgGenerationTimeMs}ms`);
  console.log(`  Score:         ${report.score}/100`);
  console.log(`  Inconsistencies: ${report.consistency.totalInconsistenciesFound}`);

  if (report.consistency.hallucinatedKeys &&
      Object.keys(report.consistency.hallucinatedKeys).length > 0) {
    console.log(`\n  ⚠️ Hallucinated Keys Found:`);
    for (const [key, count] of Object.entries(report.consistency.hallucinatedKeys)) {
      console.log(`     - "${key}": ${count} time(s)`);
    }
  }

  if (report.validationMetrics.layerFailures &&
      Object.keys(report.validationMetrics.layerFailures).length > 0) {
    console.log(`\n  Layer Failures:`);
    for (const [layer, count] of Object.entries(report.validationMetrics.layerFailures)) {
      console.log(`     - ${layer}: ${count}`);
    }
  }

  if (report.topFailedTopics.length > 0) {
    console.log(`\n  Top Failed Topics:`);
    for (const ft of report.topFailedTopics) {
      console.log(`     ${ft.index}. "${ft.topic}"`);
    }
  }

  if (report.consistency.totalInconsistenciesFound > 0) {
    console.log(`\n  Consistency Issues:`);
    for (const [type, count] of Object.entries(report.consistency.inconsistencyTypes)) {
      console.log(`     - ${type}: ${count}`);
    }
  }

  if (report.crossGenerationComparison.vocabSizeRange) {
    const [min, max] = report.crossGenerationComparison.vocabSizeRange;
    console.log(`\n  Cross-Generation Analysis:`);
    console.log(`     Vocab size range: ${min}-${max}`);
    console.log(`     Emoji duplicate rate: ${report.crossGenerationComparison.emojiDuplicateRate}`);
  }

  // Save report
  const reportPath = `./stress-test-report-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n  📄 Full report saved to: ${reportPath}`);

  // Exit code
  const exitCode = report.score >= 70 ? 0 : 1;
  console.log(`\n  Exit code: ${exitCode} (score: ${report.score}/100, threshold: 70)\n`);
  process.exit(exitCode);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

main();
