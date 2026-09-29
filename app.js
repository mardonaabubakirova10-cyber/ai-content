/* ================================================================
   AI Content Studio — App Logic
   Gemini · Streaming · Sidebar History · Quiet Luxury UI
   ================================================================ */

'use strict';

// ── Config ──────────────────────────────────────────────────
// Active Gemini Model
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash'
];

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const HISTORY_KEY = 'ai_content_studio_history_v2';
const API_KEY_STORE = 'ai_content_studio_api_key';
const MAX_HISTORY = 50;

// ── State ───────────────────────────────────────────────────
const state = {
  apiKey: '',
  platform: 'telegram',
  tone: 'engaging',
  isGenerating: false,
  variants: [null, null, null],
  activeVariant: 0,
  history: []
};

// ── DOM refs ────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const dom = {
  apiKeyModal: $('apiKeyModal'),
  apiKeyInput: $('apiKeyInput'),
  toggleApiKey: $('toggleApiKey'),
  saveApiKey: $('saveApiKey'),
  cancelApiKey: $('cancelApiKey'),
  testKeyBtn: $('testKeyBtn'),
  keyStatus: $('keyStatus'),

  openSettings: $('openSettings'),
  toggleAppearance: $('toggleAppearance'),

  topicInput: $('topicInput'),
  charCount: $('charCount'),

  generateBtn: $('generateBtn'),
  generateBtnText: $('generateBtnText'),

  resultsSection: $('resultsSection'),
  emptyState: $('emptyState'),

  regenBtn: $('regenBtn'),

  historyList: $('historyList'),
  historyEmpty: $('historyEmpty'),
  historyCount: $('historyCount'),
  clearHistory: $('clearHistory'),

  toast: $('toast'),
  toastMsg: $('toastMsg')
};

// ── Init ────────────────────────────────────────────────────
function init() {
  const configKey = (window.APP_CONFIG && window.APP_CONFIG.GEMINI_API_KEY) || '';
  const storedKey = localStorage.getItem(API_KEY_STORE) || '';

  // Сначала берём сохранённый ключ из localStorage, если его нет — из config.js
  state.apiKey = storedKey || configKey;

  if (state.apiKey) {
    dom.apiKeyModal?.setAttribute('hidden', '');
    if (dom.apiKeyInput) {
      dom.apiKeyInput.value = state.apiKey;
    }
  } else {
    dom.apiKeyModal?.removeAttribute('hidden');
  }

  // Appearance
  const savedAppearance = localStorage.getItem('ai_appearance') || 'dark';
  document.documentElement.setAttribute('data-appearance', savedAppearance);

  // History
  try {
    state.history = JSON.parse(localStorage.getItem(HISTORY_KEY)) || [];
  } catch {
    state.history = [];
  }

  renderHistorySidebar();
  bindEvents();
}

