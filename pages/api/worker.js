// /api/worker.js

import puppeteer from 'puppeteer-core';
import axios from 'axios';
import cheerio from 'cheerio';

const BROWSERLESS_WS = `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`;

let ipRequests = new Map(); // Reiniciado a cada execução

export default async function handler(req, res) {
  // CORS preflight
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
    // Tentar primeiro com Browserless + Puppeteer
    if (process.env.BROWSERLESS_TOKEN) {
      try {
        browser = await puppeteer.connect({ browserWSEndpoint: BROWSERLESS_WS });
        const page = await browser.newPage();
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    
        const visibleText = await page.evaluate(() => {
          const body = document.querySelector('body');
          return body ? body.innerText.trim() : '';
        });
    
        return res.status(200).json({ text: visibleText });
    
      } catch (puppeteerErr) {
        console.warn('⛔ Erro no Puppeteer:', puppeteerErr);
    
        return res.status(200).json({
          error: true,
          message: 'Erro ao carregar com Browserless',
          detail: puppeteerErr.message,
        });
      }
    } else {
      return res.status(200).json({
        error: true,
        message: 'BROWSERLESS_TOKEN não está configurado no servidor.',
      });
    }
  } catch (err) {
    console.warn('⛔ Erro no Browserless, usando fallback com axios + cheerio...', err.message);

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
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const visibleText = $('body').text().replace(/\s+/g, ' ').trim();

      return res.status(200).json({ text: visibleText });

    } catch (fallbackErr) {
      console.error('🔥 Fallback falhou:', fallbackErr);

      return res.status(500).json({
        error: 'Erro ao buscar o conteúdo (Puppeteer e Fallback falharam)',
        message: fallbackErr.message,
        code: fallbackErr.code || null,
        status: fallbackErr.response?.status || null,
        data:
          typeof fallbackErr.response?.data === 'string'
            ? fallbackErr.response.data.slice(0, 500)
            : 'Sem conteúdo retornado',
      });
    }

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
