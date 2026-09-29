'use strict';

const GEMINI_MODEL = 'gemini-2.5-flash';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on Vercel.'
    });
  }

  try {
    const {
      topic,
      platform = 'telegram',
      tone = 'engaging'
    } = req.body || {};

    if (!topic || !String(topic).trim()) {
      return res.status(400).json({
        error: 'Тема не указана.'
      });
    }

    const platforms = {
      telegram:
        'Telegram-канал (до 4096 символов, аккуратное форматирование)',

      youtube:
        'YouTube (описание к видео, 300-500 слов, ключевые теги)',

      instagram:
        'Instagram (до 2200 символов, эмодзи и хэштеги для охвата)'
    };

    const tones = {
      engaging:
        'ВОВЛЕКАЮЩИЙ — активный диалог с читателем, открытые вопросы, интрига и эмоциональная подача.',

      professional:
        'ДЕЛОВОЙ / ЭКСПЕРТНЫЙ — строгий, авторитетный и структурированный тон.',

      casual:
        'ЛЁГКИЙ / ДРУЖЕСКИЙ — тёплый, разговорный стиль, понятный язык и естественная подача.',

      selling:
        'ПРОДАЮЩИЙ — акцент на проблеме, выгоде, оффере, ценности и сильном призыве к действию.'
    };

    const prompt = `Ты профессиональный SMM-копирайтер высшего уровня.

Создай ровно 3 РАЗНЫХ по формату варианта поста.

Платформа:
${platforms[platform] || platforms.telegram}

Тема:
"${String(topic).trim()}"

Тон:
${tones[tone] || tones.engaging}

Требования:

1. Все три варианта должны быть действительно разными.
2. Текст должен звучать естественно и современно.
3. Не используй клише.
4. Не придумывай факты, которых нет в теме.
5. Добавь короткий призыв к действию.
6. Добавь релевантные хэштеги.
7. imagePrompt должен быть только на английском языке.
8. Верни только JSON без markdown.

Структура:

{
  "variants": [
    {
      "title": "Цепляющий заголовок",
      "body": "Основной текст",
      "cta": "Призыв к действию",
      "hashtags": "#example #example",
      "imagePrompt": "Detailed English image generation prompt, minimalist premium cinematic photography, approximately 60 words."
    },
    {
      "title": "Цепляющий заголовок",
      "body": "Основной текст",
      "cta": "Призыв к действию",
      "hashtags": "#example #example",
      "imagePrompt": "Detailed English image generation prompt."
    },
    {
      "title": "Цепляющий заголовок",
      "body": "Основной текст",
      "cta": "Призыв к действию",
      "hashtags": "#example #example",
      "imagePrompt": "Detailed English image generation prompt."
    }
  ]
}

Пиши основной текст на русском языке.`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 0.8,
          topP: 0.95,
          maxOutputTokens: 2500,
          responseMimeType: 'application/json'
        }
      })
    });

    const rawText = await response.text();

    let data;

    try {
      data = JSON.parse(rawText);
    } catch {
      return res.status(502).json({
        error: 'Gemini вернул некорректный ответ.'
      });
    }

    if (!response.ok) {
      const message =
        data?.error?.message ||
        `Gemini API error: ${response.status}`;

      console.error('[Gemini]', message);

      return res.status(response.status).json({
        error: message
      });
    }

    const text =
      data?.candidates?.[0]?.content?.parts
        ?.map(part => part?.text || '')
        .join('')
        .trim();

    if (!text) {
      return res.status(502).json({
        error: 'Gemini не вернул текст.'
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');

      if (start !== -1 && end > start) {
        try {
          parsed = JSON.parse(
            text.slice(start, end + 1)
          );
        } catch {
          parsed = null;
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.variants)) {
      return res.status(502).json({
        error: 'Gemini вернул некорректный формат.'
      });
    }

    return res.status(200).json(parsed);

  } catch (error) {
    console.error('[API]', error);

    return res.status(500).json({
      error:
        error?.message ||
        'Внутренняя ошибка сервера.'
    });
  }
};