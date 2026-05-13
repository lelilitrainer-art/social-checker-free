const { chromium } = require('playwright');

function countNumberFromText(text) {
  if (!text) return 0;

  let s = String(text).toLowerCase().trim();

  const hasK = s.includes('k') || s.includes('nghìn');
  const hasM = s.includes('m') || s.includes('tr') || s.includes('triệu');
  const hasB = s.includes('b') || s.includes('tỷ');

  s = s.replace(/,/g, '.').replace(/[^\d.]/g, '');

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;

  if (hasB) return Math.round(n * 1000000000);
  if (hasM) return Math.round(n * 1000000);
  if (hasK) return Math.round(n * 1000);

  return Math.round(n);
}

async function scrapeOne(browser, item) {
  const context = await browser.newContext({
    locale: 'vi-VN',
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    await page.goto(item.url, {
      waitUntil: 'domcontentloaded',
      timeout: 45000
    });

    await page.waitForTimeout(8000);

    const bodyText = await page.locator('body').innerText().catch(() => '');

    const metaDescription = await page
      .locator('meta[name="description"]')
      .getAttribute('content')
      .catch(() => '');

    const ogDescription = await page
      .locator('meta[property="og:description"]')
      .getAttribute('content')
      .catch(() => '');

    const ogTitle = await page
      .locator('meta[property="og:title"]')
      .getAttribute('content')
      .catch(() => '');

    const text = [metaDescription, ogDescription, ogTitle, bodyText]
      .filter(Boolean)
      .join('\n')
      .slice(0, 5000);

    let likeCount = 0;

    const likeMatch =
      bodyText.match(/([\d.,]+\s?[kKmMbB]?)\s*(lượt thích|likes?|reactions?|cảm xúc)/i) ||
      bodyText.match(/([\d.,]+\s?(nghìn|tr|triệu|tỷ)?)\s*(lượt thích|cảm xúc)/i);

    if (likeMatch) {
      likeCount = countNumberFromText(likeMatch[1]);
    }

    const lower = bodyText.toLowerCase();

    const hasMedia =
      lower.includes('reel') ||
      lower.includes('video') ||
      lower.includes('watch') ||
      item.url.includes('/reel/') ||
      item.url.includes('/share/r/') ||
      item.url.includes('/videos/') ||
      item.url.includes('tiktok.com');

    await context.close();

    return {
      row: item.row,
      url: item.url,
      ok: true,
      text,
      likeCount,
      hasMedia,
      note: 'FREE_PLAYWRIGHT_CALLBACK_OK'
    };

  } catch (err) {
    await context.close();

    return {
      row: item.row,
      url: item.url,
      ok: false,
      text: '',
      likeCount: 0,
      hasMedia: false,
      note: 'FREE_PLAYWRIGHT_ERROR: ' + String(err.message || err).slice(0, 500)
    };
  }
}

async function main() {
  const rowsJson = process.env.ROWS_JSON || '[]';
  const callbackUrl = process.env.CALLBACK_URL;

  if (!callbackUrl) {
    throw new Error('Missing CALLBACK_URL');
  }

  const rows = JSON.parse(rowsJson);

  const browser = await chromium.launch({
    headless: true
  });

  const results = [];

  for (const row of rows) {
    const result = await scrapeOne(browser, row);
    results.push(result);
  }

  await browser.close();

  const response = await fetch(callbackUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ results })
  });

  const responseText = await response.text();

  console.log('Callback status:', response.status);
  console.log('Callback response:', responseText);

  if (!response.ok) {
    throw new Error('Callback failed: ' + response.status + ' ' + responseText);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
