import { expect, test } from '@playwright/test'

test('local admin uses the real Hono and PocketBase points flow', async ({ page }) => {
  const account = process.env.OPS_BOOTSTRAP_ADMIN_USERNAME
  const password = process.env.OPS_BOOTSTRAP_ADMIN_PASSWORD
  if (!account || !password) {
    throw new Error('OPS_BOOTSTRAP_ADMIN_USERNAME and OPS_BOOTSTRAP_ADMIN_PASSWORD are required')
  }

  await page.goto('/')
  await page.getByLabel('账号或手机号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page.getByRole('heading', { name: '选择学员', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: /本地学员一 120 分/ })).toBeVisible()

  await page.getByLabel('积分数量').fill('50')
  await page.getByLabel('原因').fill('local_playwright')
  await page.getByRole('button', { name: '预览加分结果' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('积分已增加')).toBeVisible()
  await expect(page.getByText('170', { exact: true }).first()).toBeVisible()

  await page.getByRole('tab', { name: '线下兑换' }).click()
  await page.getByRole('button', { name: '预览兑换结果' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('已扣除积分，确认线下领取')).toBeVisible()
  await expect(page.getByText('120', { exact: true }).first()).toBeVisible()

  const mobileMenu = page.getByRole('button', { name: '打开导航' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click()
    await page.getByRole('button', { name: '实物管理' }).last().click()
  } else {
    await page.getByRole('button', { name: '实物管理' }).click()
  }
  await expect(page.getByRole('heading', { name: '实物管理' })).toBeVisible()
  await page.getByRole('button', { name: '编辑贴纸' }).click()
  await page.getByLabel('选择图片').setInputFiles({
    name: 'playwright-reward.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ),
  })
  await page.getByRole('button', { name: /上传图片|替换图片/ }).click()
  await expect(page.getByText('实物图片已上传')).toBeVisible()
  await expect(page.getByAltText('实物图片预览')).toHaveAttribute('src', /\/api\/files\//)
})
