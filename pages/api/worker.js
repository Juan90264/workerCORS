// /api/worker.js

import chromium from 'puppeteer-core';

const BROWSERLESS_WS = 'wss://chrome.browserless.io?token=2SYc3l8GJibInig42f94e2a45380b433c6d83a8e1e1713776';

let ipRequests = new Map(); // Memória local (reinicia a cada execução)

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

  let browser = null;

  try {
    browser = await chromium.connect({
      browserWSEndpoint: BROWSERLESS_WS,
    });

    const page = await browser.newPage();

    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });

    const visibleText = await page.evaluate(() => {
      const body = document.querySelector('body');
      return body ? body.innerText.replace(/\s+/g, ' ').trim() : '';
    });

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
      error: 'Erro ao buscar o conteúdo via Browserless',
      message: err.message,
      code: err.code || null,
      status: err.response?.status || null,
      data: err.response?.data ? err.response.data.slice(0, 500) : 'Sem conteúdo retornado'
    });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
