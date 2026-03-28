const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/scrape', async (req, res) => {
  try {
    const { url = 'https://www.freelancermap.de/app/pobox/main' } = req.body;
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url);
    await page.waitForLoadState('networkidle');

    try {
      await page.locator('#onetrust-accept-btn-handler').first().click({ timeout: 5000 });
    } catch (e) {
      try {
        await page.click('.ot-sdk-accept-all-btn', { timeout: 5000 });
      } catch (e2) {
        console.log('Cookie-Banner konnte nicht akzeptiert werden');
      }
    }


    await page.fill('input[id="login"]', 'atanas.alexandrov@posteo.de');
    await page.fill('input[id="password"]', 'WaoHaBsQ66eKTS-M');
    await page.click('div.login-card button[data-id="login-submit-button"]');

    await page.waitForLoadState('networkidle');
    const html = await page.content();
    await browser.close();
    
    res.json({ success: true, url, html, length: html.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generic URL fetch endpoint (no login, just scrape HTML)
app.post('/fetch', async (req, res) => {
  try {
    const { url, waitForSelector, timeout: reqTimeout = 30000 } = req.body;
    if (!url) return res.status(400).json({ error: 'URL required' });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE'
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: reqTimeout });

    // Accept cookie banners
    const cookieSelectors = [
      '#onetrust-accept-btn-handler',
      '.ot-sdk-accept-all-btn',
      'button[data-testid="accept-all"]',
      '#accept-all-cookies',
      '.cookie-accept',
      'button.acceptCookies',
      '#CybotCookiebotDialogBodyButtonAccept',
      '.js-accept-cookies'
    ];
    for (const sel of cookieSelectors) {
      try {
        await page.click(sel, { timeout: 2000 });
        await page.waitForTimeout(500);
        break;
      } catch (e) { /* try next */ }
    }

    if (waitForSelector) {
      try { await page.waitForSelector(waitForSelector, { timeout: 5000 }); } catch (e) {}
    }

    const html = await page.content();
    const finalUrl = page.url();
    await browser.close();

    res.json({ success: true, url: finalUrl, html });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Fetch multiple URLs in a single browser session
app.post('/fetch-multi', async (req, res) => {
  try {
    const { urls, timeout: reqTimeout = 30000 } = req.body;
    if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'urls array required' });

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE'
    });

    const cookieSelectors = [
      '#onetrust-accept-btn-handler', '.ot-sdk-accept-all-btn',
      'button[data-testid="accept-all"]', '#accept-all-cookies',
      '.cookie-accept', 'button.acceptCookies',
      '#CybotCookiebotDialogBodyButtonAccept', '.js-accept-cookies'
    ];

    const results = [];
    let cookiesAccepted = false;

    for (const url of urls) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: reqTimeout });

        if (!cookiesAccepted) {
          for (const sel of cookieSelectors) {
            try {
              await page.click(sel, { timeout: 2000 });
              await page.waitForTimeout(300);
              cookiesAccepted = true;
              break;
            } catch (e) { /* try next */ }
          }
        }

        const html = await page.content();
        results.push({ url, success: true, html });
      } catch (e) {
        results.push({ url, success: false, error: e.message, html: '' });
      } finally {
        await page.close();
      }
    }

    await browser.close();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Kennzahlen direkt aus ariva.de extrahieren (strukturiertes JSON, kein HTML-Parsen nötig)