// ── Events ──────────────────────────────────────────────────
function bindEvents() {
  // API Key modal
  dom.saveApiKey?.addEventListener('click', handleSaveApiKey);

  dom.cancelApiKey?.addEventListener('click', () => {
    if (state.apiKey) {
      dom.apiKeyModal?.setAttribute('hidden', '');
    }
  });

  dom.apiKeyInput?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleSaveApiKey();
  });

  dom.toggleApiKey?.addEventListener('click', () => {
    if (!dom.apiKeyInput) return;
    dom.apiKeyInput.type = dom.apiKeyInput.type === 'password' ? 'text' : 'password';
  });

  // Test Key
  dom.testKeyBtn?.addEventListener('click', async () => {
    const key = dom.apiKeyInput?.value.trim() || '';
    if (!key) {
      if (dom.keyStatus) {
        dom.keyStatus.textContent = '⚠️ Введите ключ';
        dom.keyStatus.className = 'key-status err';
      }
      return;
    }

    dom.testKeyBtn.disabled = true;
    dom.testKeyBtn.textContent = 'Проверяю…';
    if (dom.keyStatus) {
      dom.keyStatus.textContent = '';
      dom.keyStatus.className = 'key-status';
    }

    const result = await testApiKey(key);
    dom.testKeyBtn.disabled = false;
    dom.testKeyBtn.textContent = 'Проверить ключ';

    if (dom.keyStatus) {
      dom.keyStatus.textContent = result.ok ? '✓ ' + result.msg : '✕ ' + result.msg;
      dom.keyStatus.className = 'key-status ' + (result.ok ? 'ok' : 'err');
    }
  });

  // Settings & Appearance
  dom.openSettings?.addEventListener('click', () => {
    if (dom.apiKeyInput) dom.apiKeyInput.value = state.apiKey;
    dom.apiKeyModal?.removeAttribute('hidden');
  });

  dom.toggleAppearance?.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-appearance');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-appearance', next);
    localStorage.setItem('ai_appearance', next);
  });

  // Character Counter
  dom.topicInput?.addEventListener('input', () => {
    if (dom.charCount) {
      dom.charCount.textContent = dom.topicInput.value.length;
    }
  });

  // Platform Buttons (Nav pills with data-platform)
  document.querySelectorAll('[data-platform]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-platform]').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.platform = btn.dataset.platform;
    });
  });

  // Tone Buttons
  document.querySelectorAll('.tone-item').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tone-item').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      state.tone = btn.dataset.tone;
    });
  });

  // Generate Buttons
  dom.generateBtn?.addEventListener('click', handleGenerate);
  dom.regenBtn?.addEventListener('click', handleGenerate);

  // Ctrl/Cmd + Enter
  dom.topicInput?.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      handleGenerate();
    }
  });

  // Variant Tabs (tab-btn or seg-btn)
  document.querySelectorAll('[data-variant]').forEach(tab => {
    if (tab.classList.contains('tab-btn') || tab.classList.contains('seg-btn')) {
      tab.addEventListener('click', () => {
        switchVariant(parseInt(tab.dataset.variant, 10));
      });
    }
  });

  // Copy Post
  document.querySelectorAll('.btn-copy-post').forEach(btn => {
    btn.addEventListener('click', () => {
      copyVariant(parseInt(btn.dataset.variant, 10));
    });
  });

  // Save Post
  document.querySelectorAll('.btn-save-post').forEach(btn => {
    btn.addEventListener('click', () => {
      saveVariantToHistory(parseInt(btn.dataset.variant, 10));
    });
  });

  // Copy Image Prompt
  document.querySelectorAll('.inline-copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const el = $(btn.dataset.target);
      if (el && el.textContent.trim()) {
        copyToClipboard(el.textContent.trim(), 'Промпт скопирован');
      }
    });
  });

  // Clear History
  dom.clearHistory?.addEventListener('click', clearAllHistory);

  // Traffic Light Joke
  document.querySelector('.tl-close')?.addEventListener('click', () => {
    showToast('Системное окно веб-приложения');
  });
}

// ── API Key ─────────────────────────────────────────────────
let cachedModels = null;

async function getAvailableModels(key) {
  if (cachedModels && cachedModels.length > 0) return cachedModels;

  const fallbackModels = [
    'gemini-3.8-flash',
    'gemini-3.0-flash',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-pro-latest',
    'gemini-1.5-flash',
    'gemini-pro'
  ];

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && Array.isArray(data.models)) {
        const supported = data.models
          .filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes('generateContent'))
          .map(m => m.name.replace(/^models\//, ''));

        if (supported.length > 0) {
          // Приоритет отдаем flash моделям
          supported.sort((a, b) => {
            const aFlash = a.includes('flash') ? -1 : 1;
            const bFlash = b.includes('flash') ? -1 : 1;
            return aFlash - bFlash;
          });
          cachedModels = supported;
          console.log('Available Gemini models for this key:', cachedModels);
          return cachedModels;
        }
      }
    }
  } catch (err) {
    console.warn('Could not auto-fetch models list from Gemini API:', err);
  }

  return fallbackModels;
}

