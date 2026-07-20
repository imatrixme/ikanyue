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
  await expect(page.getByText('用于局域网联调的活动样例。', { exact: true })).toHaveCount(0)
  await expect(page.getByText('本地声乐体验活动', { exact: true })).toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('homepage.png'), fullPage: true })
})

test('activity cards use compact summaries and details do not repeat them below the title', async ({ page }) => {
  await page.goto('/activities')
  const firstTicket = page.locator('.activity-ticket').first()
  const summary = firstTicket.locator('.activity-ticket__summary')
  await expect(summary).toBeVisible()
  await expect(summary).not.toContainText('<p>')

  const summaryStyle = await summary.evaluate((element) => {
    const style = getComputedStyle(element)
    return { fontSize: style.fontSize, lineClamp: style.webkitLineClamp }
  })
  expect(Number.parseFloat(summaryStyle.fontSize)).toBeLessThan(16)
  expect(summaryStyle.lineClamp).toBe('6')

  await firstTicket.getByRole('link').click()
  await expect(page.locator('.activity-detail-hero h1')).toBeVisible()
  await expect(page.locator('.activity-detail-hero p')).toHaveCount(0)
  await expect(page.locator('.activity-detail__body')).toBeVisible()
})

test('contact page offers direct WeChat and phone contact', async ({ page }) => {
  await page.goto('/contact')
  await expect(page.getByText('微信/电话咨询', { exact: true })).toBeVisible()
  const phone = page.getByRole('link', { name: '18521301857' })
  await expect(phone).toBeVisible()
  await expect(phone).toHaveAttribute('href', 'tel:18521301857')
  const wechatQr = page.getByRole('img', { name: '看乐艺术歌唱微信联系二维码' })
  await expect(wechatQr).toBeVisible()
  await expect(wechatQr).toHaveAttribute('src', '/images/wechat-contact-qr.jpg')
  await expect(page.getByText('长按识别或扫码', { exact: true })).toBeVisible()
  await expect(page.getByText('在微信中搜索品牌名称，进入官方账号或小程序后发送“声乐咨询”，即可开始沟通。', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '复制微信搜索词' })).toHaveCount(0)
  await expect(page.locator('form')).toHaveCount(0)
})

test('footer exposes the official ICP filing', async ({ page }) => {
  await page.goto('/')
  const filing = page.getByRole('link', { name: '沪ICP备2024042646号-1' })
  await expect(filing).toBeVisible()
  await expect(filing).toHaveAttribute('href', 'https://beian.miit.gov.cn/')
})

test('primary pages have no serious accessibility violations', async ({ page }) => {
  for (const route of ['/', '/courses', '/activities', '/contact']) {
    await page.goto(route, { waitUntil: 'networkidle' })
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter(item => ['critical', 'serious'].includes(item.impact || ''))).toEqual([])
  }
})
