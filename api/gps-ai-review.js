// Vercel Serverless Function: Google Gemini 기반 GPS 포지션 맞춤 AI 코칭 리뷰 생성
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || req.body?.apiKey;
  if (!apiKey) {
    return res.status(400).json({ error: 'NO_API_KEY' });
  }

  try {
    const { prompt } = req.body || {};
    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.85,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    const data = await response.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    const rawText = parts.map(p => p.text || '').join('\n').trim();
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    const cleaned = (jsonMatch ? jsonMatch[0] : rawText).replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json({ ok: true, review: parsed });
  } catch (err) {
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