function handleSaveApiKey() {
  const key = dom.apiKeyInput?.value.trim() || '';
  if (!key || key.length < 10) {
    if (dom.apiKeyInput) shake(dom.apiKeyInput);
    return;
  }
  state.apiKey = key;
  cachedModels = null;
  localStorage.setItem(API_KEY_STORE, key);
  dom.apiKeyModal?.setAttribute('hidden', '');
  showToast('API ключ сохранён');
}

function shake(el) {
  el.style.animation = 'none';
  void el.offsetHeight;
  el.style.animation = 'shake 0.35s ease';
  setTimeout(() => { el.style.animation = ''; }, 360);
}

const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-6px); }
  40%, 80% { transform: translateX(6px); }
}
`;
document.head.appendChild(shakeStyle);

// ── Generate Logic ──────────────────────────────────────────
async function handleGenerate() {
  const topic = dom.topicInput?.value.trim() || '';
  if (!topic) {
    dom.topicInput?.focus();
    if (dom.topicInput) shake(dom.topicInput);
    return;
  }

  if (!state.apiKey) {
    dom.apiKeyModal?.removeAttribute('hidden');
    return;
  }

  if (state.isGenerating) return;

  state.isGenerating = true;
  state.variants = [null, null, null];

  if (dom.emptyState) dom.emptyState.style.display = 'none';
  dom.resultsSection?.removeAttribute('hidden');

  if (dom.generateBtn) dom.generateBtn.disabled = true;
  if (dom.generateBtnText) {
    dom.generateBtnText.innerHTML = '<span class="spinner"></span> Генерирую…';
  }

  clearVariantDisplays();
  switchVariant(0);

  try {
    await generateAllVariants(topic);
  } catch (err) {
    console.error('Generation error:', err);
    let msg = err.message || 'Неизвестная ошибка';
    if (/quota|rate|exceeded|429/i.test(msg)) {
      msg = 'Превышен лимит запросов Google Gemini API. Подождите 1 минуту или смените API ключ.';
    }
    showToast(`Ошибка: ${msg}`, 'error');
  } finally {
    state.isGenerating = false;
    if (dom.generateBtn) dom.generateBtn.disabled = false;
    if (dom.generateBtnText) {
      dom.generateBtnText.textContent = 'Сгенерировать';
    }
  }
}

function clearVariantDisplays() {
  for (let i = 0; i < 3; i++) {
    setText(`title-${i}`, '');
    setText(`body-${i}`, '');
    setText(`cta-${i}`, '');
    setText(`hashtags-${i}`, '');
    setText(`image-${i}`, '');
    removeCursor(i);
  }
}

// ── Prompt Builder (Unified for 3 variants) ────────────────
function buildUnifiedPrompt(topic) {
  const platforms = {
    telegram: 'Telegram-канал (до 4096 символов, аккуратное форматирование)',
    youtube: 'YouTube (описание к видео, 300-500 слов, ключевые теги)',
    instagram: 'Instagram (до 2200 символов, эмодзи и хэштэги для охвата)'
  };

  const tones = {
    engaging: 'ВОВЛЕКАЮЩИЙ — активный диалог с читателем, провокационные/открытые вопросы, создание интриги, интерактив (опросы, обсуждение в комментариях), эмоциональная подача.',
    professional: 'ДЕЛОВОЙ / ЭКСПЕРТНЫЙ — строгий, авторитетный и структурированный тон. Факты, конкретные цифры, логика, профессиональная терминология без лишней "воды" и без панибратства.',
    casual: 'ЛЁГКИЙ / ДРУЖЕСКИЙ — тёплый, разговорный стиль, самоирония, понятный язык "на пальцах", ощущение личной беседы за кофе, уместные эмодзи.',
    selling: 'ПРОДАЮЩИЙ — мощный акцент на триггерах (боли, выгода, оффер, снятие возражений, ограничение по времени), четкое позиционирование ценности и сильный призыв к покупке/заявке (CTA).'
  };

  return `Ты профессиональный SMM-копирайтер высшего уровня.
