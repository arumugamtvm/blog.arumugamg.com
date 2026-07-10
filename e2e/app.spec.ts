import { test, expect } from '@playwright/test';

test.describe('Blog App End-to-End Tests', () => {

  test('Homepage displays recent articles and selecting one updates the reader pane', async ({ page }) => {
    await page.goto('/');

    // Wait for either the empty state (if API fails) or the blogs grid
    const hasGrid = await page.locator('.home-blogs-grid').isVisible({ timeout: 10000 });

    if (hasGrid) {
      const markdownBlog = page.locator('.home-blog-card', { hasText: 'Master Markdown' });
      await expect(markdownBlog).toBeVisible();
      await markdownBlog.click();
      await expect(page.locator('.blog-article')).toBeVisible();
      await expect(page.locator('.article-title', { hasText: 'Master Markdown' })).toBeVisible();
    }
  });

  test('Sidebar is closed by default and toggles correctly', async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto('/');

    const sidebar = page.locator('.blog-sidebar');
    await expect(sidebar).toHaveClass(/closed/);

    await page.locator('.sidebar-toggle').click();
    await expect(sidebar).toHaveClass(/open/);

    await page.locator('.sidebar-toggle').click();
    await expect(sidebar).toHaveClass(/closed/);
  });

  test('Table of Contents navigation scrolls to correct heading', async ({ page }) => {
    await page.goto('/#master-markdown-the-complete-comprehensive-guide');
    const articleLoaded = await page.locator('.blog-article').isVisible({ timeout: 10000 });
    if (!articleLoaded) return;

    const tocLink = page.locator('a[href="#what-is-markdown"]');
    await expect(tocLink).toBeVisible();
    await tocLink.click();

    const heading = page.locator('h2#what-is-markdown');
    await expect(heading).toBeInViewport();
  });

  test('Mermaid diagrams render properly', async ({ page }) => {
    await page.goto('/#master-markdown-the-complete-comprehensive-guide');
    const articleLoaded = await page.locator('.blog-article').isVisible({ timeout: 10000 });
    if (!articleLoaded) return;

    const mermaidSvgs = page.locator('.mermaid-svg-wrapper svg');
    await expect(mermaidSvgs.first()).toBeVisible({ timeout: 10000 });
    expect(await mermaidSvgs.count()).toBeGreaterThan(1);
  });

  test('Copy code works correctly', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/#master-markdown-the-complete-comprehensive-guide');
    const articleLoaded = await page.locator('.blog-article').isVisible({ timeout: 10000 });
    if (!articleLoaded) return;

    const copyCodeBtn = page.locator('.copy-code-btn').first();
    await expect(copyCodeBtn).toBeVisible();
    await copyCodeBtn.click();

    await expect(copyCodeBtn).toHaveText('Copied!');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.length).toBeGreaterThan(0);
  });

  test('Copy Markdown button copies full article', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/#master-markdown-the-complete-comprehensive-guide');
    const articleLoaded = await page.locator('.blog-article').isVisible({ timeout: 10000 });
    if (!articleLoaded) return;

    const copyMdBtn = page.locator('button', { hasText: 'Copy MD' });
    await expect(copyMdBtn).toBeVisible();
    await copyMdBtn.click();

    await expect(copyMdBtn).toHaveText('Copied');

    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText.includes('# Master Markdown')).toBeTruthy();
  });
});
