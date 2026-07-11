import { expect, test } from '@playwright/test'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('admin')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '选择学员' })).toBeVisible()
}

async function openRewards(page: import('@playwright/test').Page) {
  const mobileMenu = page.getByRole('button', { name: '打开导航' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click()
    await page.getByRole('button', { name: '实物管理' }).last().click()
    return
  }
  await page.getByRole('button', { name: '实物管理' }).click()
}

test('admin can grant points and complete an offline reward redemption', async ({ page }) => {
  await loginAsAdmin(page)

  await expect(page.getByRole('button', { name: /张同学 120 分/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '张同学' })).toBeVisible()
  await expect(page.getByText('120', { exact: true }).first()).toBeVisible()

  await page.getByLabel('积分数量').fill('30')
  await page.getByRole('button', { name: '预览加分结果' }).click()
  await expect(page.getByRole('dialog', { name: '确认增加积分' })).toContainText('150')
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('积分已增加')).toBeVisible()
  await expect(page.getByText('150', { exact: true }).first()).toBeVisible()

  await page.getByRole('tab', { name: '线下兑换' }).click()
  await page.getByRole('button', { name: '预览兑换结果' }).click()
  await expect(page.getByRole('dialog', { name: '确认线下兑换' })).toContainText('贴纸套装')
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('已扣除积分，确认线下领取')).toBeVisible()
  await expect(page.getByText('100', { exact: true }).first()).toBeVisible()
})

test('admin can search students and manage reward items', async ({ page }) => {
  await loginAsAdmin(page)

  await page.getByLabel('搜索学员').fill('李')
  await page.getByRole('button', { name: '搜索' }).click()
  await expect(page.getByRole('button', { name: /李同学 40 分/ })).toBeVisible()
  await expect(page.getByRole('heading', { name: '李同学' })).toBeVisible()
  await expect(page.getByRole('button', { name: /张同学/ })).toHaveCount(0)

  await openRewards(page)
  await expect(page.getByRole('heading', { name: '实物管理' })).toBeVisible()
  await page.getByRole('button', { name: '编辑贴纸套装' }).click()
  await page.getByLabel('积分价格').fill('60')
  await page.getByRole('button', { name: '保存实物' }).click()
  await expect(page.getByText('实物已更新')).toBeVisible()
  await expect(page.getByText('60 分')).toBeVisible()

  await page.getByRole('button', { name: '新增实物' }).click()
  await page.getByLabel('实物名称').fill('帆布袋')
  await page.getByLabel('积分价格').fill('90')
  await page.getByRole('button', { name: '创建实物' }).click()
  await expect(page.getByText('实物已创建')).toBeVisible()
  await expect(page.getByText('帆布袋')).toBeVisible()
})

test('non-admin login is blocked from the points console', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('13800138001')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()

  await expect(page.getByText('积分兑换后台仅允许管理员访问')).toBeVisible()
  await expect(page.getByRole('heading', { name: '选择学员' })).toHaveCount(0)
})

test('admin logout returns to the login screen', async ({ page }) => {
  await loginAsAdmin(page)

  await page.getByRole('button', { name: '退出' }).click()

  await expect(page.getByRole('heading', { name: '看乐积分兑换后台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
})
