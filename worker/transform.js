// ================================================================
// *** TRANSFORM — توقيع البيانات + إضافة الميتاداتا ***
// ================================================================

export function transformLesson(lessonData, config) {
  const id = generateId();
  const now = new Date().toISOString();

  const enriched = JSON.parse(JSON.stringify(lessonData));

  enriched._meta = {
    id,
    version: config.VERSION || '1.0.0',
    generatedAt: now,
    engine: 'ai-lesson-engine',
    signature: createSignature(id, lessonData.meta?.brandTitle || ''),
    copyright: `© ${new Date().getFullYear()} Ahmed Abdo. All rights reserved.`,
    license: 'All Rights Reserved'
  };

  return {
    id,
    createdAt: now,
    lesson: enriched
  };
}

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const timestamp = Date.now().toString(36);
  let random = '';
  for (let i = 0; i < 8; i++) {
    random += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `lesson_${timestamp}_${random}`;
}

function createSignature(id, title) {
  const str = `${id}:${title}:ai-lesson-engine`;
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return `sig_${Math.abs(hash).toString(36).padStart(6, '0')}`;
}

export function stripMetadata(lessonData) {
  const cleaned = { ...lessonData };
  delete cleaned._meta;
  return cleaned;
}