Твоя задача — создать ровно 3 РАЗНЫХ по формату варианта поста для платформы ${platforms[state.platform]}.

Тема поста: "${topic}"

ГЛАВНОЕ ТРЕБОВАНИЕ К СТИЛЮ И ТОНУ:
Весь текст ОБЯЗАН быть строго выдержан в выбранной тональности:
→ ${tones[state.tone]}
Все 3 варианта должны явно отражать именно эту тональность (${state.tone}) по своему словарному запасу, подаче и эмоциональной окраске.

Структура трех вариантов:
- Вариант 1 (индекс 0): Формат "Боль аудитории → Решение проблемы → Конкретный результат" (в заданной тональности).
- Вариант 2 (индекс 1): Формат "Ключевые тезисы, инсайты и практический чек-лист" (в заданной тональности).
- Вариант 3 (индекс 2): Формат "Сторителлинг / жизненная ситуация / яркий кейс" (в заданной тональности).

Верни СТРОГО JSON со следующей структурой:
{
  "variants": [
    {
      "title": "Цепляющий заголовок варианта 1",
      "body": "Текст поста варианта 1 с переносами строк (\\\\n). Объем: ${state.platform === 'youtube' ? '300-500' : '200-400'} символов.",
      "cta": "Призыв к действию",
      "hashtags": "${state.platform === 'instagram' ? '15-20 хэштэгов' : state.platform === 'youtube' ? '3-5 тегов' : '5-10 хэштэгов'}",
      "imagePrompt": "Detailed English image generation prompt for Midjourney/DALL-E. Minimalist, premium, photography/cinematic style, ~60 words."
    },
    {
      "title": "Цепляющий заголовок варианта 2",
      "body": "Текст поста варианта 2 с переносами строк (\\\\n).",
      "cta": "Призыв к действию",
      "hashtags": "${state.platform === 'instagram' ? '15-20 хэштэгов' : state.platform === 'youtube' ? '3-5 тегов' : '5-10 хэштэгов'}",
      "imagePrompt": "Detailed English image generation prompt for Midjourney/DALL-E."
    },
    {
      "title": "Цепляющий заголовок варианта 3",
      "body": "Текст поста варианта 3 с переносами строк (\\\\n).",
      "cta": "Призыв к действию",
      "hashtags": "${state.platform === 'instagram' ? '15-20 хэштэгов' : state.platform === 'youtube' ? '3-5 тегов' : '5-10 хэштэгов'}",
      "imagePrompt": "Detailed English image generation prompt for Midjourney/DALL-E."
    }
  ]
}

