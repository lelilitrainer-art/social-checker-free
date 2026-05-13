const { chromium } = require('playwright');

async function main() {
  console.log('Social checker running...');

  const browser = await chromium.launch({
    headless: true
  });

  const page = await browser.newPage();

  await page.goto('https://example.com');

  console.log(await page.title());

  await browser.close();
}

main();
