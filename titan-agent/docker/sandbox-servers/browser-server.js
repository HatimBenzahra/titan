const express = require('express');
const { chromium } = require('playwright');

const app = express();
app.use(express.json({ limit: '10mb' }));

let browser = null;

// Initialize browser on startup
async function initBrowser() {
  try {
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-setuid-sandbox']
    });
    console.log('Browser initialized successfully');
  } catch (error) {
    console.error('Failed to initialize browser:', error);
    throw error;
  }
}

// Browser actions endpoint
app.post('/execute', async (req, res) => {
  const { action, url, selector, instructions, timeout = 15000 } = req.body;

  if (!browser) {
    return res.status(503).json({ success: false, error: 'Browser not initialized' });
  }

  const page = await browser.newPage();

  try {
    switch (action) {
      case 'open':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        res.json({ success: true, url: page.url() });
        break;

      case 'read':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        const content = await page.content();
        const textContent = await page.evaluate(() => document.body.innerText);
        res.json({
          success: true,
          content,
          textContent,
          url: page.url(),
          title: await page.title()
        });
        break;

      case 'screenshot':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        const screenshot = await page.screenshot({ fullPage: false });
        res.json({ success: true, screenshot: screenshot.toString('base64'), url: page.url() });
        break;

      case 'extract_table':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        const tables = await page.$$eval('table', tables =>
          tables.map(t => Array.from(t.rows).map(r =>
            Array.from(r.cells).map(c => c.textContent.trim())
          ))
        );
        res.json({ success: true, tables, url: page.url() });
        break;

      case 'click':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        await page.click(selector, { timeout: 5000 });
        await page.waitForLoadState('networkidle', { timeout: 5000 });
        res.json({ success: true, url: page.url() });
        break;

      case 'fill_form':
        await page.goto(url, { timeout, waitUntil: 'networkidle' });
        for (const [sel, value] of Object.entries(instructions)) {
          await page.fill(sel, value, { timeout: 5000 });
        }
        res.json({ success: true, url: page.url() });
        break;

      default:
        res.status(400).json({ success: false, error: 'Unknown action' });
    }
  } catch (error) {
    console.error(`Browser action '${action}' failed:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      action: action
    });
  } finally {
    await page.close().catch(err => console.error('Failed to close page:', err));
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    browser: browser ? 'ready' : 'not initialized',
    timestamp: new Date().toISOString()
  });
});

const PORT = 3002;
initBrowser().then(() => {
  app.listen(PORT, () => {
    console.log(`Browser server listening on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to start browser server:', error);
  process.exit(1);
});

// Cleanup on shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing browser...');
  if (browser) {
    await browser.close();
  }
  process.exit(0);
});
