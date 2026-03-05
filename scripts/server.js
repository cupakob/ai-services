const express = require('express');
const { chromium } = require('playwright');
const app = express();
app.use(express.json());

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

app.listen(3001, '0.0.0.0');
console.log('🚀 Playwright Server auf http://localhost:3001');