Пиши текст поста на русском языке, кроме imagePrompt (он строго на английском). Только чистый JSON без каких-либо markdown-тегов.`;
}

// ── Unified Generation (1 Request for all 3 variants) ──────
async function generateAllVariants(topic) {
  let lastError = null;
  const models = await getAvailableModels(state.apiKey);

  for (const model of models) {
    try {
      await tryGenerateAll(topic, model);
      return;
    } catch (err) {
      console.warn(`Model ${model} failed:`, err.message);
      lastError = err;
      if (/429|quota|rate/i.test(err.message)) {
        // Небольшая задержка перед переходом к запасной модели
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  throw lastError || new Error('Все доступные модели Gemini недоступны.');
}

async function tryGenerateAll(topic, model) {
  const url = `${API_BASE}/${model}:streamGenerateContent?key=${encodeURIComponent(state.apiKey)}&alt=sse`;
  const prompt = buildUnifiedPrompt(topic);

  showCursor(state.activeVariant);

  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.8,
        topP: 0.95,
        maxOutputTokens: 2500,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!res.ok) {
    // Fallback на обычный non-streaming запрос если SSE перегружен
    const fallbackUrl = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(state.apiKey)}`;
    const fallbackRes = await fetch(fallbackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 2500,
          responseMimeType: 'application/json'
        }
      })
    });

    if (fallbackRes.ok) {
      const fbData = await fallbackRes.json();
      const fbText = fbData?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const parsedVariants = parseVariants(fbText);
      if (parsedVariants && parsedVariants.length > 0) {
        removeCursor(state.activeVariant);
        applyVariants(parsedVariants);
        return;
      }
    }

    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    console.error(`[${model}] API error ${res.status}:`, msg);
    throw new Error(msg);
  }

  if (!res.body) {
    throw new Error('Браузер не поддерживает потоковый ответ Gemini');
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let accumulated = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = dec.decode(value, { stream: true });
    for (const line of chunk.split('\n')) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;

      try {
        const parsed = JSON.parse(data);
        const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        accumulated += text;
        renderStreamProgress(accumulated);
      } catch {
        // SSE fragment
      }
    }
  }

  removeCursor(state.activeVariant);
  const parsedVariants = parseVariants(accumulated);
  if (!parsedVariants || parsedVariants.length === 0) {
    throw new Error('Gemini вернул некорректный формат. Попробуйте еще раз.');
  }

  applyVariants(parsedVariants);
}

function applyVariants(variantsList) {
  for (let i = 0; i < 3; i++) {
    const v = variantsList[i] || variantsList[0] || null;
    state.variants[i] = v;
    renderVariant(i, v);
  }
}

// ── API Key Test ────────────────────────────────────────────
async function testApiKey(key) {
  let lastError = 'Ключ не работает';
  const models = await getAvailableModels(key);

  for (const model of models) {
    try {
      const url = `${API_BASE}/${model}:generateContent?key=${encodeURIComponent(key)}`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'OK' }] }]
        })
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { ok: true, msg: `Ключ работает ✓ (${model})` };
      }

      lastError = data?.error?.message || `HTTP ${res.status}`;
      if (!/not found|unsupported|unavailable|404/i.test(lastError)) {
        return { ok: false, msg: lastError };
      }
    } catch (e) {
      lastError = e?.message || 'Ошибка соединения';
    }
  }

  return { ok: false, msg: lastError };
}

// ── Streaming Render & JSON Parsing ────────────────────────
function renderStreamProgress(raw) {
  if (!raw) return;

  // Split out JSON object chunks if possible
  const matches = raw.match(/\{[^{}]*"title"[^{}]*\}/g);
  if (matches && matches.length > 0) {
    matches.forEach((objStr, i) => {
      if (i < 3) {
        const item = extractVariantFields(objStr);
        if (item.title) setText(`title-${i}`, item.title);
        if (item.body) setText(`body-${i}`, item.body);
        if (item.cta) setText(`cta-${i}`, item.cta);
        if (item.hashtags) setText(`hashtags-${i}`, item.hashtags);
        if (item.imagePrompt) setText(`image-${i}`, item.imagePrompt);
      }
    });
  } else {
    // If inside first object
    const item = extractVariantFields(raw);
    const active = state.activeVariant;
    if (item.title) setText(`title-${active}`, item.title);
    if (item.body) setText(`body-${active}`, item.body);
    if (item.cta) setText(`cta-${active}`, item.cta);
    if (item.hashtags) setText(`hashtags-${active}`, item.hashtags);
    if (item.imagePrompt) setText(`image-${active}`, item.imagePrompt);
  }
}

function extractVariantFields(str) {
  const get = field => {
    const m = str.match(new RegExp(`"${field}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)`));
    return m ? m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '';
  };

  return {
    title: get('title'),
    body: get('body'),
    cta: get('cta'),
    hashtags: get('hashtags'),
    imagePrompt: get('imagePrompt')
  };
}

