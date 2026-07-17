import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const routes = ['/', '/courses', '/faculty', '/activities', '/stories', '/about', '/contact', '/privacy']

for (const route of routes) {
  test(`${route} renders without overflow`, async ({ page }) => {
    await page.goto(route)
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('contentinfo')).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(1)
  })
}

test('homepage exposes the selected ticket archive hierarchy', async ({ page }, testInfo) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: '音乐课程与艺术活动' })).toBeVisible()
  await expect(page.getByText('近期活动', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.activity-ticket').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true })
})

test('primary pages have no serious accessibility violations', async ({ page }) => {
  for (const route of ['/', '/courses', '/activities', '/contact']) {
    await page.goto(route)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact || ''))).toEqual([])
  }
})
