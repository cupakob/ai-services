const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({
    headless: true // fürs Debuggen sichtbar
  });

  const context = await browser.newContext();
  const page = await context.newPage();

  console.log("Gehe zur Login-Seite...");

  await page.goto('https://www.freelancermap.de/login', {
    waitUntil: 'networkidle'
  });

  // WICHTIG:
  // Die Selectoren musst du evtl. anpassen!
  await page.fill('input[id="login"]', 'atanas.alexandrov@posteo.de');
  await page.fill('input[id="password"]', 'WaoHaBsQ66eKTS-M');

  await page.click('button[data-id="login-submit-button"]');

  // Warten bis Navigation abgeschlossen ist
  await page.waitForLoadState('networkidle');

  console.log("Login abgeschlossen");

  // Test: Zielseite öffnen
  await page.goto('https://www.freelancermap.de/projekte', {
    waitUntil: 'networkidle'
  });

  const html = await page.content();
  console.log("HTML Länge:", html.length);
  

  console.log('→ Navigiere zu Projekten...');
  await page.goto('https://www.freelancermap.de/posteingang.html?id=4017597&context=pobox&token=kPqmu3XDUix1jkFwWqacDxaqNGNmadvpUAoPIOxC');  
  await page.waitForLoadState('networkidle');  // Warte bis alles geladen

  // Neue HTML holen
  const anfrageHtml = await page.content();

  // HTML in Datei schreiben
  const fs = require('fs');
  fs.writeFileSync('page.html', anfrageHtml);
  console.log('HTML gespeichert als page.html');
  
  await browser.close();
})();