function parseVariants(raw) {
  if (!raw) return null;
  const clean = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();

  // 1. Прямой парсинг всего JSON
  try {
    const parsed = JSON.parse(clean);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
    if (parsed.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
      return parsed.variants.slice(0, 3);
    }
    if (parsed.title) return [parsed, parsed, parsed];
  } catch {}

  // 2. Парсинг подстроки между фигурными или квадратными скобками
  const s = clean.indexOf('{');
  const e = clean.lastIndexOf('}');
  if (s !== -1 && e !== -1) {
    try {
      const parsed = JSON.parse(clean.slice(s, e + 1));
      if (parsed.variants && Array.isArray(parsed.variants) && parsed.variants.length > 0) {
        return parsed.variants.slice(0, 3);
      }
      if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 3);
      if (parsed.title) return [parsed, parsed, parsed];
    } catch {}
  }

  // 3. Извлечение объектов регулярными выражениями
  const list = [];
  const objRegex = /\{[^{}]*?"title"[\s\S]*?\}/g;
  let m;
  while ((m = objRegex.exec(clean)) !== null && list.length < 3) {
    try {
      list.push(JSON.parse(m[0]));
    } catch {
      const extracted = extractVariantFields(m[0]);
      if (extracted.title || extracted.body) {
        list.push(extracted);
      }
    }
  }

  return list.length > 0 ? list : null;
}

function renderVariant(idx, data) {
  if (!data) {
    setText(`title-${idx}`, 'Ошибка генерации. Попробуйте снова.');
    return;
  }

  setText(`title-${idx}`, data.title || '');
  setText(`body-${idx}`, data.body || '');
  setText(`cta-${idx}`, data.cta || '');
  setText(`hashtags-${idx}`, data.hashtags || '');
  setText(`image-${idx}`, data.imagePrompt || '');
}

function setText(id, val) {
  const el = $(id);
  if (el) el.textContent = val;
}

// ── Streaming Cursor ────────────────────────────────────────
function showCursor(idx) {
  removeCursor(idx);
  const el = $(`title-${idx}`);
  if (!el) return;
  const c = document.createElement('span');
  c.className = 'cursor-blink';
  c.id = `cursor-${idx}`;
  el.appendChild(c);
}

function removeCursor(idx) {
  $(`cursor-${idx}`)?.remove();
}

// ── Switch Variant Tab ──────────────────────────────────────
function switchVariant(idx) {
  state.activeVariant = idx;

  document.querySelectorAll('[data-variant]').forEach((btn) => {
    if (btn.classList.contains('tab-btn') || btn.classList.contains('seg-btn')) {
      const match = parseInt(btn.dataset.variant, 10) === idx;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-selected', match ? 'true' : 'false');
    }
  });

  document.querySelectorAll('.panel').forEach((panel, i) => {
    if (i === idx) {
      panel.classList.add('active');
      panel.removeAttribute('hidden');
    } else {
      panel.classList.remove('active');
      panel.setAttribute('hidden', '');
    }
  });

  if (state.variants[idx]) {
    renderVariant(idx, state.variants[idx]);
  }
}

// ── Copy Functionality ──────────────────────────────────────
function copyVariant(idx) {
  const v = state.variants[idx];
  let text = '';

  if (v) {
    text = [v.title, '', v.body, '', v.cta, '', v.hashtags].join('\n');
  } else {
    const g = id => $(id)?.textContent || '';
    text = [g(`title-${idx}`), '', g(`body-${idx}`), '', g(`cta-${idx}`), '', g(`hashtags-${idx}`)].join('\n');
  }

  if (!text.trim()) {
    showToast('Нечего копировать — сгенерируйте текст');
    return;
  }

  copyToClipboard(text, 'Пост скопирован');
}

async function copyToClipboard(text, msg = 'Скопировано') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = Object.assign(document.createElement('textarea'), {
      value: text,
      style: 'position:fixed;left:-9999px'
    });
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  showToast(msg);
}

