// /api/worker.js

import puppeteer from 'puppeteer-core';

const BROWSERLESS_WS = `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`;

let ipRequests = new Map(); // Reiniciado a cada execução

export default async function handler(req, res) {
  // 🌐 CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).json({ error: "Missing 'url' parameter." });
  }

  if (!process.env.BROWSERLESS_TOKEN) {
    return res.status(500).json({ error: 'BROWSERLESS_TOKEN não configurado.' });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, timestamp: now };

  if (now - entry.timestamp > 60 * 1000) {
    entry.count = 0;
    entry.timestamp = now;
  }

  if (entry.count >= 20) {
    return res.status(429).json({ error: 'Limite de requisições atingido. Tente novamente em 1 minuto.' });
  }

  entry.count++;
  ipRequests.set(ip, entry);

  let browser = null;

  try {
    browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const visibleText = await page.evaluate(() => {
      const body = document.querySelector('body');
      return body ? body.innerText.replace(/\s+/g, ' ').trim() : '';
    });

    return res.status(200).json({ text: visibleText });
  } catch (err) {
    console.error('Erro:', err);

    return res.status(500).json({
      error: 'Erro ao buscar o conteúdo via Browserless',
      message: err.message,
      code: err.code || null,
      status: err.response?.status || null,
      data:
        typeof err.response?.data === 'string'
          ? err.response.data.slice(0, 500)
          : 'Sem conteúdo retornado',
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn('Erro ao fechar o navegador:', e);
      }
    }
  }
}
