// /api/worker.js

import axios from 'axios';
import cheerio from 'cheerio';

let ipRequests = new Map(); // Memória local (zerada a cada deploy)

export default async function handler(req, res) {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("Missing 'url' parameter.");
  }

  // 💡 IP do usuário
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';

  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, timestamp: now };

  // ⏱ Resetar contador se passou mais de 1 minuto
  if (now - entry.timestamp > 60 * 1000) {
    entry.count = 0;
    entry.timestamp = now;
  }

  if (entry.count >= 20) {
    return res.status(429).send('Limite de requisições atingido. Tente novamente em 1 minuto.');
  }

  entry.count++;
  ipRequests.set(ip, entry);

  try {
    const response = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Referer': targetUrl
      }
    });

    // 👉 Caso você queira extrair apenas texto visível com cheerio:
    if (req.query.cheerio === '1') {
      const $ = cheerio.load(response.data);
      const visibleText = $('body').text().replace(/\s+/g, ' ').trim();
      return res.status(200).json({ text: visibleText });
    }

    // Ou retornar tudo como HTML
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers['content-type'] || 'text/html');
    res.status(200).send(response.data);
  } catch (err) {
    res.status(500).send('Erro ao buscar o conteúdo: ' + err.message);
  }
}
