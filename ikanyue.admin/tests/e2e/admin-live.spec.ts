import { expect, test } from '@playwright/test'

test('local admin uses real Hono and PocketBase through row dialogs', async ({ page }, testInfo) => {
  const account = process.env.OPS_BOOTSTRAP_ADMIN_USERNAME
  const password = process.env.OPS_BOOTSTRAP_ADMIN_PASSWORD
  if (!account || !password) throw new Error('OPS_BOOTSTRAP_ADMIN_USERNAME and OPS_BOOTSTRAP_ADMIN_PASSWORD are required')

  await page.goto('/')
  await page.getByLabel('账号或手机号').fill(account)
  await page.getByLabel('密码').fill(password)
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日工作台' })).toBeVisible()
  await openView(page, '学员积分')

  const managedName = testInfo.project.name === 'chromium' ? '现场学员桌面' : '现场学员移动'
  const managedPhone = testInfo.project.name === 'chromium' ? '13900009991' : '13900009992'
  await openView(page, '学员管理')
  await page.getByRole('button', { name: '新增学员' }).click()
  await page.getByLabel('学员姓名').fill(managedName)
  await page.getByLabel('手机号').fill(managedPhone)
  await page.getByLabel('初始密码').fill('localStudent123')
  await page.getByRole('button', { name: '创建学员' }).click()
  await expect(page.getByText('学员已创建')).toBeVisible()
  await openView(page, '学员积分')
  await expect(page.getByRole('button', { name: `为${managedName}增加积分` })).toBeVisible()
  await openView(page, '学员管理')
  await page.getByRole('button', { name: `编辑${managedName}` }).click()
  const managedDialog = page.getByRole('dialog', { name: `编辑${managedName}` })
  await managedDialog.getByLabel('状态').selectOption('inactive')
  await managedDialog.getByRole('button', { name: '保存学员' }).click()
  await expect(page.getByText('学员已更新')).toBeVisible()
  await openView(page, '学员积分')
  await expect(page.getByRole('button', { name: `为${managedName}增加积分` })).toHaveCount(0)

  await page.getByRole('button', { name: '为本地学员一增加积分' }).click()
  await page.getByLabel('积分数量').fill('50')
  await page.getByLabel('原因').fill('local_playwright')
  await page.getByRole('button', { name: '复核加分结果' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('积分已增加')).toBeVisible()
  await expect(page.getByText('170 分', { exact: true }).filter({ visible: true })).toBeVisible()

  await page.getByRole('button', { name: '为本地学员一线下兑换' }).click()
  await page.getByRole('button', { name: '复核兑换结果' }).click()
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('已扣除积分，确认线下领取')).toBeVisible()
  await expect(page.getByText('120 分', { exact: true }).filter({ visible: true })).toBeVisible()

  await openView(page, '实物管理')
  await page.getByRole('button', { name: '编辑贴纸' }).click()
  await page.getByLabel('选择图片').setInputFiles({ name: 'playwright-reward.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('button', { name: /上传图片|替换图片/ }).click()
  await expect(page.getByText('实物图片已上传')).toBeVisible()
  await expect(page.getByAltText('实物图片预览')).toHaveAttribute('src', /\/api\/files\//)
})

async function openView(page: import('@playwright/test').Page, name: string) {
  const mobileMenu = page.getByRole('button', { name: '打开导航' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click()
    await page.getByRole('button', { name }).last().click()
  } else {
    await page.getByRole('button', { name }).click()
  }
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
