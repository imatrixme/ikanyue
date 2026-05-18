import { expect, test } from '@playwright/test'

test('admin can complete the first-phase operations path', async ({ page }) => {
  await page.goto('/')

  await expect(page.getByRole('heading', { name: '登录后台' })).toBeVisible()
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible()
  await expect(page.getByText('评估报告')).toBeVisible()

  await page.getByRole('button', { name: '学员' }).click()
  await expect(page.getByRole('heading', { name: '学员管理' })).toBeVisible()
  await expect(page.getByText('小张')).toBeVisible()

  await page.getByRole('button', { name: '审计' }).click()
  await expect(page.getByRole('heading', { name: '审计日志' })).toBeVisible()
  await expect(page.getByText('ops.assessment_record.submit')).toBeVisible()

  await page.getByRole('button', { name: '评估表' }).click()
  await expect(page.getByRole('heading', { name: '评估表模板' })).toBeVisible()
  await expect(page.getByText('声乐阶段测评')).toBeVisible()

  await page.getByRole('button', { name: '评估工作台' }).click()
  await expect(page.getByRole('heading', { name: '评估工作台' })).toBeVisible()
  await page.getByLabel('气息支撑').fill('92')
  await expect(page.getByText('实时评分')).toBeVisible()

  await page.getByRole('button', { name: '提交并生成报告' }).click()
  await expect(page.getByRole('heading', { name: '评估报告' })).toBeVisible()
  await page.getByRole('button', { name: '分享' }).first().click()
  await expect(page.getByRole('heading', { name: '分享报告预览' })).toBeVisible()
  await expect(page.getByText('声乐阶段评估报告')).toBeVisible()
})

test('teacher login hides admin-only management', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('手机号').fill('13800138001')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible()
  await expect(page.getByRole('button', { name: '教师' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '评估表' })).toHaveCount(0)
  await page.getByRole('button', { name: '学员' }).click()
  await expect(page.getByRole('heading', { name: '学员管理' })).toBeVisible()
})
