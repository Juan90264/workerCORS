// /api/worker.js

import puppeteer from 'puppeteer';

let ipRequests = new Map();

export default async function handler(req, res) {
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

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, timestamp: now };

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
    const browser = await puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: true,
    });

    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    );

    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 15000 });

    // Extrair texto visível do body
    const visibleText = await page.evaluate(() => {
      // Remove scripts, styles e elementos indesejados
      const removeSelectors = ['script', 'style', 'noscript', 'iframe', 'header', 'footer', 'nav', '.ads', '.promo'];
      removeSelectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });
      return document.body.innerText.replace(/\s+/g, ' ').trim();
    });

    await browser.close();

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ text: visibleText });

  } catch (err) {
    console.error('Erro:', err);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({
      error: 'Erro ao buscar o conteúdo via Puppeteer',
      message: err.message,
      code: err.code || null,
      status: err.response?.status || null,
      data: typeof err.response?.data === 'string' ? err.response.data.slice(0, 500) : 'Sem conteúdo retornado',
    });
  }
}
