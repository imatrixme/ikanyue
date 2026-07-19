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
  await expect(page.getByRole('heading', { level: 1, name: '全年龄声乐课程' })).toBeVisible()
  await expect(page.getByText('近期声乐活动', { exact: true }).first()).toBeVisible()
  await expect(page.locator('.activity-ticket').first()).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true })
})

test('contact page offers direct WeChat contact', async ({ page }) => {
  await page.goto('/contact')
  await expect(page.getByRole('heading', { level: 2, name: '搜索“看乐艺术”' })).toBeVisible()
  const wechatQr = page.getByRole('img', { name: '看乐艺术歌唱微信联系二维码' })
  await expect(wechatQr).toBeVisible()
  await expect(wechatQr).toHaveAttribute('src', '/images/wechat-contact-qr.jpg')
  await expect(page.getByText('直接扫码微信联系', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制微信搜索词' })).toHaveCount(0)
  await expect(page.locator('form')).toHaveCount(0)
})

test('primary pages have no serious accessibility violations', async ({ page }) => {
  for (const route of ['/', '/courses', '/activities', '/contact']) {
    await page.goto(route)
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact || ''))).toEqual([])
  }
})
