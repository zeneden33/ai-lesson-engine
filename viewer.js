// ================================================================
// *** AI LESSON ENGINE — VIEWER ***
// *** Stateless renderer. No schema. No AI. No validation. ***
// ================================================================

(() => {
'use strict';

// API base URL — auto-detect local dev vs production
// Dev: frontend on :3000, worker on :8787
// Prod: same origin (Cloudflare Pages + Workers route)
var API_BASE = (location.hostname === '127.0.0.1' || location.hostname === 'localhost')
  ? 'http://127.0.0.1:8787'
  : '';
console.log('[BOOT] API_BASE:', API_BASE || '(same origin)');

var esc = ExerciseBase.esc;
var guard = ExerciseBase.guard;
var guardArr = ExerciseBase.guardArr;
// FIXED: bind exBox so this.esc() works when called standalone
var exBox = ExerciseBase.exBox.bind(ExerciseBase);

// ============================
// 1. CORE — render pipeline
// ============================

function clearContainer(el) { if (el) el.innerHTML = ''; }

// $ is for QUERYING only (CSS selectors). Never pass HTML tags.
const $ = (s, p) => (p || document).querySelector(s);
const $$ = (s, p) => [...(p || document).querySelectorAll(s)];
// mkEl is for creating elements. Use this instead of $('<tag>').
const mkEl = (tag) => document.createElement(tag);

// ─── Vocab rendering guards ───
function _safeEmoji(s) {
  if (!s || typeof s !== 'string' || s.length > 10) return '📝';
  if (/[a-zA-Z0-9_]/.test(s)) return '📝';
  if (/[\p{L}\p{N}]/u.test(s)) return '📝';
  return s;
}
function _safeEn(s) {
  if (typeof s !== 'string') return '';
  return s.replace(/[\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]/g, '').trim();
}
function _safeZh(s) {
  if (typeof s !== 'string') return '';
  return s;
}

const App = {
  lesson: null,
  loading: false,

  async init() {
    console.log('[BOOT] modules loaded, DOM ready');
    try {
      UI.Theme.init();
      UI.Font.init();
      UI.Translation.init();
      document.getElementById('generateBtn').onclick = () => this.generate();
      document.getElementById('topicInput').onkeydown = e => { if (e.key === 'Enter') this.generate(); };
      this._initImageUpload();
      this._initTabs();
      console.log('[BOOT] event handlers bound');
    } catch (e) {
      console.error('[BOOT] init error:', e);
      showFatalError('Startup failed: ' + e.message);
      return;
    }
  },

  hideSplash() {
    var el = document.getElementById('splashScreen');
    if (!el) return;
    el.classList.add('fade-out');
    setTimeout(function() { el.remove(); }, 700);
    console.log('[BOOT] splash hidden');
  },

  _initTabs() {
    var tabs = document.querySelectorAll('.input-tab');
    var self = this;
    tabs.forEach(function(tab) {
      tab.onclick = function() {
        tabs.forEach(function(t) { t.classList.remove('active'); });
        this.classList.add('active');
        document.querySelectorAll('.input-panel').forEach(function(p) { p.classList.remove('active'); });
        var tabName = this.dataset.tab;
        var panelId = 'panel' + tabName.charAt(0).toUpperCase() + tabName.slice(1);
        var panel = document.getElementById(panelId);
        if (panel) panel.classList.add('active');
      };
    });
  },

  _initImageUpload() {
    var input = document.getElementById('imageInput');
    var area = document.getElementById('imageUploadArea');
    var placeholder = document.getElementById('uploadPlaceholder');
    var preview = document.getElementById('uploadPreview');
    var img = document.getElementById('previewImage');
    var removeBtn = document.getElementById('removeImageBtn');
    var MAX_MB = 5;

    area.onclick = function() { input.click(); };

    input.onchange = function() {
      var file = input.files[0];
      console.log('[DEBUG] file input onchange, file:', file ? file.name : 'null');
      if (!file) return;
      if (file.size > MAX_MB * 1024 * 1024) {
        alert('Image too large. Maximum size is ' + MAX_MB + 'MB.');
        input.value = '';
        return;
      }
      var reader = new FileReader();
      reader.onload = function(e) {
        img.src = e.target.result;
        placeholder.style.display = 'none';
        preview.style.display = 'inline-block';
        area.classList.add('has-image');
      };
      reader.readAsDataURL(file);
    };

    removeBtn.onclick = function(e) {
      e.stopPropagation();
      input.value = '';
      img.src = '';
      preview.style.display = 'none';
      placeholder.style.display = 'block';
      area.classList.remove('has-image');
    };

    area.ondragover = function(e) { e.preventDefault(); area.style.borderColor = 'var(--primary)'; };
    area.ondragleave = function() { area.style.borderColor = ''; };
    area.ondrop = function(e) {
      e.preventDefault();
      area.style.borderColor = '';
      var file = e.dataTransfer.files[0];
      if (file) {
        var dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change'));
      }
    };
  },

  async generate() {
    console.log('[DEBUG] generate() called');
    var isImageMode = document.getElementById('tabImageBtn').classList.contains('active');
    console.log('[DEBUG] isImageMode:', isImageMode);
    var level = document.getElementById('levelSelect').value;
    console.log('[DEBUG] level:', level);

    if (!isImageMode) {
      var topic = document.getElementById('topicInput').value.trim();
      console.log('[DEBUG] topic:', JSON.stringify(topic));
      if (!topic || topic.length < 3) {
        document.getElementById('topicInput').focus();
        document.getElementById('topicInput').style.borderColor = '#ef4444';
        setTimeout(function() { document.getElementById('topicInput').style.borderColor = ''; }, 2000);
        return;
      }
    } else {
      var imageInput = document.getElementById('imageInput');
      console.log('[DEBUG] imageInput element:', imageInput);
      console.log('[DEBUG] imageInput.files:', imageInput ? imageInput.files : 'null');
      console.log('[DEBUG] imageInput.files[0]:', imageInput && imageInput.files ? imageInput.files[0] : 'null');
      if (!imageInput || !imageInput.files || !imageInput.files[0]) {
        alert('Please select an image first.');
        return;
      }
    }

    this.loading = true;
    document.getElementById('generateBtn').disabled = true;
    document.getElementById('generateBtn').textContent = '⏳ Generating...';
    document.getElementById('skeletonArea').style.display = 'block';
    document.getElementById('errorArea').style.display = 'none';

    // Show periodic status updates for long generations
    var statusTimer = setTimeout(function() {
      var btn = document.getElementById('generateBtn');
      if (btn && btn.disabled) btn.textContent = '⏳ Still generating... (this takes 2-10 minutes for images)';
    }, 15000);
    var statusTimer2 = setTimeout(function() {
      var btn = document.getElementById('generateBtn');
      if (btn && btn.disabled) btn.textContent = '⏳ AI is processing... almost there';
    }, 360000);

    try {
      var body, url;
      if (isImageMode) {
        var file = imageInput.files[0];
        var reader = new FileReader();
        var base64 = await new Promise(function(resolve, reject) {
          reader.onload = function(e) { resolve(e.target.result.split(',')[1]); };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        body = JSON.stringify({ image: base64, mimeType: file.type, level: level });
        url = API_BASE + '/api/generate-from-image';
      } else {
        body = JSON.stringify({ topic: topic, level: level });
        url = API_BASE + '/api/generate';
      }

      console.log('[DEBUG] fetch to:', url);
      console.log('[DEBUG] request body size:', body.length);

      // Timeout: 720s for image (VL + text gen + retries), 300s for text (matches backend GENERATE_TOTAL_TIMEOUT_MS)
      var timeoutMs = isImageMode ? 720000 : 300000;
      var controller = new AbortController();
      var timer = setTimeout(function() { controller.abort(); }, timeoutMs);

      var res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        signal: controller.signal
      });
      clearTimeout(timer);
      console.log('[DEBUG] response status:', res.status);

      var json = await res.json();
      console.log('[DEBUG] response JSON keys:', Object.keys(json));
      console.log('[DEBUG] full error response:', JSON.stringify(json, null, 2));

      if (!json.success) {
        var errMsg = json.error && json.error.message || 'Generation failed';
        // Attach validation details for richer error display
        if (json.error && json.error.details && json.error.details.errors) {
          errMsg += '\n\nValidation errors (' + json.error.details.errors.length + '):\n' + json.error.details.errors.slice(0, 20).join('\n');
          console.error('[DEBUG] validation errors:', json.error.details.errors);
        }
        if (json.error && json.error.details && json.error.details.repairs && json.error.details.repairs.length > 0) {
          errMsg += '\n\nAuto-repair attempts: ' + json.error.details.repairs.join(', ');
        }
        throw new Error(errMsg);
      }

      this.lesson = json.data.lesson;
      this.render(json.data.lesson, json.data.id);

    } catch (err) {
      console.log('[DEBUG] generate() caught error:', err.message, err.name, err.stack);
      var msg = err.message;
      if (err.name === 'AbortError') msg = 'Request timed out. The AI took too long to respond. Please try again.';
      else if (msg === 'Failed to fetch') msg = 'Cannot connect to the API server. Make sure the Worker is running on port 8787.';
      document.getElementById('skeletonArea').style.display = 'none';
      // Show error visibly even if render() already hid #createScreen
      document.getElementById('errorArea').style.display = 'block';
      // Convert newlines to <br> for rich error display (validation details etc.)
      document.getElementById('errorMessage').innerHTML = msg.replace(/\n/g, '<br>').replace(/  /g, '&nbsp;&nbsp;');
      document.getElementById('createScreen').style.display = 'block';
      document.getElementById('lessonView').style.display = 'none';
      console.log('[RENDER] Error displayed, createScreen re-shown, lessonView hidden');
    } finally {
      console.log('[DEBUG] generate() finally block');
      clearTimeout(statusTimer);
      clearTimeout(statusTimer2);
      this.loading = false;
      document.getElementById('generateBtn').disabled = false;
      document.getElementById('generateBtn').textContent = '✨ Generate Lesson';
    }
  },

  render(data, id) {
    console.log('[RENDER] render() called, data keys:', Object.keys(data));
    console.log('[RENDER] lesson ID:', id);
    console.log('[RENDER] meta:', JSON.stringify(data.meta));
    console.log('[RENDER] hook:', data.hook ? 'present (' + (data.hook.title_en || 'no title') + ')' : 'MISSING');
    console.log('[RENDER] thinking:', Array.isArray(data.thinking) ? data.thinking.length + ' items' : typeof data.thinking);
    console.log('[RENDER] vocab:', Array.isArray(data.vocab) ? data.vocab.length + ' items' : typeof data.vocab);
    console.log('[RENDER] dialogue:', Array.isArray(data.dialogue) ? data.dialogue.length + ' lines' : typeof data.dialogue);
    console.log('[RENDER] exercises:', data.exercises ? Object.keys(data.exercises) : 'MISSING');

    document.getElementById('createScreen').style.display = 'none';
    document.getElementById('lessonView').style.display = 'block';
    document.getElementById('mainContent').innerHTML = '';

    const sectionMap = {
      meta: 'data.meta=' + (data.meta ? 'present' : 'MISSING'),
      hook: 'data.hook=' + (data.hook ? 'present' : 'MISSING'),
      thinking: 'data.thinking=' + (Array.isArray(data.thinking) ? data.thinking.length + ' items' : typeof data.thinking),
      vocab: 'data.vocab=' + (Array.isArray(data.vocab) ? data.vocab.length + ' items' : typeof data.vocab),
      dialogueScenes: 'data.dialogueScenes=' + (Array.isArray(data.dialogueScenes) ? data.dialogueScenes.length + ' items' : typeof data.dialogueScenes),
      dialogue: 'data.dialogue=' + (Array.isArray(data.dialogue) ? data.dialogue.length + ' items' : typeof data.dialogue),
      explain: 'data.explain=' + (Array.isArray(data.explain) ? data.explain.length + ' items' : typeof data.explain),
      grammar: 'data.grammarMeta=' + (data.grammarMeta ? 'present' : 'MISSING') + ', data.grammar=' + (Array.isArray(data.grammar) ? data.grammar.length + ' items' : typeof data.grammar),
      exercises: 'data.exercises=' + (data.exercises ? Object.keys(data.exercises).join(',') : 'MISSING'),
      speaking: 'static',
      review: 'static',
      smartFeedback: 'data.smartFeedback=' + (data.smartFeedback ? 'present' : 'MISSING')
    };
    console.log('[RENDER] section availability:', JSON.stringify(sectionMap, null, 2));
    const sections = [
      ['meta', () => Sections.meta(data.meta)],
      ['hook', () => Sections.hook(data.hook)],
      ['thinking', () => Sections.thinking(data.thinking)],
      ['vocab', () => Sections.vocab(data.vocab)],
      ['dialogue', () => Sections.dialogue(data.dialogue)],
      ['dialogueScenes', () => Sections.dialogueScenes(data.dialogueScenes)],
      ['explain', () => Sections.explain(data.explain)],
      ['grammar', () => Sections.grammar(data.grammarMeta, data.grammar)],
      ['exercises', () => Sections.exercises(data.exercises, data.vocab)],
      ['speaking', () => Sections.speaking()],
      ['review', () => Sections.review()],
      ['smartFeedback', () => Sections.smartFeedback(data.smartFeedback)]
    ];
    console.log('[RENDER] section pipeline has', sections.length, 'entries');

    let hasError = false;
    for (const [name, fn] of sections) {
      try {
        console.log('[RENDER] executing section:', name);
        fn();
        console.log('[RENDER] section OK:', name);
      } catch (err) {
        hasError = true;
        console.error(`[RENDER] Section "${name}" FAILED:`, err.message, err.stack);
        try {
          const fallback = mkEl('div'); fallback.className = 'section section-error';
          fallback.innerHTML = `<div class="section-header" style="opacity:.5"><div class="section-icon">⚠️</div><div><div class="section-title">${name} — Unavailable</div><div class="section-subtitle">${esc(err.message)}</div></div></div>`;
          $('#mainContent').appendChild(fallback);
        } catch (fbErr) {
          console.error('[RENDER] Even fallback rendering failed for section', name, fbErr);
        }
      }
    }

    if (hasError) {
      try {
        const banner = mkEl('div'); banner.className = 'section';
        banner.innerHTML = `<div class="card" style="text-align:center;background:rgba(245,158,11,.08);border:2px solid var(--warning)"><div style="font-size:40px">⚠️</div><h3>Partial Render</h3><p style="color:var(--text-soft);margin-top:8px">Some sections couldn't be displayed. The rest of the lesson is available below.</p></div>`;
        $('#mainContent').prepend(banner);
      } catch (be) {
        console.error('[RENDER] Partial render banner failed:', be);
      }
    }

    SmartFeedback.init(data);
    Navigation.init();
    Speech.init();
    AutoFocus.init();
    UI.Translation.apply();
    UI.Settings.sync();

    setTimeout(() => {
      $('#mainContent').classList.add('lesson-visible');
    }, 50);
  }
};


// ============================
// 2. SECTIONS — pure render
// ============================

const Sections = {
  meta(d) {
    if (!d) { console.log('[RENDER] meta: no data, skipping'); return; }
    console.log('[RENDER] meta: title=' + d.pageTitle + ', icon=' + d.brandIcon + ', brand=' + d.brandTitle);
    document.title = d.pageTitle;
    document.getElementById('brandIcon').textContent = d.brandIcon;
    document.getElementById('brandTitle').textContent = d.brandTitle;

    const icon = encodeURIComponent(d.brandIcon);
    const svg = `data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>${icon}</text></svg>`;
    let link = document.querySelector('link[rel="icon"]');
    if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link); }
    link.href = svg;
    let appleLink = document.getElementById('dynamicAppleIcon');
    if (appleLink) appleLink.href = svg;

    // Update OG / Twitter meta
    var ogTitle = document.getElementById('ogTitle');
    if (ogTitle) ogTitle.setAttribute('content', d.pageTitle || '');
    var twTitle = document.getElementById('twitterTitle');
    if (twTitle) twTitle.setAttribute('content', d.pageTitle || '');

    // Update splash
    var sIcon = document.getElementById('splashIcon');
    var sTitle = document.getElementById('splashTitle');
    if (sIcon) sIcon.textContent = d.brandIcon || '📚';
    if (sTitle) sTitle.textContent = d.brandTitle || '';
  },

  hook(d) {
    if (!d) return;
    console.log('[RENDER] hook section, payload keys:', Object.keys(d));
    const el = mkEl('section'); el.className = 'section'; el.id = 'hook';
    el.dataset.stageName = 'Introduction'; el.dataset.stageIcon = '🎬';
    el.innerHTML = `
      <div class="hero">
        <div class="hero-emojis">${guard(d.emojis, '📚')}</div>
        <h1>${esc(guard(d.title_en, 'Lesson'))}</h1>
        <p class="hero-sub">${esc(guard(d.title_zh, ''))}</p>
        <div class="hero-tagline">${esc(guard(d.tagline, ''))}</div>
      </div>
      <div class="compare-grid">${guardArr(d.compare).slice(0,2).map(c => `
        <div class="compare-card ${esc(guard(c.type,''))}">
          <span class="compare-emoji">${c.emoji || '📌'}</span>
          <div class="compare-title">${esc(guard(c.en,''))}</div>
          <div class="compare-zh">${esc(guard(c.zh,''))}</div>
        </div>`).join('')}
      </div>`;
    $('#mainContent').appendChild(el);
  },

  thinking(arr) {
    arr = guardArr(arr).slice(0,5);
    if (arr.length === 0) { console.log('[RENDER] thinking: no data'); return; }
    console.log('[RENDER] thinking:', arr.length, 'questions');
    const el = section('💡', 'Thinking Questions', '预读思考问题');
    el.id = 'thinking'; el.dataset.stageName = 'Thinking'; el.dataset.stageIcon = '💡';
    el.innerHTML += `<div class="q-grid">${arr.map((q, i) => `
      <div class="q-card">
        <div class="q-number">${i+1}</div>
        <span class="q-emoji">${q.emoji || '❓'}</span>
        <div class="en-text">${esc(guard(q.en,''))}</div>
        <div class="zh-text">${esc(guard(q.zh,''))}</div>
      </div>`).join('')}</div>`;
    $('#mainContent').appendChild(el);
  },

  vocab(arr) {
    arr = guardArr(arr).slice(0,35);
    if (arr.length === 0) { console.log('[RENDER] vocab: no data'); return; }
    console.log('[RENDER] vocab:', arr.length, 'items, first:', arr[0]?.en);
    const el = section('📚', 'Vocabulary', '词汇 — 点击卡片显示翻译');
    el.id = 'vocab'; el.dataset.stageName = 'Vocabulary'; el.dataset.stageIcon = '📚';
    el.innerHTML += `<div class="card">
      <div id="vocabAudioPlayer" dir="ltr" role="region" aria-label="Vocabulary Player">
        <div class="vap-top">
          <div class="vap-controls">
            <button type="button" class="vap-btn vap-btn-play" id="vapPlayBtn" aria-label="Play"></button>
            <button type="button" class="vap-btn vap-btn-stop" id="vapStopBtn" aria-label="Stop">
              <svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"></path></svg>
            </button>
          </div>
          <div class="vap-meta">
            <div class="vap-title"><span class="vap-title-ar">Vocabulary</span><span class="vap-title-zh">词汇播放</span></div>
            <div class="vap-counter"><span id="vapCurIdx">0</span><span class="vap-sep">/</span><span id="vapTotal">0</span></div>
          </div>
        </div>
        <div class="vap-bottom">
          <span class="vap-time" id="vapCurTime">0:00</span>
          <input type="range" class="vap-slider" id="vapSlider" min="0" max="0" step="1" value="0" aria-label="Playback progress">
          <span class="vap-time vap-time-total" id="vapTotalTime">0:00</span>
        </div>
      </div>
      <button class="btn btn-primary reveal-all-btn" onclick="$$('.vocab-card').forEach(c=>c.classList.add('revealed'))">🔓 Reveal All</button>
      <div class="vocab-grid">${arr.map(v => `
        <div class="vocab-card" onclick="this.classList.toggle('flipped')">
          <span class="vocab-tag">${esc(guard(v.type, ''))}</span>
          <div class="vocab-emoji">${_safeEmoji(v.emoji)}</div>
          <div class="vocab-en">${esc(_safeEn(guard(v.en,'')))}</div>
          <div class="vocab-zh-hidden">${esc(_safeZh(guard(v.zh,'')))}</div>
          <button class="vocab-speak-btn" onclick="event.stopPropagation();Speech.speakVocabWord(this,'${esc(_safeEn(guard(v.en,'')))}')" aria-label="Pronounce word">
            <svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
          </button>
        </div>`).join('')}</div></div>`;
    $('#mainContent').appendChild(el);
    if (typeof window.initVAP === 'function') setTimeout(window.initVAP, 50);
  },

  dialogueScenes(arr) {
    arr = guardArr(arr);
    if (arr.length === 0) { console.log('[RENDER] dialogueScenes: no data'); }
    const el = $('#mainContent').querySelector('#reading');
    if (!el) return;
    const c = el.querySelector('#dialogueScenesContainer');
    if (c) c.innerHTML = arr.slice(0,2).map(s => `
      <div class="scene-img" style="background:${s.gradient || 'linear-gradient(135deg,#667eea,#764ba2)'}">
        ${s.emoji || '🏪'}
        <div class="scene-label">${esc(guard(s.label_en,''))} · ${esc(guard(s.label_zh,''))}</div>
      </div>`).join('');
  },

  dialogue(arr) {
    arr = guardArr(arr);
    if (arr.length === 0) return;
    console.log('[RENDER] dialogue section, lines:', arr.length);
    const el = mkEl('section'); el.className = 'section'; el.id = 'reading';
    el.dataset.stageName = 'Reading'; el.dataset.stageIcon = '📖';
    el.innerHTML = sectionHeader('📖', 'Dialogue — Look, Listen & Repeat', '对话 · 看 · 听 · 重复') + `
      <div class="card">
        <div class="reveal-sticky"><div class="reveal-btns">
          <button class="btn btn-primary" onclick="revealAllDialogue()">🔓 Reveal All</button>
          <button class="btn btn-ghost" onclick="resetDialogue()">🔄 Reset</button>
          <button class="btn btn-ghost" onclick="revealNextLine()">➡️ Next Line</button>
          <button class="btn btn-ghost" id="playDialogueBtn" onclick="playRevealedDialogue()">🔊 Listen</button>
        </div></div>
        <div class="dialogue-container">
          <div id="dialogueScenesContainer"></div>
          <div class="dialogue-box" id="dialogueBox">${arr.map((l, i) => `
            <div class="dial-line ${esc(guard(l.role,''))}${i===0?' revealed':''}">
              <span class="speaker ${esc(guard(l.role,''))}">${esc(guard(l.speaker,''))}</span>
              <div class="en-text">${esc(guard(l.en,''))}</div>
              <div class="zh-text">${esc(guard(l.zh,''))}</div>
            </div>`).join('')}</div>
        </div>
      </div>`;
    $('#mainContent').appendChild(el);
  },

  explain(arr) {
    arr = guardArr(arr).slice(0,6);
    if (arr.length === 0) { console.log('[RENDER] explain: no data'); return; }
    console.log('[RENDER] explain:', arr.length, 'items');
    const el = section('🔍', 'Detailed Explanation', '逐句详细讲解');
    el.id = 'explain'; el.dataset.stageName = 'Explanation'; el.dataset.stageIcon = '🔍';
    el.innerHTML += `<div class="card">${arr.map(e => `
      <div class="explain-block">
        <div class="explain-label">${esc(guard(e.label,''))}</div>
        <div class="en-text">${esc(guard(e.en,''))}</div>
        <div class="zh-text">${esc(guard(e.zh,''))}</div>
        <div class="explain-note">${esc(guard(e.note,''))}</div>
      </div>`).join('')}</div>`;
    $('#mainContent').appendChild(el);
  },

  grammar(meta, arr) {
    if (!meta) { meta = { title: 'Grammar', subtitle: '' }; }
    arr = guardArr(arr);
    console.log('[RENDER] grammar:', arr.length, 'items, title:', meta.title);
    const el = section('🔤', meta.title || 'Grammar', meta.subtitle || '');
    el.id = 'grammar'; el.dataset.stageName = 'Grammar'; el.dataset.stageIcon = '🔤';
    el.innerHTML += arr.map(g => g.type === 'pattern' ? `
      <div class="formula-box">
        <div class="grammar-formula-title">${esc(guard(g.title,''))}</div>
        <div class="formula">${esc(guard(g.en,''))}</div>
        <div class="grammar-formula-zh">${esc(guard(g.zh,''))}</div>
      </div>` : `
      <div>
        <h3 class="grammar-title">${esc(guard(g.title,''))}</h3>
        <div class="conjugation-grid">${guardArr(g.items).slice(0,6).map(i => `
          <div class="conj-card">
            <div class="conj-pronoun">${esc(guard(i.pronoun,''))}</div>
            <div class="conj-verb">${esc(guard(i.verb,''))}</div>
            <div class="conj-zh">${esc(guard(i.zh,''))}</div>
          </div>`).join('')}</div>
      </div>`).join('');
    $('#mainContent').appendChild(el);
  },

  exercises(ex, vocab) {
    ex = ex || {};
    const count = countExercises(ex);
    console.log('[RENDER] exercises: ex keys:', Object.keys(ex), 'count:', count);
    const el = section('✏️', `Exercises${count > 0 ? ' · ' + count + ' exercises' : ''}`, count > 0 ? `${count} exercises` : '练习');
    el.id = 'exercises'; el.dataset.stageName = 'Exercises'; el.dataset.stageIcon = '✏️';
    el.innerHTML += '<div id="exercisesContainer"><div class="card" style="text-align:center;padding:40px"><p>✏️ Exercises loading...</p></div></div>';
    $('#mainContent').appendChild(el);

    let rendered = false;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !rendered) {
        rendered = true;
        document.getElementById('exercisesContainer').innerHTML = Exercises.render(ex, vocab);
        observer.disconnect();
      }
    }, { rootMargin: '300px 0px' });
    observer.observe(el);
  },

  speaking() {
    console.log('[RENDER] speaking section');
    const el = section('🗣️', 'Speaking · 3 Levels', '口语练习 — 3个级别');
    el.id = 'speaking'; el.dataset.stageName = 'Speaking'; el.dataset.stageIcon = '🗣️';
    el.innerHTML += `<div id="speakingContainer">${Exercises.renderSpeaking()}</div>`;
    $('#mainContent').appendChild(el);
  },

  review() {
    console.log('[RENDER] review section');
    const el = mkEl('section'); el.className = 'section'; el.id = 'review';
    el.dataset.stageName = 'Review'; el.dataset.stageIcon = '🧠';
    el.innerHTML = `
      <div class="section-header"><div class="section-icon">🧠</div><div><div class="section-title">Review & Score</div><div class="section-subtitle">复习与得分</div></div></div>
      <div class="score-hero">
        <div class="score-circle" id="scoreCircle">0</div>
        <div class="stars" id="starsDisplay">☆☆☆☆☆</div>
        <h2 id="scoreTitle">Start!</h2>
        <p id="scoreMsg">Calculate your score</p>
        <button class="btn" style="background:#fff;color:var(--primary);margin-top:20px" onclick="Exercises.calcScore()">🎯 Calculate My Score</button>
      </div>
      <div class="card" style="margin-top:24px"><h3 style="margin-bottom:14px">💭 Reflection</h3>
        <div style="display:grid;gap:12px">
          <div class="q-card" style="cursor:default"><span class="q-emoji">✅</span><div class="en-text" style="font-size:20px">What did you learn today?</div><div class="zh-text">你今天学到了什么？</div>
            <textarea style="width:100%;margin-top:10px;padding:12px;border-radius:10px;border:2px solid rgba(102,126,234,.2);background:transparent;color:var(--text);font-family:Inter,sans-serif;font-size:16px" rows="2" placeholder="Write here... · 在这里写..."></textarea></div>
          <div class="q-card" style="cursor:default"><span class="q-emoji">⭐</span><div class="en-text" style="font-size:20px">Which exercise was most fun?</div><div class="zh-text">哪个练习最有趣？</div></div>
          <div class="q-card" style="cursor:default"><span class="q-emoji">🎯</span><div class="en-text" style="font-size:20px">What will you practice next?</div><div class="zh-text">接下来你会练习什么？</div></div>
        </div></div>
      <div class="card" style="margin-top:24px;text-align:center;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff">
        <div style="font-size:60px">🎉</div><h2 class="en-text" style="font-size:32px;margin:10px 0;color:#fff">Well Done!</h2>
        <p class="zh-text show" style="color:rgba(255,255,255,.9);font-size:20px">做得好！你已经完成了这节课。继续学习英语吧！</p>
        <p class="en-text" style="margin-top:6px;opacity:.95;font-size:18px;color:#fff">You have completed the lesson. Keep learning English!</p></div>`;
    $('#mainContent').appendChild(el);
  },

  smartFeedback(fb) {
    if (!fb || typeof fb !== 'object') return;
    const entries = Object.entries(fb).filter(([, v]) => v && v.en);
    if (entries.length === 0) return;
    const el = mkEl('div'); el.className = 'card'; el.style.marginTop = '20px';
    el.innerHTML = `<h3 style="margin-bottom:14px">💡 Smart Feedback</h3>${entries.map(([, f]) => `
      <div class="explain-block"><div class="en-text">${esc(guard(f.en,''))}</div><div class="zh-text">${esc(guard(f.zh,''))}</div></div>`).join('')}`;
    const review = document.getElementById('review');
    if (review) review.appendChild(el);
  }
};