// ── History Management ──────────────────────────────────────
function saveVariantToHistory(idx) {
  const v = state.variants[idx];
  if (!v) {
    showToast('Дождись завершения генерации');
    return;
  }

  const entry = {
    id: Date.now(),
    platform: state.platform,
    topic: dom.topicInput?.value.trim() || '',
    createdAt: new Date().toISOString(),
    ...v
  };

  state.history.unshift(entry);
  if (state.history.length > MAX_HISTORY) {
    state.history.pop();
  }

  persistHistory();
  renderHistorySidebar();
  showToast('Сохранено в историю');
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history));
}

function renderHistorySidebar() {
  if (!dom.historyCount || !dom.historyList || !dom.historyEmpty) return;

  const count = state.history.length;
  dom.historyCount.textContent = `${count} ${pluralize(count, 'пост', 'поста', 'постов')}`;

  dom.historyList.querySelectorAll('.history-row').forEach(r => r.remove());

  if (count === 0) {
    dom.historyEmpty.style.display = 'block';
    return;
  }

  dom.historyEmpty.style.display = 'none';

  const names = {
    telegram: 'TG',
    youtube: 'YT',
    instagram: 'IG'
  };

  state.history.forEach(entry => {
    const row = document.createElement('div');
    row.className = 'history-row';
    row.dataset.id = entry.id;

    const date = new Date(entry.createdAt).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    row.innerHTML = `
      <div class="history-row-header">
        <span class="history-tag">${names[entry.platform] || 'Post'}</span>
        <span class="history-time">${date}</span>
      </div>
      <div class="history-title-preview">${escHTML(entry.title || entry.topic || 'Без заголовка')}</div>
      <div class="history-row-actions">
        <button class="history-act-btn edit-btn" title="Использовать тему">Тема</button>
        <button class="history-act-btn copy-btn" title="Скопировать">Копировать</button>
        <button class="history-act-btn del-btn" title="Удалить">Удалить</button>
      </div>
    `;

    // Copy action
    row.querySelector('.copy-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      const t = [entry.title, '', entry.body, '', entry.cta, '', entry.hashtags].join('\n');
      copyToClipboard(t, 'Пост скопирован');
    });

    // Edit/Reuse action
    row.querySelector('.edit-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      if (dom.topicInput) {
        dom.topicInput.value = entry.topic || '';
        if (dom.charCount) dom.charCount.textContent = dom.topicInput.value.length;
      }

      document.querySelectorAll('[data-platform]').forEach(btn => {
        const match = btn.dataset.platform === entry.platform;
        btn.classList.toggle('active', match);
        btn.setAttribute('aria-pressed', match ? 'true' : 'false');
      });
      state.platform = entry.platform;

      dom.topicInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      dom.topicInput?.focus();
      showToast('Тема загружена');
    });

    // Delete action
    row.querySelector('.del-btn')?.addEventListener('click', e => {
      e.stopPropagation();
      row.style.opacity = '0';
      setTimeout(() => {
        state.history = state.history.filter(h => h.id !== entry.id);
        persistHistory();
        renderHistorySidebar();
      }, 150);
    });

    dom.historyList.appendChild(row);
  });
}

function clearAllHistory() {
  if (!state.history.length) return;
  if (!confirm(`Удалить все ${state.history.length} записей из истории?`)) return;

  state.history = [];
  persistHistory();
  renderHistorySidebar();
  showToast('История очищена');
}

// ── Helpers ─────────────────────────────────────────────────
function escHTML(s) {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function pluralize(n, one, few, many) {
  const m = Math.abs(n) % 100;
  const m1 = m % 10;
  if (m > 10 && m < 20) return many;
  if (m1 === 1) return one;
  if (m1 >= 2 && m1 <= 4) return few;
  return many;
}

// ── Toast ───────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg, type = 'info') {
  if (!dom.toast || !dom.toastMsg) return;

  dom.toastMsg.textContent = msg;
  dom.toast.className = `toast ${type === 'error' ? 'error' : ''} show`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    dom.toast.classList.remove('show');
  }, 2800);
}

// ── Boot ────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);