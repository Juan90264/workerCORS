// /api/worker.js

export const config = {
  runtime: 'nodejs'
};

import puppeteer from 'puppeteer-core';
import axios from 'axios';
import cheerio from 'cheerio';

const BROWSERLESS_WS = `wss://production-sfo.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`;
let ipRequests = new Map();

// 🛡️ Função que garante CORS em todas as respostas
function safeJson(res, statusCode, data) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Cache-Control');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.status(statusCode).json(data);
}

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return safeJson(res, 204, {});
  }

  const targetUrl = req.query.url;
  if (!targetUrl) {
    return safeJson(res, 400, { error: true, message: "Missing 'url' parameter." });
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0] || 'unknown';
  const now = Date.now();
  const entry = ipRequests.get(ip) || { count: 0, timestamp: now };

  if (now - entry.timestamp > 60 * 1000) {
    entry.count = 0;
    entry.timestamp = now;
  }

  if (entry.count >= 20) {
    return safeJson(res, 429, {
      error: true,
      message: 'Limite de requisições atingido. Tente novamente em 1 minuto.'
    });
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

        return safeJson(res, 200, { text: visibleText });

      } catch (puppeteerErr) {
        console.warn('⛔ Erro no Puppeteer:', puppeteerErr.message);

        if (puppeteerErr.message.includes('429')) {
          console.log('🔁 Limitado no Browserless (429), caindo para fallback...');
          // Continua para o fallback
        } else {
          return safeJson(res, 200, {
            error: true,
            message: 'Erro ao carregar com Browserless',
            detail: puppeteerErr.message
          });
        }
      }
    } else {
      return safeJson(res, 200, {
        error: true,
        message: 'BROWSERLESS_TOKEN não está configurado no servidor.'
      });
    }

  } catch (err) {
    console.warn('⛔ Erro geral no Browserless:', err.message);
    // Continua para o fallback
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        console.warn('⚠️ Erro ao fechar o navegador:', e);
      }
    }
  }

  // 🔁 Fallback com axios + cheerio
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

    return safeJson(res, 200, { text: visibleText });

  } catch (fallbackErr) {
    console.error('🔥 Fallback com axios falhou:', fallbackErr);

    return safeJson(res, 200, {
      error: true,
      message: 'Erro ao buscar o conteúdo (falha no Puppeteer e fallback)',
      detail: fallbackErr.message,
      status: fallbackErr.response?.status || null
    });
  }
}