// ============================
// 3. EXERCISES — engine
// ============================

const Exercises = {
  correct: 0, wrong: 0,

  render(ex, vocab) {
    this.correct = 0; this.wrong = 0;
    this._exNum = 0;
    window.__exNum = 0;
    let html = '';
    console.log('[EXERCISES] render() called, ex keys:', Object.keys(ex || {}), 'vocab length:', (vocab || []).length);
    ExerciseRegistry.getAll().forEach(mod => {
      try {
        const data = ex[mod.TYPE];
        console.log('[EXERCISES] module:', mod.TYPE, 'data:', data ? 'present' : 'empty');
        if (mod.render) html += mod.render(data, ex, vocab) || '';
      } catch (e) {
        console.error('[EXERCISES] module render failed:', mod.TYPE, e.message);
      }
    });
    const renderCalls = [
      ['renderDrag', () => this.renderDrag(ex.dragWords, ex.dragZones)],
      ['renderMatching', () => this.renderMatching(vocab)],
      ['renderOrder', () => this.renderOrder(ex.orderWords, ex.orderTarget)],
      ['renderCorrectError', () => this.renderCorrectError(ex.correctError)],
      ['renderRewrite', () => this.renderRewrite(ex.rewrite)],
      ['renderGuidedWriting', () => this.renderGuidedWriting(ex.guidedWriting)],
      ['renderListening', () => this.renderListening(ex.listeningExercise)],
      ['renderSpeed', () => this.renderSpeed(ex.speedChallenge)],
      ['renderMultiStep', () => this.renderMultiStep(ex.multiStep)],
      ['renderParagraph', () => this.renderParagraph(ex.paragraph)],
      ['renderContext', () => this.renderContext(ex.contextAnalysis)],
      ['renderScenario', () => this.renderScenario(ex.scenario)],
      ['renderVisual', () => this.renderVisual(ex.visualChoice)],
      ['renderSentenceTransform', () => this.renderSentenceTransform(ex.sentenceTransform)],
      ['renderChallenge', () => this.renderChallenge(ex.challenge)],
      ['renderSelectWords', () => this.renderSelectWords(ex.selectWords, vocab)],
      ['renderDialogueFill', () => this.renderDialogueFill(ex.dialogueFill)],
      ['renderPatternFill', () => this.renderPatternFill(ex.patternFill)]
    ];
    for (const [name, fn] of renderCalls) {
      try {
        const result = fn();
        if (result) html += result;
      } catch (e) {
        console.error('[EXERCISES] render failed:', name, e.message);
      }
    }
    return html;
  },

  renderDrag(words, zones) { return exBox(++this._exNum, 'Drag & Classify', '拖拽分类', `
    <div class="drag-container">
      ${zones.map(z => `<div class="drag-zone" data-accept="${esc(z.accept)}"><div class="drag-zone-title">${z.emoji} ${esc(z.en)} · ${esc(z.zh)}</div></div>`).join('')}
    </div>
    <div class="drag-source" style="margin-top:12px">${words.map(w => `<span class="drag-item" draggable="true" data-cat="${esc(w.cat)}">${esc(w.en)}</span>`).join('')}</div>`) },

  renderMatching(vocab) {
    const items = vocab.slice(0, 5);
    return exBox(++this._exNum, 'Match Words', '配对', `
    <div class="match-grid">
      <div class="match-col" id="matchLeft">${items.map((v, i) => `<div class="match-item" data-key="${i}" onclick="Exercises.match(this,${i})">${v.emoji} ${esc(v.en)}</div>`).join('')}</div>
      <div class="match-col" id="matchRight">${items.map((v, i) => `<div class="match-item" data-key="${i}" onclick="Exercises.match(this,${i})">${esc(v.zh)}</div>`).join('')}</div>
    </div>`);
  },

  matchSel: null,
  match(el, key) {
    if (el.classList.contains('matched')) return;
    if (!this.matchSel) { this.matchSel = { el, key }; el.classList.add('selected'); return; }
    if (this.matchSel.el === el) { el.classList.remove('selected'); this.matchSel = null; return; }
    if (this.matchSel.key === key) {
      this.matchSel.el.classList.remove('selected'); this.matchSel.el.classList.add('matched'); el.classList.add('matched');
      this.correct++;
    } else {
      [this.matchSel.el, el].forEach(e => e.classList.add('wrong'));
      setTimeout(() => [this.matchSel.el, el].forEach(e => e.classList.remove('wrong')), 600);
      this.wrong++;
    }
    this.matchSel = null;
  },

  renderOrder(words, target) { return exBox(++this._exNum, 'Word Order', '排序', `
    <div class="order-container" id="orderPool" style="display:flex;flex-wrap:wrap;gap:8px;min-height:60px">${words.sort(()=>Math.random()-.5).map(w => `<span class="order-word" draggable="true">${esc(w)}</span>`).join('')}</div>
    <div class="order-target">Target: <em>${esc(target)}</em></div>
    <div class="order-hint">💡 Drag to reorder</div>
    <button class="check-btn" onclick="Exercises.checkOrder(this)">✅ Check Order</button>`) },

  renderCorrectError(ce) { if (!ce) return ''; return exBox(++this._exNum, 'Correct the Error', '改错', `
    <div class="fill-sentence" style="background:rgba(239,68,68,.08);padding:14px;border-radius:12px">${esc(ce.sentence)}</div>
    <div class="mcq-options" style="margin-top:12px">${ce.options.map(o => `
      <button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div>`) },

  renderRewrite(rw) { return exBox(++this._exNum, 'Rewrite', '改写', `
    <div class="fill-sentence">${esc(rw.sentence)} → <input class="fill-input" data-answer="${esc(rw.answer)}" style="min-width:150px"></div>
    <div class="order-target">${esc(rw.instruction)}</div>
    <button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button>`) },

  renderGuidedWriting(gw) { return exBox(++this._exNum, 'Guided Writing', '引导写作', gw.sentences.map(s => `
    <div class="fill-sentence">${esc(s.prefix)} <input class="fill-input" style="min-width:140px" placeholder="${esc(s.placeholder)}"></div>`).join('')) },

  renderListening(le) { if (!le) return ''; var txt = esc(le.text.replace(/'/g, "\\'")); return exBox(++this._exNum, 'Listening', '听力', `
    <div class="exercise-speaker" onclick="playAudio(this,'${txt}')">
      <div class="exercise-speaker-icon">🔊</div>
      <div class="exercise-speaker-hint">Click to listen</div>
    </div>
    <div class="mcq-options">${le.options.map((o, i) => `
      <button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div>`) },

  renderSpeed(sc) { if (!sc) return ''; return exBox(++this._exNum, '⚡ Speed Challenge', '速度挑战 — 30秒', `
    <div class="speed-controls"><span class="speed-timer" id="speedTimer">30s</span><span class="speed-score" id="speedScore">Score: 0</span><button class="btn btn-primary" onclick="Exercises.startSpeed()">🚀 Start</button></div>
    <div class="speed-question" id="speedQuestion">Press Start to begin!</div>
    <div class="speed-options" id="speedOpts"></div>`) },

  renderMultiStep(ms) { if (!ms) return ''; return exBox(++this._exNum, 'Multi-Step Thinking', '多步推理', `
    <div class="exercise-story-box"><div class="en-text">${esc(ms.story.en)}</div><div class="zh-text">${esc(ms.story.zh)}</div></div>
    ${ms.questions.map((q, i) => `
      <div style="margin-top:16px"><div class="en-text" style="font-weight:700">${esc(q.en)}</div>
      <div class="mcq-options">${q.options.map(o => `<button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div></div>`).join('')}`) },

  renderParagraph(p) { if (!p) return ''; let idx=0; return exBox(++this._exNum, 'Complete the Paragraph', '完成段落', `
    <div class="fill-sentence">${p.sentence.replace(/___/g, () => `<input class="fill-input" data-answer="${esc(p.answers[idx++])}" style="min-width:120px">`)}</div>
    <button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button>`) },

  renderContext(ca) { if (!ca) return ''; return exBox(++this._exNum, 'Context Analysis', '语境分析', `
    <div class="exercise-context-box"><pre style="font-family:inherit;direction:ltr">${esc(ca.dialogue)}</pre></div>
    <div class="context-question">${esc(ca.question)}</div>
    <div class="mcq-options">${ca.options.map(o => `<button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div>`) },

  renderScenario(s) { if (!s) return ''; return exBox(++this._exNum, 'Scenario', '情景对话', `
    <div class="exercise-scenario-box"><div class="en-text">${esc(s.setup_en)}</div><div class="zh-text">${esc(s.setup_zh)}</div></div>
    <div class="context-question">${esc(s.question)}</div>
    <div class="mcq-options">${s.options.map(o => `<button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div>`) },

  renderVisual(vc) { if (!vc) return ''; return exBox(++this._exNum, 'Visual Choice', '看图选择', `
    <div class="visual-emoji">${vc.emoji}</div>
    <div class="mcq-options">${vc.options.map(o => `<button class="mcq-opt" onclick="Exercises.mcq(this,${o.correct})"><span class="en-text">${esc(o.en)}</span></button>`).join('')}</div>`) },

  renderSentenceTransform(st) { if (!st) return ''; return exBox(++this._exNum, 'Sentence Transformation', '句型转换', `
    <div class="fill-sentence">${st.sentence}</div>
    <button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button>`) },

  renderChallenge(ch) { if (!ch) return ''; let idx=0; return exBox(++this._exNum, 'Challenge', '挑战', `
    <div class="exercise-challenge" style="padding:16px;border-radius:14px">
      <div class="zh-text">${esc(ch.zh)}</div>
      <div class="fill-sentence" style="margin-top:12px">${ch.sentence.replace(/___/g, () => `<input class="fill-input" data-answer="${esc(ch.answers[idx++])}" style="min-width:120px">`)}</div>
      <button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button></div>`) },

  renderSelectWords(sw, vocab) { if (!sw) return ''; return exBox(++this._exNum, 'Select Words', '选择单词', `
    <div class="context-question">${esc(sw.title_en)} · ${esc(sw.title_zh)}</div>
    <div class="chip-grid">${vocab.slice(0, 8).map((v, i) => `<span class="chip" data-iscorrect="${i < 4}" onclick="Exercises.tapSelect(this,${i < 4})">${esc(v.en)}</span>`).join('')}</div>`) },

  tapSelect(el, correct) { if (el.dataset.picked) return; el.dataset.picked = '1'; el.classList.add(correct ? 'tap-correct' : 'tap-wrong'); if (correct) this.correct++; else this.wrong++; },

  renderDialogueFill(df) { if (!df) return ''; return exBox(++this._exNum, 'Dialogue Fill', '对话填空', df.lines.map(l => `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:8px">
      <strong>${esc(l.speaker)}:</strong>
      <span class="fill-sentence">${l.text.replace('___', `<input class="fill-input" data-answer="${esc(l.answer)}" style="min-width:100px">`)}</span>
    </div>`).join('') + `<button class="check-btn" onclick="Exercises.checkFill(this)">✅ Check</button>`) },

  renderPatternFill(pf) { if (!pf) return ''; return exBox(++this._exNum, 'Pattern Fill', '动词变位', pf.lines.map(l => `
    <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">
      <strong>${esc(l.pronoun)}</strong>
      <span style="font-weight:700;color:var(--primary)">${esc(l.verb)}</span>
      <span>${esc(l.suffix)}</span>
    </div>`).join('')) },

  // Speaking — faithful restoration of original 3-level classroom speaking flow
  renderSpeaking() {
    var dialogue = App.lesson && App.lesson.dialogue || [];
    var vocab = App.lesson && App.lesson.vocab || [];

    // Level 1: Guided — read aloud from actual dialogue (original uses dialogue[1] for a full sentence)
    var l1en = dialogue[1] ? dialogue[1].en : (dialogue[0] ? dialogue[0].en : 'Hello!');
    var l1zh = dialogue[1] ? dialogue[1].zh : (dialogue[0] ? dialogue[0].zh : '');
    var l1safe = esc(l1en.replace(/'/g, "\\'"));

    var h = '';
    h += '<div class="speak-level">' +
      '<div class="speak-level-title">🟢 Level 1 <span class="speak-badge easy">Guided</span></div>' +
      '<div class="speak-level-instruction">Read aloud:</div>' +
      '<div class="en-text speak-level-en">' + esc(l1en) + '</div>' +
      '<div class="zh-text">' + esc(l1zh) + '</div>' +
      '<button class="btn btn-primary speak-btn" onclick="Speech.speak(\'' + l1safe + '\')">🔊 Listen</button>' +
    '</div>';

    // Level 2: Semi-guided — build sentences from actual vocab chips
    var chips = vocab.slice(0, 9).map(function(v) {
      return '<span class="chip">' + esc(v.en) + '</span>';
    }).join('');
    h += '<div class="speak-level">' +
      '<div class="speak-level-title">🟡 Level 2 <span class="speak-badge mid">Semi-guided</span></div>' +
      '<div class="speak-level-instruction">Build the sentence:</div>' +
      '<div class="speak-chip-area">' + chips + '</div>' +
      '<div class="builder-output" id="builderOut">...</div>' +
      '<button class="btn btn-ghost" onclick="document.getElementById(\'builderOut\').textContent=\'...\'">🔄 Clear</button>' +
    '</div>';

    // Level 3: Free — confidence-based speaking tips via modal
    h += '<div class="speak-level">' +
      '<div class="speak-level-title">🔴 Level 3 <span class="speak-badge hard">Free</span></div>' +
      '<div class="speak-level-instruction">Speak freely — Choose confidence level:</div>' +
      '<div class="speak-level-btns">' +
        '<button class="btn btn-ghost" onclick="showSpeakTip(\'Start with the main idea, then explain\', \'从主要想法开始，然后解释它\')">😊 Confident</button>' +
        '<button class="btn btn-ghost" onclick="showSpeakTip(\'Use a simple sentence about the topic\', \'用关于主题的简单句子\')">🤔 Average</button>' +
        '<button class="btn btn-ghost" onclick="showSpeakTip(\'Try separate words about the topic\', \'尝试与主题相关的单词\')">😅 Shy</button>' +
      '</div>' +
      '<div class="speak-level-hint">💡 Tip: Idea → Explain → Conclusion</div>' +
    '</div>';

    return h;
  },

  // Score
  calcScore() {
    const total = this.correct + this.wrong;
    const pct = total === 0 ? 0 : Math.round(this.correct / total * 100);
    document.getElementById('scoreCircle').textContent = pct + '%';
    let stars = '☆☆☆☆☆', title = 'Try Again!', msg = 'Keep practicing!';
    if (pct >= 90) { stars = '★★★★★'; title = 'Excellent!'; msg = 'Perfect!'; }
    else if (pct >= 75) { stars = '★★★★☆'; title = 'Great!'; msg = 'Good job!'; }
    else if (pct >= 60) { stars = '★★★☆☆'; title = 'Good!'; msg = 'Well done!'; }
    else if (pct >= 40) { stars = '★★☆☆☆'; title = 'Not bad!'; msg = 'Try more!'; }
    else if (total > 0) { stars = '★☆☆☆☆'; title = 'Try harder'; msg = 'Practice more'; }
    document.getElementById('starsDisplay').textContent = stars;
    document.getElementById('scoreTitle').textContent = title;
    document.getElementById('scoreMsg').textContent = msg + ' (' + this.correct + ' correct · ' + this.wrong + ' wrong)';
  },

  // Dialogue reveal
  _revealIdx: 1,
  resetDialogue() { $$('.dial-line').forEach((l, i) => { l.classList.toggle('revealed', i === 0); }); this._revealIdx = 1; },
  revealNext() {
    const lines = $$('.dial-line:not(.revealed)');
    if (lines.length > 0) { lines[0].classList.add('revealed'); }
  },

  // Speed challenge
  speedIdx: 0, speedScore: 0, speedTimer: null, speedQs: [],
  startSpeed() {
    const v = App.lesson?.vocab || [];
    this.speedQs = v.slice(0,8).map((item, i) => {
      const wrong = v.filter((_,j) => j !== i).slice(0,3).map(x => x.en);
      const opts = [item.en, ...wrong].sort(() => Math.random() - 0.5);
      return { q: `"${item.zh}" = ?`, opts, ans: opts.indexOf(item.en) };
    });
    this.speedIdx = 0; this.speedScore = 0;
    let t = 30;
    document.getElementById('speedTimer').textContent = t + 's';
    document.getElementById('speedScore').textContent = 'Score: 0';
    this.showSpeedQ();
    clearInterval(this.speedTimer);
    this.speedTimer = setInterval(() => {
      t--;
      document.getElementById('speedTimer').textContent = t + 's';
      if (t <= 0) { clearInterval(this.speedTimer); document.getElementById('speedQuestion').innerHTML = '⏱️ Time\'s up! Score: <strong>' + this.speedScore + '</strong>'; document.getElementById('speedOpts').innerHTML = ''; }
    }, 1000);
  },
  showSpeedQ() {
    const q = this.speedQs[this.speedIdx % this.speedQs.length];
    document.getElementById('speedQuestion').textContent = q.q;
    const opts = document.getElementById('speedOpts'); opts.innerHTML = '';
    q.opts.forEach((o, i) => {
      const b = document.createElement('button'); b.className = 'mcq-opt';
      b.innerHTML = '<span class="en-text">' + esc(o) + '</span>';
      b.onclick = () => { if (i === q.ans) { this.speedScore++; this.correct++; } else this.wrong++;
        document.getElementById('speedScore').textContent = 'Score: ' + this.speedScore;
        this.speedIdx++; this.showSpeedQ(); };
      opts.appendChild(b);
    });
  },

  // Order check
  checkOrder(btn) {
    var ex = btn ? btn.closest('.exercise') : document.querySelector('.exercise');
    if (!ex) return;
    var fb = ex.querySelector('.feedback');
    if (!fb) { fb = document.createElement('div'); fb.className = 'feedback'; ex.appendChild(fb); }
    const words = [...$$('#orderPool .order-word')].map(w => w.textContent.trim());
    const got = words.join(' ');
    const target = document.querySelector('.order-target em')?.textContent || '';
    if (got.toLowerCase() === target.toLowerCase()) {
      this.correct++;
      fb.className = 'feedback show success';
      fb.innerHTML = '✅ Great!';
    } else {
      this.wrong++;
      fb.className = 'feedback show error';
      fb.innerHTML = '❌ Try Again! Expected: ' + esc(target);
    }
  }
};


// ============================
// 4. NAVIGATION
// ============================

const STAGE_ORDER = ['hook', 'thinking', 'vocab', 'reading', 'explain', 'grammar', 'exercises', 'speaking', 'review'];

const Navigation = {
  stages: [],
  currentIdx: 0,
  updateTimer: null,

  init() {
    this.stages = $$('.section').map(s => s.id);
    if (this.stages.length === 0) return;
    this.buildStepper();
    this.setupScrollSpy();
    this.updateStepper(0);
    // stepperWrap is hidden by CSS on both breakpoints (original behavior)
  },

  buildStepper() {
    const desktop = document.getElementById('stepperDesktop');
    const dots = document.getElementById('mobileDotsContainer');
    const tbDots = document.getElementById('tbDots');
    if (!desktop) return;
    desktop.innerHTML = '';
    if (dots) dots.innerHTML = '';
    if (tbDots) tbDots.innerHTML = '';
    this.stages.forEach((id, i) => {
      const sec = document.getElementById(id);
      const name = sec ? sec.dataset.stageName || id : id;
      const icon = sec ? sec.dataset.stageIcon || '📌' : '📌';
      const isLast = i === this.stages.length - 1;

      desktop.innerHTML += `
        <div class="step-item upcoming" role="button" tabindex="0" onclick="Navigation.goTo(${i})" aria-label="${name} - Stage ${i+1} of ${this.stages.length}">
          <div class="step-dot">${icon}</div>
          <div class="step-name">${name}</div>
        </div>${isLast ? '' : '<div class="step-line"></div>'}`;

      function makeDot(container) {
        if (!container) return;
        const dot = document.createElement('div');
        dot.className = 'mobile-dot';
        dot.setAttribute('role', 'button');
        dot.setAttribute('tabindex', '0');
        dot.onclick = function() { Navigation.goTo(i); };
        container.appendChild(dot);
      }
      makeDot(dots);
      makeDot(tbDots);
    });
  },

  setupScrollSpy() {
    const sections = $$('.section');
    const self = this;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const idx = self.stages.indexOf(entry.target.id);
          if (idx !== -1) {
            self.debouncedUpdate(idx);
            // Immediate section title update (matching original scroll spy timing)
            var sec = document.getElementById(entry.target.id);
            self.updateSectionTitle(sec);
            $$('.section').forEach(function(s) { s.classList.remove('focused'); });
            if (sec) sec.classList.add('focused');
          }
          const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
          const bar = document.getElementById('progressBar');
          if (bar) bar.style.width = pct + '%';
        }
      });
    }, { rootMargin: '-20% 0px -70% 0px' });
    sections.forEach(s => observer.observe(s));

    window.addEventListener('scroll', () => {
      const pct = window.scrollY / (document.body.scrollHeight - window.innerHeight) * 100;
      const bar = document.getElementById('progressBar');
      if (bar) bar.style.width = pct + '%';
    });
  },

  updateSectionTitle(sec) {
    if (!sec) return;
    var title = document.getElementById('currentSectionTitle');
    if (!title) return;
    var name = sec.dataset.stageName || 'Section';
    var icon = sec.dataset.stageIcon || '📌';
    var newText = icon + ' ' + name;
    if (title.textContent !== newText) {
      title.classList.add('fade');
      setTimeout(function() {
        title.textContent = newText;
        title.classList.remove('fade');
      }, 200);
    }
  },

  debouncedUpdate(index) {
    var self = this;
    clearTimeout(this.updateTimer);
    this.updateTimer = setTimeout(function() { self.updateStepper(index); }, 150);
  },

  updateStepper(index) {
    if (index < 0 || index >= this.stages.length) return;
    var sec = document.getElementById(this.stages[index]);
    if (!sec) return;
    this.currentIdx = index;
    var name = sec.dataset.stageName || 'Section';
    var icon = sec.dataset.stageIcon || '📌';

    // desktop stepper
    var items = $$('.stepper-desktop .step-item');
    var lines = $$('.stepper-desktop .step-line');
    items.forEach(function(item, i) {
      item.className = 'step-item';
      if (i < index) item.classList.add('completed');
      else if (i === index) item.classList.add('current');
      else item.classList.add('upcoming');
    });
    lines.forEach(function(line, i) {
      line.classList.toggle('completed', i < index);
    });

    // mobile stepper
    var mIcon = document.getElementById('mobileStageIcon');
    var mName = document.getElementById('mobileStageName');
    if (mIcon) mIcon.textContent = icon;
    if (mName) mName.textContent = name;
    var mDots = $$('.mobile-stage-dots .mobile-dot');
    mDots.forEach(function(dot, i) { dot.classList.toggle('current', i === index); });
    var tbDots = document.getElementById('tbDots');
    if (tbDots) { var tbDotEls = tbDots.querySelectorAll('.mobile-dot'); tbDotEls.forEach(function(dot, i) { dot.classList.toggle('current', i === index); }); }
    var prev = document.getElementById('mobilePrevBtn');
    var next = document.getElementById('mobileNextBtn');
    if (prev) prev.disabled = (index === 0);
    if (next) next.disabled = (index === this.stages.length - 1);
    var tbIcon = document.getElementById('tbIcon');
    var tbName = document.getElementById('tbName');
    if (tbIcon) tbIcon.textContent = icon;
    if (tbName) tbName.textContent = name;

    // focused section — for focus mode and visual emphasis
    $$('.section').forEach(function(s) { s.classList.remove('focused'); });
    if (sec) sec.classList.add('focused');
  },

  goTo(index) {
    if (index < 0 || index >= this.stages.length) return;
    this.updateStepper(index);
    var target = document.getElementById(this.stages[index]);
    if (target) {
      this.updateSectionTitle(target);
      var isMobile = window.innerWidth <= 900;
      var offset = isMobile ? 114 : 124;
      var pos = target.getBoundingClientRect().top + window.pageYOffset - offset - 20;
      window.scrollTo({ top: pos, behavior: 'smooth' });
    }
  }
};

// keyboard support for stepper
document.addEventListener('keydown', function(e) {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[role="button"]')) {
    e.target.closest('[role="button"]').click();
  }
});


// ============================
// 5. SPEECH
// ============================

// ============================================================
// HYBRID SPEECH SYSTEM — AI TTS first, browser fallback
// State machine: idle → loading → playing-ai | playing-browser → idle
//               → paused → resume → playing-ai | playing-browser
//               → failed → idle
// ============================================================
const Speech = {
  // ─── State machine ───
  _state: 'idle',
  _aiAudio: null,
  _utterance: null,
  _aiTimer: null,

  // ─── Legacy properties ───
  voices: [],
  preferredVoice: null,

  _setState(s) {
    var prev = this._state;
    this._state = s;
    if (s !== prev) console.log('[SPEECH] state: ' + prev + ' \u2192 ' + s);
  },

  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => {
      this.voices = window.speechSynthesis.getVoices();
      this.selectVoice();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    setTimeout(load, 1000);
  },

  // ─── Smart voice selection (natural English voices first) ───
  selectVoice() {
    var enVoices = this.voices.filter(function(v) { return v.lang.startsWith('en'); });
    if (enVoices.length === 0) return;
    var prefs = ['Google US English', 'Microsoft Aria', 'Samantha', 'Daniel', 'male', 'David', 'Mark', 'James'];
    var found = null;
    for (var p = 0; p < prefs.length; p++) {
      found = enVoices.find(function(v) { return v.name.toLowerCase().includes(prefs[p].toLowerCase()); });
      if (found) break;
    }
    if (!found) found = enVoices.find(function(v) { return !v.name.toLowerCase().includes('female'); });
    if (!found) found = enVoices[0];
    this.preferredVoice = found;
    if (found) console.log('[VOICE] selected: ' + found.name + ' (' + found.lang + ')');
  },

  // ==========================================================
  //  UNIFIED PLAY — AI TTS first, browser speechSynthesis fallback
  // ==========================================================
  async play(text, options) {
    if (!text) return { success: false, reason: 'no_text' };
    options = options || {};

    this.stop();
    this._setState('loading');

    // Step 1: try AI TTS
    var aiResult = await this._tryAITTS(text, options);
    if (aiResult && aiResult.success) {
      this._setState('playing-ai');
      console.log('[SPEECH] AI playback started');
      return aiResult;
    }

    // Step 2: fallback to browser TTS
    if (aiResult) console.log('[FALLBACK] AI TTS: ' + aiResult.reason + ' \u2192 browser speechSynthesis');
    var brResult = await this._speakBrowser(text, options);
    if (brResult && brResult.success) {
      this._setState('playing-browser');
    } else {
      this._setState('failed');
    }
    return brResult;
  },

  // ==========================================================
  //  AI TTS — fetch from endpoint, play Audio element
  // ==========================================================
  async _tryAITTS(text, options) {
    var endpoint = this._getTTSEndpoint();
    if (!endpoint) return { success: false, reason: 'no_endpoint' };

    try {
      console.log('[TTS] fetching AI TTS from endpoint');
      var resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text, lang: options.lang || 'en-US' }),
        signal: AbortSignal.timeout(10000)
      });
      if (!resp.ok) {
        console.log('[TTS] AI TTS fetch failed: status=' + resp.status);
        return { success: false, reason: 'fetch_failed', status: resp.status };
      }
      var blob = await resp.blob();
      if (!blob || blob.size === 0) {
        console.log('[TTS] AI TTS returned empty audio');
        return { success: false, reason: 'empty_audio' };
      }
      return await this._playAIBlob(blob, options);
    } catch (err) {
      if (err.name === 'AbortError') {
        console.log('[TTS] AI TTS fetch timed out (10s)');
        return { success: false, reason: 'timeout' };
      }
      console.log('[TTS] AI TTS fetch error: ' + err.message);
      return { success: false, reason: 'error' };
    }
  },

  _playAIBlob(blob, options) {
    var self = this;
    return new Promise(function(resolve) {
      var url = URL.createObjectURL(blob);
      var audio = new Audio(url);
      self._aiAudio = audio;

      var cleanup = function() {
        URL.revokeObjectURL(url);
        if (self._aiTimer) { clearTimeout(self._aiTimer); self._aiTimer = null; }
      };

      self._aiTimer = setTimeout(function() {
        if (self._aiAudio === audio) {
          audio.pause();
          cleanup();
          self._aiAudio = null;
          console.log('[AUDIO] AI playback timed out (15s)');
          resolve({ success: false, reason: 'playback_timeout' });
        }
      }, 15000);

      audio.onended = function() {
        if (self._aiAudio !== audio) return;
        cleanup();
        self._aiAudio = null;
        self._setState('idle');
        console.log('[AUDIO] AI playback ended');
        if (options.onEnd) options.onEnd();
        resolve({ success: true, source: 'ai' });
      };

      audio.onerror = function(e) {
        if (self._aiAudio !== audio) return;
        cleanup();
        self._aiAudio = null;
        console.log('[AUDIO] AI playback error: ' + (e.message || 'unknown'));
        resolve({ success: false, reason: 'playback_error' });
      };

      audio.play().then(function() {
        console.log('[SPEECH] AI playback started');
      }).catch(function(err) {
        cleanup();
        self._aiAudio = null;
        console.log('[AUDIO] AI autoplay blocked: ' + err.message);
        resolve({ success: false, reason: 'autoplay_blocked' });
      });
    });
  },

  _getTTSEndpoint() {
    // Set window.__TTS_CONFIG = { endpoint: 'https://...' } to enable AI TTS
    return (window.__TTS_CONFIG && window.__TTS_CONFIG.endpoint) || null;
  },

  // ==========================================================
  //  BROWSER SPEECH SYNTHESIS (fallback layer)
  // ==========================================================
  _speakBrowser(text, options) {
    var self = this;
    return new Promise(function(resolve) {
      if (!text || !('speechSynthesis' in window)) {
        self._setState('failed');
        resolve({ success: false, source: 'browser', reason: 'no_tts' });
        return;
      }
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }

      var u = new SpeechSynthesisUtterance(text);
      u.lang = options.lang || 'en-US';
      u.rate = options.rate || 0.9;
      u.pitch = options.pitch || 1.0;
      u.volume = options.volume || 1.0;

      if (options.voice) {
        u.voice = options.voice;
      } else if (self.preferredVoice) {
        u.voice = self.preferredVoice;
      } else {
        var v = self.voices.find(function(x) { return x.lang.startsWith('en'); });
        if (v) u.voice = v;
      }

      console.log('[VOICE] browser: ' + (u.voice ? u.voice.name + ' (' + u.voice.lang + ')' : 'default'));
      console.log('[SPEECH] Browser TTS started');

      self._utterance = u;
      self._setState('playing-browser');

      u.onend = function() {
        if (self._utterance !== u) return;
        self._utterance = null;
        self._setState('idle');
        console.log('[SPEECH] Browser TTS ended');
        if (options.onEnd) options.onEnd();
        resolve({ success: true, source: 'browser' });
      };

      u.onerror = function(e) {
        if (self._utterance !== u) return;
        self._utterance = null;
        self._setState('failed');
        console.log('[SPEECH] Browser TTS error: ' + (e.error || 'unknown'));
        if (options.onError) options.onError(e);
        resolve({ success: false, source: 'browser', reason: e.error || 'error' });
      };

      window.speechSynthesis.speak(u);
    });
  },

  // ==========================================================
  //  STOP — cancel ALL playback (AI audio + browser speech)
  // ==========================================================
  stop() {
    if (this._aiAudio) {
      try { this._aiAudio.pause(); this._aiAudio = null; } catch (e) { /* ignore */ }
    }
    if (this._aiTimer) { clearTimeout(this._aiTimer); this._aiTimer = null; }
    if ('speechSynthesis' in window) {
      try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    }
    this._utterance = null;
    if (this._state !== 'idle') {
      var prev = this._state;
      this._state = 'stopped';
      console.log('[SPEECH] state: ' + prev + ' \u2192 stopped');
      var self = this;
      setTimeout(function() { if (self._state === 'stopped') self._setState('idle'); }, 0);
    }
  },

  // ==========================================================
  //  PAUSE / RESUME
  // ==========================================================
  pause() {
    if (this._aiAudio && this._state === 'playing-ai') {
      try { this._aiAudio.pause(); } catch (e) { /* ignore */ }
      this._setState('paused');
      console.log('[SPEECH] AI playback paused');
    } else if ('speechSynthesis' in window && window.speechSynthesis.speaking) {
      try { window.speechSynthesis.pause(); } catch (e) { /* ignore */ }
      this._setState('paused');
      console.log('[SPEECH] Browser TTS paused');
    }
  },

  resume() {
    if (this._aiAudio && this._state === 'paused') {
      var self = this;
      this._aiAudio.play().then(function() {
        self._setState('playing-ai');
        console.log('[SPEECH] AI playback resumed');
      }).catch(function() { /* resume failed */ });
    } else if ('speechSynthesis' in window && window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch (e) { /* ignore */ }
      this._setState('playing-browser');
      console.log('[SPEECH] Browser TTS resumed');
    }
  },

  // ==========================================================
  //  LEGACY METHODS — backward compatible
  // ==========================================================
  speak(text) {
    this.play(text);
  },

  speakVocabWord(btn, text) {
    if (!text) return;
    this.stop();
    if (btn) btn.classList.add('speaking');
    this.play(text, {
      onEnd: function() { if (btn) btn.classList.remove('speaking'); },
      onError: function() { if (btn) btn.classList.remove('speaking'); }
    });
  }
};

// playAudio for listening exercises — icon feedback using Speech.play()
function playAudio(element, text) {
  if (!text) return;
  var icon = element.querySelector('.exercise-speaker-icon');
  if (icon) icon.textContent = '🔈';
  var resetIcon = function() { if (icon) icon.textContent = '🔊'; };
  Speech.play(text, { onEnd: resetIcon, onError: resetIcon });
}


// ============================
// 6. UI CONTROLS
// ============================

const UI = {
  Theme: {
    init() {
      var saved = localStorage.getItem('theme');
      if (saved === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
      this.updateIcon();
      var sTheme = document.getElementById('settingsThemeToggle');
      if (sTheme) sTheme.checked = (document.documentElement.getAttribute('data-theme') === 'dark');
    },
    toggle() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) { document.documentElement.removeAttribute('data-theme'); localStorage.setItem('theme', 'light'); }
      else { document.documentElement.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark'); }
      this.updateIcon();
      var sTheme = document.getElementById('settingsThemeToggle');
      if (sTheme) sTheme.checked = !isDark;
    },
    updateIcon() {
      var btn = document.getElementById('themeToggleBtn');
      if (!btn) return;
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      btn.textContent = isDark ? '☀️' : '🌙';
    }
  },

  Translation: {
    isActive: false,
    init() {
      var saved = localStorage.getItem('translation');
      this.isActive = saved !== null ? (saved === '1') : false;
      var btn = document.getElementById('transToggleBtn');
      if (btn) btn.classList.toggle('active', this.isActive);
      var sTrans = document.getElementById('settingsTransToggle');
      if (sTrans) sTrans.checked = this.isActive;
    },
    toggle() {
      this.isActive = !this.isActive;
      $$('.zh-text').forEach(function(el) { el.classList.toggle('show', this.isActive); }, this);
      var btn = document.getElementById('transToggleBtn');
      if (btn) btn.classList.toggle('active', this.isActive);
      var sTrans = document.getElementById('settingsTransToggle');
      if (sTrans) sTrans.checked = this.isActive;
      localStorage.setItem('translation', this.isActive ? '1' : '0');
    },
    apply() {
      $$('.zh-text').forEach(function(el) { el.classList.toggle('show', this.isActive); }, this);
    }
  },

  Font: {
    init() {
      this.load();
    },
    load() {
      var root = document.documentElement;
      try {
        var en = localStorage.getItem('enFontSize');
        var zh = localStorage.getItem('zhFontSize');
        if (en) root.style.setProperty('--en-font', en + 'px');
        if (zh) root.style.setProperty('--zh-font', zh + 'px');
      } catch (e) { /* ignore */ }
    },
    save() {
      var root = document.documentElement;
      try {
        var en = parseInt(getComputedStyle(root).getPropertyValue('--en-font')) || 28;
        var zh = parseInt(getComputedStyle(root).getPropertyValue('--zh-font')) || 20;
        localStorage.setItem('enFontSize', en);
        localStorage.setItem('zhFontSize', zh);
      } catch (e) { /* ignore */ }
    },
    change(type, delta) {
      var root = document.documentElement;
      var key = type === 'en' ? '--en-font' : '--zh-font';
      var cur = parseInt(getComputedStyle(root).getPropertyValue(key)) || (type === 'en' ? 28 : 20);
      var min = type === 'en' ? 14 : 12;
      var max = type === 'en' ? 40 : 36;
      var next = Math.min(max, Math.max(min, cur + delta));
      root.style.setProperty(key, next + 'px');
      this.save();
    }
  },

  Focus: {
    isActive: false,
    toggle() {
      this.isActive = !this.isActive;
      document.body.classList.toggle('focus-mode', this.isActive);
      // Match original: just deactivate, no suppress (suppress is handled by settings toggle)
      if (!this.isActive && typeof AutoFocus !== 'undefined' && AutoFocus.enabled) {
        AutoFocus.deactivate(true);
      }
    }
  },

  Settings: {
    open() {
      document.getElementById('settingsModal').style.display = 'flex';
      document.body.style.overflow = 'hidden';
      this.sync();
    },
    close() {
      document.getElementById('settingsModal').style.display = 'none';
      document.body.style.overflow = '';
    },
    sync() {
      var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      var sTheme = document.getElementById('settingsThemeToggle');
      if (sTheme) sTheme.checked = isDark;
      var sFocus = document.getElementById('settingsFocusToggle');
      if (sFocus) sFocus.checked = UI.Focus.isActive;
      var sAuto = document.getElementById('settingsAutoFocusToggle');
      if (sAuto && typeof AutoFocus !== 'undefined') sAuto.checked = AutoFocus.enabled;
      var sTrans = document.getElementById('settingsTransToggle');
      if (sTrans) sTrans.checked = UI.Translation.isActive;
      var root = document.documentElement;
      var enSize = parseInt(getComputedStyle(root).getPropertyValue('--en-font')) || 28;
      var zhSize = parseInt(getComputedStyle(root).getPropertyValue('--zh-font')) || 20;
      var enPrev = document.querySelector('.en-preview');
      var cnPrev = document.querySelector('.cn-preview');
      if (enPrev) enPrev.style.fontSize = enSize + 'px';
      if (cnPrev) cnPrev.style.fontSize = zhSize + 'px';
    }
  }
};

document.getElementById('openSettingsBtn').onclick = function() { UI.Settings.open(); };
document.getElementById('settingsCloseBtn').onclick = function() { UI.Settings.close(); };
document.getElementById('settingsModal').onclick = function(e) { if (e.target === this) UI.Settings.close(); };
document.addEventListener('keydown', function(e) { if (e.key === 'Escape') UI.Settings.close(); });

// Wire settings toggle switches
var sTheme = document.getElementById('settingsThemeToggle');
if (sTheme) sTheme.onchange = function() { UI.Theme.toggle(); };
var sFocus = document.getElementById('settingsFocusToggle');
if (sFocus) sFocus.onchange = function() {
  // Match original: suppress AutoFocus for 2min when turning focus OFF from settings
  if (UI.Focus.isActive && !sFocus.checked) { AutoFocus.suppress(120000); }
  UI.Focus.toggle();
};
var sAuto = document.getElementById('settingsAutoFocusToggle');
if (sAuto) sAuto.onchange = function() { AutoFocus.setEnabled(this.checked); };
var sTrans = document.getElementById('settingsTransToggle');
if (sTrans) sTrans.onchange = function() { UI.Translation.toggle(); };

// Wire settings font controls
(function() {
  var enPreview = document.querySelector('.en-preview');
  var cnPreview = document.querySelector('.cn-preview');
  function updatePreview(type) {
    var root = document.documentElement;
    if (type === 'en' && enPreview) {
      var v = parseInt(getComputedStyle(root).getPropertyValue('--en-font')) || 28;
      enPreview.style.fontSize = v + 'px';
    }
    if (type === 'zh' && cnPreview) {
      var v = parseInt(getComputedStyle(root).getPropertyValue('--zh-font')) || 20;
      cnPreview.style.fontSize = v + 'px';
    }
  }
  var enDec = document.getElementById('enFontDecrease');
  var enInc = document.getElementById('enFontIncrease');
  if (enDec) enDec.onclick = function() { UI.Font.change('en', -2); updatePreview('en'); };
  if (enInc) enInc.onclick = function() { UI.Font.change('en', 2); updatePreview('en'); };

  var cnDec = document.getElementById('cnFontDecrease');
  var cnInc = document.getElementById('cnFontIncrease');
  if (cnDec) cnDec.onclick = function() { UI.Font.change('zh', -2); updatePreview('zh'); };
  if (cnInc) cnInc.onclick = function() { UI.Font.change('zh', 2); updatePreview('zh'); };
})();


// ============================
// 7. TEACHER TOOLS
// ============================

const TeacherTools = {
  panelOpen: false, presenterMode: false, answersHidden: false,
  timerInterval: null, timerSeconds: 0,
  flashcards: [], fcIndex: 0, fcFlipped: false,
  boardCtx: null, boardColor: '#1a1a2e', boardSize: 4, boardDrawing: false,

  togglePanel() {
    this.panelOpen = !this.panelOpen;
    var el = document.getElementById('teacherToolbar');
    if (el) el.classList.toggle('open', this.panelOpen);
    var btn = document.getElementById('teacherToolsBtn');
    if (btn) btn.classList.toggle('panel-open', this.panelOpen);
  },

  togglePresenter() {
    this.presenterMode = !this.presenterMode;
    document.body.classList.toggle('presenter-mode', this.presenterMode);
    $$('.tt-quick-btn').forEach(function(b) {
      if (b.getAttribute('onclick') && b.getAttribute('onclick').indexOf('togglePresenter') !== -1) {
        b.classList.toggle('active', this.presenterMode);
      }
    }, this);
    this.toast(this.presenterMode ? '📺 Presenter mode ON' : '📺 Presenter mode OFF');
  },

  toggleAnswers() {
    this.answersHidden = !this.answersHidden;
    document.body.classList.toggle('answers-hidden', this.answersHidden);
    var icon = document.getElementById('ttHideIcon');
    var hideBtn = document.getElementById('ttHideBtn');
    var badge = document.getElementById('answersHiddenBadge');
    if (this.answersHidden) {
      if (icon) icon.textContent = '👁️';
      if (hideBtn) hideBtn.classList.add('active');
      if (badge) badge.classList.add('show');
      this.toast('🙈 Answers hidden');
    } else {
      if (icon) icon.textContent = '🙈';
      if (hideBtn) hideBtn.classList.remove('active');
      if (badge) badge.classList.remove('show');
      this.toast('👁️ Answers visible');
    }
  },

  startTimer(seconds) {
    this.stopTimer();
    this.timerSeconds = seconds;
    this.updateTimerDisplay();
    var display = document.getElementById('ttTimerDisplay');
    if (display) display.classList.add('running');
    this.timerInterval = setInterval(function() {
      this.timerSeconds--;
      this.updateTimerDisplay();
      if (this.timerSeconds <= 0) { this.stopTimer(); this.timerEndAlert(); }
    }.bind(this), 1000);
  },

  stopTimer() {
    if (this.timerInterval) { clearInterval(this.timerInterval); this.timerInterval = null; }
    var display = document.getElementById('ttTimerDisplay');
    if (display) display.classList.remove('running', 'warning');
  },

  updateTimerDisplay() {
    var display = document.getElementById('ttTimerDisplay');
    if (!display) return;
    var m = Math.floor(this.timerSeconds / 60);
    var s = this.timerSeconds % 60;
    display.textContent = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    if (this.timerSeconds <= 10 && this.timerSeconds > 0) display.classList.add('warning');
  },

  timerEndAlert() {
    var display = document.getElementById('ttTimerDisplay');
    if (display) { display.textContent = '⏰'; display.classList.add('finished'); }
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [800, 1000, 800].forEach(function(freq, i) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.2);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.15);
        osc.start(ctx.currentTime + i * 0.2);
        osc.stop(ctx.currentTime + i * 0.2 + 0.15);
      });
    } catch (e) { /* no audio ctx */ }
    this.toast('⏰ Time is up!');
    var self = this;
    setTimeout(function() {
      if (display) display.classList.remove('finished');
      if (display) display.textContent = '00:00';
    }, 3000);
  },

  openFlashcards() {
    var vocab = App.lesson && App.lesson.vocab;
    if (!vocab || !Array.isArray(vocab) || vocab.length === 0) { this.toast('⚠️ No vocabulary found'); return; }
    this.flashcards = vocab;
    this.fcIndex = 0; this.fcFlipped = false;
    this.renderFlashcard();
    var el = document.getElementById('flashcardsModal');
    if (el) el.classList.add('show');
  },

  closeFlashcards() {
    var el = document.getElementById('flashcardsModal');
    if (el) el.classList.remove('show');
  },

  renderFlashcard() {
    var card = this.flashcards[this.fcIndex];
    if (!card) return;
    var fc = document.getElementById('flashcardContent');
    if (fc) fc.classList.toggle('flipped', this.fcFlipped);
    var emoji = document.getElementById('fcEmoji');
    if (emoji) emoji.textContent = card.emoji || '📚';
    var en = document.getElementById('fcEn');
    if (en) en.textContent = card.en || '';
    var zh = document.getElementById('fcZh');
    if (zh) zh.textContent = card.zh || '';
    var cur = document.getElementById('fcCurrent');
    if (cur) cur.textContent = this.fcIndex + 1;
    var tot = document.getElementById('fcTotal');
    if (tot) tot.textContent = this.flashcards.length;
  },

  flipCard() {
    this.fcFlipped = !this.fcFlipped;
    var fc = document.getElementById('flashcardContent');
    if (fc) fc.classList.toggle('flipped', this.fcFlipped);
  },

  nextCard() {
    if (this.fcIndex < this.flashcards.length - 1) { this.fcIndex++; this.fcFlipped = false; this.renderFlashcard(); }
  },

  prevCard() {
    if (this.fcIndex > 0) { this.fcIndex--; this.fcFlipped = false; this.renderFlashcard(); }
  },

  speakCard() {
    var card = this.flashcards[this.fcIndex];
    if (card && card.en) Speech.speak(card.en);
  },

  openBoard() {
    var el = document.getElementById('boardModal');
    if (el) el.classList.add('show');
    setTimeout(this.initBoard.bind(this), 100);
  },

  closeBoard() {
    var el = document.getElementById('boardModal');
    if (el) el.classList.remove('show');
  },

  initBoard() {
    var canvas = document.getElementById('boardCanvas');
    if (!canvas) return;
    var rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    this.boardCtx = canvas.getContext('2d');
    this.boardCtx.lineCap = 'round';
    this.boardCtx.lineJoin = 'round';
    var self = this;
    function start(e) { self.boardDrawing = true; var p = self.boardPos(e, canvas); self.boardCtx.beginPath(); self.boardCtx.moveTo(p.x, p.y); }
    function draw(e) { if (!self.boardDrawing) return; e.preventDefault(); var p = self.boardPos(e, canvas); self.boardCtx.lineWidth = self.boardSize; self.boardCtx.strokeStyle = self.boardColor; self.boardCtx.lineTo(p.x, p.y); self.boardCtx.stroke(); }
    function stop() { self.boardDrawing = false; }
    canvas.onmousedown = start; canvas.onmousemove = draw; canvas.onmouseup = stop; canvas.onmouseleave = stop;
    canvas.ontouchstart = start; canvas.ontouchmove = draw; canvas.ontouchend = stop;
  },

  boardPos(e, canvas) {
    var rect = canvas.getBoundingClientRect();
    var evt = e.touches ? e.touches[0] : e;
    return { x: evt.clientX - rect.left, y: evt.clientY - rect.top };
  },

  boardSetColor(color) { this.boardColor = color; },
  boardClear() { if (this.boardCtx) { var c = document.getElementById('boardCanvas'); this.boardCtx.clearRect(0, 0, c.width, c.height); } },

  toggleBoardFullscreen() {
    var card = document.getElementById('boardCardEl');
    if (!card) return;
    var isFs = card.classList.toggle('fullscreen');
    var btn = document.getElementById('boardFsBtn');
    if (btn) btn.classList.toggle('active', isFs);
    setTimeout(function() {
      var canvas = document.getElementById('boardCanvas');
      if (canvas && this.boardCtx) {
        var tmp = document.createElement('canvas');
        tmp.width = canvas.width; tmp.height = canvas.height;
        tmp.getContext('2d').drawImage(canvas, 0, 0);
        var r = canvas.getBoundingClientRect();
        canvas.width = r.width; canvas.height = r.height;
        this.boardCtx = canvas.getContext('2d');
        this.boardCtx.lineCap = 'round'; this.boardCtx.lineJoin = 'round';
        this.boardCtx.drawImage(tmp, 0, 0, canvas.width, canvas.height);
      }
    }.bind(this), 320);
  },

  randomStudent() {
    var count = parseInt(localStorage.getItem('teacherStudentCount') || '0');
    if (!count) {
      var input = prompt('Number of students?', '20');
      count = parseInt(input);
      if (!count || count < 1) return;
      localStorage.setItem('teacherStudentCount', count);
    }
    var el = document.getElementById('randomStudentModal');
    if (el) el.classList.add('show');
    this.spinRandom();
  },

  spinRandom() {
    var count = parseInt(localStorage.getItem('teacherStudentCount') || '20');
    var display = document.getElementById('rsNumber');
    if (!display) return;
    var i = 0;
    var interval = setInterval(function() {
      display.textContent = Math.floor(Math.random() * count) + 1;
      i++;
      if (i > 15) { clearInterval(interval); display.classList.remove('spinning'); display.classList.add('chosen'); setTimeout(function() { display.classList.remove('chosen'); }, 1000); }
    }, 80);
    display.classList.add('spinning');
  },

  toast(msg) {
    var el = document.getElementById('teacherToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'teacherToast';
      el.className = 'teacher-toast';
      document.body.appendChild(el);
    }
    el.innerHTML = '<div class="tch-en">' + msg + '</div>';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 2200);
  }
};


// ============================
// 8. AUTO FOCUS
// ============================

const AutoFocus = {
  enabled: true, idleDelay: 30000, idleTimer: null, isActive: false,
  suppressedUntil: 0, readingWindowHeight: 0.35, overlay: null,

  init() {
    try {
      var saved = localStorage.getItem('autoFocusEnabled');
      if (saved !== null) this.enabled = (saved === '1');
    } catch (e) { /* ignore */ }
    this.createOverlay();
    var self = this;
    ['mousedown', 'keydown', 'touchstart', 'click'].forEach(function(evt) {
      window.addEventListener(evt, function() { self.onActivity(); }, { passive: true });
    });
    window.addEventListener('mousemove', function() { self.onActivity(); }, { passive: true });
    window.addEventListener('resize', function() { if (self.isActive) self.updatePos(); }, { passive: true });
    this.resetTimer();
  },

  createOverlay() {
    if (document.getElementById('autoFocusOverlay')) return;
    var ov = document.createElement('div');
    ov.id = 'autoFocusOverlay';
    ov.className = 'auto-focus-overlay';
    ov.setAttribute('aria-hidden', 'true');
    ov.innerHTML = '<div class="afo-mask afo-mask-top"></div><div class="afo-mask afo-mask-bottom"></div>';
    document.body.appendChild(ov);
    this.overlay = ov;
  },

  updatePos() {
    if (!this.overlay) return;
    var vh = window.innerHeight;
    var wh = vh * this.readingWindowHeight;
    var gap = (vh - wh) / 2;
    var top = this.overlay.querySelector('.afo-mask-top');
    var bot = this.overlay.querySelector('.afo-mask-bottom');
    if (top) top.style.height = gap + 'px';
    if (bot) { bot.style.height = gap + 'px'; bot.style.top = (gap + wh) + 'px'; }
  },

  onActivity() {
    if (this.isActive) this.deactivate();
    this.resetTimer();
  },

  resetTimer() {
    clearTimeout(this.idleTimer);
    if (!this.enabled) return;
    if (Date.now() < this.suppressedUntil) return;
    if (UI.Focus && UI.Focus.isActive) return;
    this.idleTimer = setTimeout(this.activate.bind(this), this.idleDelay);
  },

  activate() {
    if (UI.Focus && UI.Focus.isActive) return;
    var settings = document.getElementById('settingsModal');
    if (settings && settings.style.display !== 'none' && settings.style.display !== '') return;
    this.isActive = true;
    document.body.classList.add('auto-focus-active');
    this.updatePos();
    this.showIndicator();
  },

  deactivate(silent) {
    if (!this.isActive && !silent) return;
    this.isActive = false;
    document.body.classList.remove('auto-focus-active');
    this.hideIndicator();
  },

  showIndicator() {
    var ind = document.getElementById('autoFocusIndicator');
    if (!ind) {
      ind = document.createElement('div');
      ind.id = 'autoFocusIndicator';
      ind.className = 'auto-focus-indicator';
      ind.innerHTML = '<span class="afi-icon">🎯</span><div class="afi-text"><div class="afi-en">Focus mode</div><div class="afi-zh">专注模式已启动</div></div>';
      document.body.appendChild(ind);
    }
    ind.classList.remove('show');
    void ind.offsetWidth;
    ind.classList.add('show');
  },

  hideIndicator() {
    var ind = document.getElementById('autoFocusIndicator');
    if (ind) ind.classList.remove('show');
  },

  suppress(durationMs) {
    durationMs = durationMs || 120000;
    this.suppressedUntil = Date.now() + durationMs;
    this.deactivate(true);
    clearTimeout(this.idleTimer);
  },

  toggleEnabled() {
    this.setEnabled(!this.enabled);
    this.showToast(this.enabled);
  },

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) { this.deactivate(true); clearTimeout(this.idleTimer); }
    else this.resetTimer();
    try { localStorage.setItem('autoFocusEnabled', enabled ? '1' : '0'); } catch (e) { /* ignore */ }
    var btn = document.getElementById('autoFocusToggleBtn');
    if (btn) { btn.classList.toggle('active', enabled); btn.setAttribute('aria-pressed', enabled ? 'true' : 'false'); }
    var sToggle = document.getElementById('settingsAutoFocusToggle');
    if (sToggle) sToggle.checked = enabled;
  },

  showToast(enabled) {
    var el = document.getElementById('autoFocusToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'autoFocusToast';
      el.className = 'auto-focus-toast';
      document.body.appendChild(el);
    }
    el.innerHTML = enabled
      ? '<span class="aft-icon">✅</span><div class="aft-text"><div class="aft-en">Auto Focus enabled</div><div class="aft-zh">自动专注已启用</div></div>'
      : '<span class="aft-icon">⏸️</span><div class="aft-text"><div class="aft-en">Auto Focus disabled</div><div class="aft-zh">自动专注已停用</div></div>';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 2200);
  }
};


// ============================
// 9. DIALOGUE CONTROLS
// ============================

var dialoguePlayIndex = 0;
var dialogueUtterance = null;
var dialoguePlaying = false;

function revealNextLine() {
  var lines = document.querySelectorAll('.dial-line:not(.revealed)');
  if (lines.length > 0) lines[0].classList.add('revealed');
}

function resetDialogue() {
  $$('.dial-line').forEach(function(l, i) { l.classList.toggle('revealed', i === 0); });
}

function revealAllDialogue() {
  $$('.dial-line').forEach(function(l) { l.classList.add('revealed'); });
}

function clearDialogueHighlights() {
  $$('.dial-line.active-speaking').forEach(function(el) { el.classList.remove('active-speaking'); });
}

function highlightDialogueLine(index) {
  clearDialogueHighlights();
  var lines = document.querySelectorAll('.dial-line');
  if (lines[index]) {
    lines[index].classList.add('active-speaking');
    var rect = lines[index].getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
      lines[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}

function speakDialogueLine(index) {
  if (!dialoguePlaying) return;
  var lines = document.querySelectorAll('.dial-line');
  if (index < 0 || index >= lines.length) {
    dialoguePlaying = false;
    var b = document.getElementById('playDialogueBtn');
    if (b) b.innerHTML = '🔊 Listen';
    clearDialogueHighlights();
    return;
  }
  dialoguePlayIndex = index;
  var textEl = lines[index].querySelector('.en-text');
  var text = textEl ? textEl.textContent.trim() : '';
  if (!text) { speakDialogueLine(index + 1); return; }
  Speech.play(text, {
    rate: 0.9,
    onEnd: function() { if (!dialoguePlaying) return; speakDialogueLine(index + 1); },
    onError: function() { if (!dialoguePlaying) return; speakDialogueLine(index + 1); }
  });
  highlightDialogueLine(index);
}

function playRevealedDialogue() {
  var btn = document.getElementById('playDialogueBtn');
  if (!btn) return;
  // Pause
  if ((Speech._state === 'playing-ai' || Speech._state === 'playing-browser') && dialoguePlaying) {
    Speech.pause();
    btn.innerHTML = '▶️ Listen';
    return;
  }
  // Resume
  if (Speech._state === 'paused' && dialoguePlaying) {
    Speech.resume();
    btn.innerHTML = '🔊 Listen';
    return;
  }
  // Start fresh
  dialoguePlaying = false;
  Speech.stop();
  clearDialogueHighlights();
  dialoguePlaying = true;
  speakDialogueLine(0);
  btn.innerHTML = '🔊 Listen';
}

// Dialogue click handler — delegated, uses Speech.play
document.addEventListener('click', function(e) {
  var line = e.target.closest('.dial-line');
  if (!line) return;
  var text = line.querySelector('.en-text');
  if (text) {
    $$('.dial-line').forEach(function(x) { x.classList.remove('highlighted'); });
    line.classList.add('highlighted');
    Speech.play(text.textContent);
  }
});


// ============================
// 10. VOCAB AUDIO PLAYER (VAP)
// ============================

(function() {
  var SECONDS_PER_WORD = 2.2;
  var playlist = [];
  var currentIndex = 0;
  var isPlaying = false;
  var isPaused = false;
  var currentUtterance = null;
  var tickTimer = null;
  var elapsedInWord = 0;
  var seeking = false;
  var lastTickAt = 0;
  var elPlayer, elPlayBtn, elStopBtn, elSlider, elCurTime, elTotalTime, elCurIdx, elTotalIdx;
  var _vapReady = false;

  function buildPlaylist() {
    playlist = [];
    $$('.vocab-grid .vocab-card').forEach(function(card) {
      var en = card.querySelector('.vocab-en');
      if (en && en.textContent.trim()) playlist.push({ card: card, en: en.textContent.trim() });
    });
    if (elTotalIdx) elTotalIdx.textContent = String(playlist.length);
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  function totalSeconds() { return playlist.length * SECONDS_PER_WORD; }

  function globalElapsed() { return currentIndex * SECONDS_PER_WORD + elapsedInWord; }

  function updateUI() {
    if (!elSlider) return;
    var total = totalSeconds();
    var elapsed = Math.min(globalElapsed(), total);
    if (!seeking) elSlider.value = String(Math.floor(elapsed));
    var pct = total > 0 ? (elapsed / total) * 100 : 0;
    elSlider.style.setProperty('--vap-progress', pct + '%');
    elCurTime.textContent = fmtTime(elapsed);
    elTotalTime.textContent = fmtTime(total);
    elCurIdx.textContent = String(Math.min(currentIndex + (isPlaying || isPaused ? 1 : 0), playlist.length));
  }

  function clearHighlights() { $$('.vocab-card.active-speaking').forEach(function(c) { c.classList.remove('active-speaking'); }); }

  function highlightWord(index) {
    clearHighlights();
    var item = playlist[index];
    if (!item) return;
    item.card.classList.add('active-speaking');
    var rect = item.card.getBoundingClientRect();
    if (rect.top < 80 || rect.bottom > window.innerHeight - 40) {
      try { item.card.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { item.card.scrollIntoView(); }
    }
  }

  function startTick() {
    stopTick();
    lastTickAt = performance.now();
    tickTimer = setInterval(function() {
      if (!isPlaying || isPaused) return;
      var dt = (performance.now() - lastTickAt) / 1000;
      lastTickAt = performance.now();
      elapsedInWord = Math.min(elapsedInWord + dt, SECONDS_PER_WORD);
      updateUI();
    }, 100);
  }

  function stopTick() { if (tickTimer) { clearInterval(tickTimer); tickTimer = null; } }

  function speakAt(index) {
    if (index < 0 || index >= playlist.length) { finishAll(); return; }
    currentIndex = index; elapsedInWord = 0;
    Speech.stop();
    var item = playlist[index];
    Speech.play(item.en, {
      rate: 0.9,
      onEnd: function() {
        elapsedInWord = SECONDS_PER_WORD; updateUI();
        if (!isPlaying) return;
        if (currentIndex + 1 >= playlist.length) finishAll();
        else { speakAt(currentIndex + 1); highlightWord(currentIndex); }
      },
      onError: function() {
        if (isPlaying && currentIndex + 1 < playlist.length) { speakAt(currentIndex + 1); highlightWord(currentIndex); }
        else finishAll();
      }
    });
    highlightWord(index); updateUI();
  }

  function play() {
    buildPlaylist();
    if (playlist.length === 0) return;
    if (isPaused && (Speech._state === 'paused')) {
      isPaused = false; isPlaying = true;
      Speech.resume();
      if (elPlayer) elPlayer.classList.add('is-playing');
      lastTickAt = performance.now(); startTick(); return;
    }
    isPlaying = true; isPaused = false;
    if (elPlayer) elPlayer.classList.add('is-playing');
    if (currentIndex >= playlist.length) currentIndex = 0;
    startTick(); speakAt(currentIndex);
  }

  function pause() {
    if (!isPlaying) return;
    isPaused = true; isPlaying = false;
    Speech.pause();
    if (elPlayer) elPlayer.classList.remove('is-playing');
  }

  function stop() {
    isPlaying = false; isPaused = false; currentUtterance = null;
    Speech.stop();
    stopTick(); currentIndex = 0; elapsedInWord = 0; clearHighlights();
    if (elPlayer) elPlayer.classList.remove('is-playing'); updateUI();
  }

  function finishAll() {
    isPlaying = false; isPaused = false; currentUtterance = null; stopTick();
    if (elPlayer) elPlayer.classList.remove('is-playing');
    setTimeout(clearHighlights, 600);
    currentIndex = playlist.length; elapsedInWord = 0; updateUI();
    setTimeout(function() { currentIndex = 0; updateUI(); }, 800);
  }

  function seekTo(globalSec) {
    buildPlaylist();
    if (playlist.length === 0) return;
    var idx = Math.floor(globalSec / SECONDS_PER_WORD);
    if (idx < 0) idx = 0;
    if (idx >= playlist.length) idx = playlist.length - 1;
    var wasPlaying = isPlaying || isPaused;
    Speech.stop();
    currentUtterance = null; currentIndex = idx; elapsedInWord = 0;
    if (wasPlaying) { isPlaying = true; isPaused = false; if (elPlayer) elPlayer.classList.add('is-playing'); startTick(); speakAt(currentIndex); }
    else { highlightWord(currentIndex); updateUI(); }
  }

  function initVAP() {
    if (_vapReady) return;
    _vapReady = true;
    elPlayer = document.getElementById('vocabAudioPlayer');
    if (!elPlayer) { _vapReady = false; return; }
    elPlayBtn = document.getElementById('vapPlayBtn');
    elStopBtn = document.getElementById('vapStopBtn');
    elSlider = document.getElementById('vapSlider');
    elCurTime = document.getElementById('vapCurTime');
    elTotalTime = document.getElementById('vapTotalTime');
    elCurIdx = document.getElementById('vapCurIdx');
    elTotalIdx = document.getElementById('vapTotal');

    var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    var ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>';
    function renderIcon() {
      var playing = elPlayer.classList.contains('is-playing');
      elPlayBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      elPlayBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    }
    renderIcon();
    try { new MutationObserver(renderIcon).observe(elPlayer, { attributes: true, attributeFilter: ['class'] }); } catch (e) { /* no-op */ }

    buildPlaylist();
    elSlider.max = String(Math.max(1, Math.floor(totalSeconds())));
    updateUI();
    elPlayBtn.addEventListener('click', function() { if (isPlaying) pause(); else play(); });
    elStopBtn.addEventListener('click', stop);
    elSlider.addEventListener('input', function() {
      seeking = true;
      var v = parseFloat(elSlider.value) || 0;
      var pct = totalSeconds() > 0 ? (v / totalSeconds()) * 100 : 0;
      elSlider.style.setProperty('--vap-progress', pct + '%');
      elCurTime.textContent = fmtTime(v);
    });
    elSlider.addEventListener('change', function() {
      seeking = false;
      seekTo(parseFloat(elSlider.value) || 0);
    });
    window.addEventListener('beforeunload', function() { Speech.stop(); });
  }

  window.initVAP = initVAP;
})();


// ============================
// 11. SMART FEEDBACK
// ============================

const SmartFeedback = {
  commonMistakes: {},

  init(data) {
    this.commonMistakes = (data && typeof data.smartFeedback === 'object') ? data.smartFeedback : {};
  },

  analyze(input, expected) {
    var strip = function(s) { return s.replace(/[\u064B-\u0652\u0670]/g, '').trim(); };
    var inClean = strip(input);
    var expClean = strip(expected);
    if (inClean === expClean) return null;
    for (var wrong in this.commonMistakes) {
      if (this.commonMistakes.hasOwnProperty(wrong)) {
        var info = this.commonMistakes[wrong];
        if (strip(wrong) === inClean && strip(info.correct) === expClean) return info;
      }
    }
    if (this.editDistance(inClean, expClean) === 1) {
      return { en: '💡 Very close! Correct answer: <strong>' + expected + '</strong>', zh: '💡 很接近！正确答案: <strong>' + expected + '</strong>' };
    }
    return null;
  },

  editDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    var m = [];
    for (var i = 0; i <= b.length; i++) m[i] = [i];
    for (var j = 0; j <= a.length; j++) m[0][j] = j;
    for (i = 1; i <= b.length; i++) {
      for (j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) m[i][j] = m[i - 1][j - 1];
        else m[i][j] = Math.min(m[i - 1][j - 1] + 1, m[i][j - 1] + 1, m[i - 1][j] + 1);
      }
    }
    return m[b.length][a.length];
  },

  showHint(el, hint) {
    var hintEl = el.querySelector('.smart-hint');
    if (!hintEl) {
      hintEl = document.createElement('div');
      hintEl.className = 'smart-hint';
      var fb = el.querySelector('.feedback');
      if (fb) fb.parentNode.insertBefore(hintEl, fb.nextSibling);
      else el.appendChild(hintEl);
    }
    hintEl.innerHTML = '<div class="sh-en">' + hint.en + '</div><div class="sh-zh">' + hint.zh + '</div>';
    hintEl.classList.add('show');
  },

  hideHint(el) {
    var hintEl = el.querySelector('.smart-hint');
    if (hintEl) hintEl.classList.remove('show');
  }
};


// ============================
// 12. SPEAK TIP
// ============================

function showSpeakTip(en, zh) {
  var el = document.getElementById('speakTipModal');
  if (el) {
    var enEl = el.querySelector('.tt-modal-en');
    var zhEl = el.querySelector('.tt-modal-zh');
    if (enEl) enEl.textContent = en;
    if (zhEl) zhEl.textContent = zh;
    el.style.display = 'flex';
  }
}
function closeSpeakTip() {
  var el = document.getElementById('speakTipModal');
  if (el) el.style.display = 'none';
}


// ============================
// 7. HELPERS
// ============================

function section(icon, title, sub) {
  console.log('[RENDER] section header:', icon, title);
  const el = mkEl('section'); el.className = 'section';
  el.innerHTML = sectionHeader(icon, title, sub);
  return el;
}

function sectionHeader(icon, title, sub) {
  return `<div class="section-header"><div class="section-icon">${icon}</div><div><div class="section-title">${esc(title)}</div><div class="section-subtitle">${esc(sub)}</div></div></div>`;
}

function countExercises(ex) {
  if (!ex) return 0;
  let c = 0;
  ExerciseRegistry.getAll().forEach(mod => {
    const data = ex[mod.TYPE];
    if (data) {
      if (Array.isArray(data) && data.length > 0) c++;
      else if (!Array.isArray(data) && data) c++;
    }
  });
  if (guardArr(ex.dragWords).length) c++;
  if (App.lesson && guardArr(App.lesson.vocab).length) c++;
  if (guardArr(ex.orderWords).length) c++;
  if (ex.correctError) c++; if (ex.rewrite) c++;
  if (ex.guidedWriting) c++; if (ex.listeningExercise) c++; if (ex.speedChallenge) c++;
  if (ex.multiStep) c++; if (ex.paragraph) c++; if (ex.contextAnalysis) c++;
  if (ex.scenario) c++; if (ex.visualChoice) c++; if (ex.sentenceTransform) c++;
  if (ex.challenge) c++; if (ex.selectWords) c++; if (ex.dialogueFill) c++;
  if (ex.patternFill) c++;
  return c;
}

// Drag & drop setup for exercises (delegated)
document.addEventListener('dragstart', e => {
  const item = e.target.closest('.drag-item');
  if (item) { e.dataTransfer.setData('text/plain', ''); item.classList.add('dragging'); window._drag = item; }
});
document.addEventListener('dragend', e => { const item = e.target.closest('.drag-item'); if (item) item.classList.remove('dragging'); });
document.addEventListener('dragover', e => { const zone = e.target.closest('.drag-zone'); if (zone) { e.preventDefault(); zone.classList.add('hover-over'); } });
document.addEventListener('dragleave', e => { const zone = e.target.closest('.drag-zone'); if (zone) zone.classList.remove('hover-over'); });
document.addEventListener('drop', e => {
  const zone = e.target.closest('.drag-zone');
  if (!zone || !window._drag) return;
  e.preventDefault(); zone.classList.remove('hover-over');
  const item = window._drag;
  if (item.dataset.cat === zone.dataset.accept) {
    zone.appendChild(item); item.classList.add('drag-dropped');
    Exercises.correct++;
  } else {
    Exercises.wrong++;
    item.style.animation = 'shake .4s';
    setTimeout(() => item.style.animation = '', 400);
  }
  window._drag = null;
});

// Order drag - reorder within pool
document.addEventListener('dragstart', e => {
  const ow = e.target.closest('.order-word');
  if (ow) { e.dataTransfer.setData('text/plain', ''); ow.classList.add('is-dragging'); window._orderDrag = ow; }
});
document.addEventListener('dragend', e => { const ow = e.target.closest('.order-word'); if (ow) ow.classList.remove('is-dragging'); });
document.addEventListener('dragover', e => {
  const pool = e.target.closest('#orderPool');
  if (!pool || !window._orderDrag) return;
  e.preventDefault();
  const after = getDragAfter(pool, e.clientX);
  if (after) pool.insertBefore(window._orderDrag, after);
  else pool.appendChild(window._orderDrag);
});

function getDragAfter(container, x) {
  const items = [...container.querySelectorAll('.order-word:not(.is-dragging)')];
  return items.reduce((closest, child) => {
    const box = child.getBoundingClientRect();
    const offset = x - box.left - box.width / 2;
    if (offset < 0 && offset > closest.offset) return { offset, element: child };
    return closest;
  }, { offset: -Infinity }).element;
}

// Wrap checkFill with SmartFeedback
(function() {
  if (typeof Exercises === 'undefined' || typeof Exercises.checkFill !== 'function') return;
  var orig = Exercises.checkFill;
  Exercises.checkFill = function(btn) {
    var ex = btn.closest('.exercise');
    var inputs = ex ? ex.querySelectorAll('.fill-input[data-answer]') : [];
    var hint = null;
    inputs.forEach(function(input) {
      var expected = input.dataset.answer.trim();
      var got = input.value.trim();
      var strip = function(s) { return s.replace(/[\u064B-\u0652\u0670]/g, '').trim(); };
      if (got && strip(got) !== strip(expected)) {
        var found = SmartFeedback.analyze(got, expected);
        if (found && !hint) hint = found;
      }
    });
    orig.call(Exercises, btn);
    if (hint) SmartFeedback.showHint(ex, hint);
    else SmartFeedback.hideHint(ex);
  };
})();

// Speak chips (delegated)
document.addEventListener('click', e => {
  const chip = e.target.closest('.speak-level .chip');
  if (!chip) return;
  const out = chip.closest('.speak-level').querySelector('.builder-output');
  if (out) {
    const text = out.textContent === '...' ? '' : out.textContent;
    out.textContent = (text + ' ' + chip.textContent).trim();
  }
  chip.classList.remove('selected');
  void chip.offsetWidth;
  chip.classList.add('selected');
  setTimeout(() => chip.classList.remove('selected'), 400);
});

// ============================
// FATAL ERROR HANDLER
// ============================

var _bootCompleted = false;

function showFatalError(msg) {
  var splash = document.getElementById('splashScreen');
  if (splash) { splash.style.display = 'none'; splash.remove(); }
  var errArea = document.getElementById('errorArea');
  var errMsg = document.getElementById('errorMessage');
  if (errMsg) errMsg.textContent = msg || 'An unexpected error occurred.';
  if (errArea) errArea.style.display = 'block';
}

// Only catch JS runtime errors, NOT resource loading errors (favicon, images, etc.)
window.addEventListener('error', function(e) {
  if (!e.error) return; // resource error (favicon 404, img 404) — ignore
  e.preventDefault();
  console.error('[FATAL] Script error:', e.error.message || e.message);
  if (!_bootCompleted) showFatalError('Script error: ' + (e.error.message || e.message));
  return false;
});

window.addEventListener('unhandledrejection', function(e) {
  e.preventDefault();
  console.error('[FATAL] Unhandled promise rejection:', e.reason);
  if (!_bootCompleted) showFatalError('Async error: ' + (e.reason ? (e.reason.message || e.reason) : 'unknown'));
});

// ============================
// BOOT — mount UI, hide splash, never block
// ============================

// Export for inline HTML onclick handlers (IIFE scope workaround)
window.$$ = $$;
window.Speech = Speech;
window.UI = UI;
window.TeacherTools = TeacherTools;
window.Navigation = Navigation;
window.AutoFocus = AutoFocus;
window.closeSpeakTip = closeSpeakTip;
window.Exercises = Exercises;
window.revealAllDialogue = revealAllDialogue;
window.resetDialogue = resetDialogue;
window.revealNextLine = revealNextLine;
window.playRevealedDialogue = playRevealedDialogue;
console.log('[BOOT] bootstrap start');

function boot() {
  var ready = document.readyState;
  console.log('[BOOT] DOM readyState:', ready);

  // Phase 1: Sync UI init (no awaits, no fetch, no AI)
  var initOk = true;
  App.init().then(function() {
    console.log('[BOOT] App.init() complete');
  })['catch'](function(err) {
    console.error('[BOOT] App.init() failed:', err);
    initOk = false;
  });

  // Phase 2: Hide splash unconditionally after a tiny delay
  // (ensures DOM paint has time to settle)
  setTimeout(function() {
    App.hideSplash();
    _bootCompleted = true;
    console.log('[BOOT] app mounted — UI is interactive');
    if (!initOk) {
      showFatalError('Startup failed: ' + 'UI initialization error — check console');
    }
  }, 100);

  // Safety net: force splash hide after 5s no matter what
  setTimeout(function() {
    if (!_bootCompleted) {
      console.warn('[BOOT] force hide splash (5s timeout)');
      App.hideSplash();
      _bootCompleted = true;
    }
  }, 5000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

})();
