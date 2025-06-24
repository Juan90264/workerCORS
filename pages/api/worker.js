// /api/worker.js

import axios from 'axios';
import cheerio from 'cheerio';

let ipRequests = new Map(); // Memória local (reinicia a cada execução)

export default async function handler(req, res) {
  // 🛑 CORS preflight (OPTIONS)
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    return res.status(204).end();
  }

  const targetUrl = req.query.url;

  if (!targetUrl) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    return res.status(400).send("Missing 'url' parameter.");
  }

  // 📍 IP do usuário
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, timestamp: now };

  // ⏱ Resetar contador após 1 minuto
  if (now - entry.timestamp > 60 * 1000) {
    entry.count = 0;
    entry.timestamp = now;
  }

  if (entry.count >= 20) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    return res.status(429).send('Limite de requisições atingido. Tente novamente em 1 minuto.');
  }

  entry.count++;
  ipRequests.set(ip, entry);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
                      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': targetUrl,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      },
      timeout: 10000 // Máx. 10 segundos
    });

    // 🧼 Texto limpo com cheerio
    if (req.query.cheerio === '1') {
      const $ = cheerio.load(response.data);
      const visibleText = $('body').text().replace(/\s+/g, ' ').trim();

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).json({ text: visibleText });
    }

    // 🌐 HTML completo
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
    return res.status(200).send(response.data);

  } catch (err) {
    // 🔍 Debug detalhado
    console.error('Erro:', err);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    res.setHeader('Content-Type', 'application/json');

    return res.status(500).json({
      error: 'Erro ao buscar o conteúdo',
      message: err.message,
      code: err.code || null,
      status: err.response?.status || null,
      data: typeof err.response?.data === 'string'
        ? err.response.data.slice(0, 500)
        : 'Sem conteúdo retornado'
    });
  }
}