app.post('/extract-kennzahlen', async (req, res) => {
  try {
    const { kennzahlenUrl, timeout: reqTimeout = 45000 } = req.body;
    if (!kennzahlenUrl) return res.status(400).json({ error: 'kennzahlenUrl required' });

    const bilanzUrl   = kennzahlenUrl.replace('/kennzahlen/fundamentale-kennzahlen', '/bilanz');
    const dividendeUrl = kennzahlenUrl.replace('/kennzahlen/fundamentale-kennzahlen', '/dividende');

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'de-DE'
    });

    const cookieSelectors = [
      '#onetrust-accept-btn-handler', '.ot-sdk-accept-all-btn',
      'button[data-testid="accept-all"]', '#accept-all-cookies',
      '.cookie-accept', 'button.acceptCookies',
      '#CybotCookiebotDialogBodyButtonAccept', '.js-accept-cookies'
    ];

    async function extractTables(url, acceptCookies) {
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: reqTimeout });
        if (acceptCookies) {
          for (const sel of cookieSelectors) {
            try { await page.click(sel, { timeout: 2000 }); break; } catch (e) {}
          }
        }
        // Warte bis mindestens eine Tabelle geladen ist
        try { await page.waitForSelector('table', { timeout: 8000 }); } catch (e) {}

        const tables = await page.evaluate(() => {
          const result = {};
          document.querySelectorAll('table tr').forEach(row => {
            const cells = Array.from(row.querySelectorAll('td, th'));
            if (cells.length < 2) return;
            const label = cells[0].innerText.trim().toLowerCase().replace(/\s+/g, ' ');
            const values = cells.slice(1).map(c => c.innerText.trim());
            const nonEmpty = values.filter(v => v !== '' && v !== '-').length;
            if (label && nonEmpty > 0) {
              const existing = (result[label] || []).filter(v => v !== '' && v !== '-').length;
              if (nonEmpty > existing) result[label] = values;
            }
          });
          return result;
        });
        return tables;
      } finally {
        await page.close();
      }
    }

    const kennzahlen = await extractTables(kennzahlenUrl, true);

    await browser.close();
    res.json({ success: true, kennzahlen });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Farben für conditional formatting
const COLORS = {
  green:  'FFb7e1cd',
  orange: 'FFf6b26b',
  red:    'FFe06666'
};

// Regeln pro Spalte: gibt 'green', 'orange', 'red' oder null zurück
function pctColor(v) {
  const n = parseFloat(String(v).replace('%', ''));
  if (isNaN(n)) return null;
  if (n < 30)  return 'red';
  if (n < 70)  return 'orange';
  return 'green';
}

const COLUMN_RULES = {
  'C1: DivRendite aktuell': v => {
    const n = parseFloat(String(v).replace('%', ''));
    if (isNaN(n)) return null;
    if (n >= 8)  return 'green';
    if (n >= 5)  return 'orange';
    return 'red';
  },
  'C2: Boerse >15 Jahre':                      v => v === 'Ja' ? 'green' : v === 'Nein' ? 'red' : null,
  'C3: Positiver Cashflow':                    v => v === 'Ja' ? 'green' : v === 'Nein' ? 'red' : null,
  'C4: Eigenkapitalquote >=30% (letzte 10J)':  pctColor,
  'C5: Verschuldungsgrad aktuell': v => {
    const n = parseFloat(String(v).replace('%', ''));
    if (isNaN(n)) return null;
    if (n <= 150) return 'green';
    if (n <= 250) return 'orange';
    return 'red';
  },
  'C6: KGV aktuell': v => {
    const n = parseFloat(String(v));
    if (isNaN(n)) return null;
    if (n < 15)  return 'green';
    if (n < 20)  return 'orange';
    return 'red';
  },
  'C7: KBV <=2 (letzte 10J)':                  pctColor,
  'C8: Eigenkapitalrendite >=10% (letzte 10J)': pctColor,
  'C9: DivRendite >=2,5% (letzte 10J)':         pctColor,
  'C10: Umsatzrendite >=5% (letzte 10J)':       pctColor,
  'C11: Global taetig':                         v => v === 'Ja' ? 'green' : v === 'Nein' ? 'red' : null,
};

// XLSX-Export Endpoint
app.post('/export', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { rows, filename = 'aktien-dividenden-analyse.xlsx' } = req.body;
    if (!rows || !rows.length) return res.status(400).json({ error: 'rows required' });

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Aktienanalyse');

    const cols = Object.keys(rows[0]);
    ws.columns = cols.map(c => ({ header: c, key: c, width: 28 }));

    // Header-Zeile fett
    ws.getRow(1).font = { bold: true };

    rows.forEach((row, rowIdx) => {
      ws.addRow(row);
      const rowNum = rowIdx + 2; // Zeile 1 = Header
      cols.forEach((col, colIdx) => {
        const rule = COLUMN_RULES[col];
        if (rule) {
          const color = rule(String(row[col] ?? ''));
          if (color) {
            ws.getCell(rowNum, colIdx + 1).fill = {
              type: 'pattern', pattern: 'solid',
              fgColor: { argb: COLORS[color].toUpperCase() }
            };
          }
        }
      });
    });

    const outputPath = `/home/pwuser/output/${filename}`;
    await workbook.xlsx.writeFile(outputPath);
    res.json({ success: true, path: outputPath, count: rows.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(3001, '0.0.0.0');
console.log('🚀 Playwright Server auf http://localhost:3001');
