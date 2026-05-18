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
  await page.getByRole('main').getByRole('button', { name: /^分享$/ }).first().click()
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

test('login validation blocks empty credentials and then recovers', async ({ page }) => {
  await page.goto('/')

  await page.getByLabel('手机号').fill('')
  await page.getByLabel('密码').fill('')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByText('手机号和密码不能为空')).toBeVisible()

  await page.getByLabel('手机号').fill('13800138002')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录' }).click()

  await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible()
})

test('admin can filter and create operation slots', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录' }).click()

  await page.getByRole('button', { name: '运营位' }).click()
  await expect(page.getByRole('heading', { name: '运营位' })).toBeVisible()

  await page.getByLabel('运营位搜索').fill('春季')
  await page.getByRole('button', { name: '刷新' }).click()
  await expect(page.getByText('春季测评入口')).toBeVisible()
  await expect(page.getByText('一对一体验课')).toHaveCount(0)
  await expect(page.getByText('共 1 条记录')).toBeVisible()

  await page.getByLabel('运营位搜索').fill('')
  await page.getByRole('button', { name: '刷新' }).click()
  await page.getByRole('button', { name: '新建运营位' }).click()

  await expect(page.getByText('已创建记录')).toBeVisible()
  await expect(page.getByText(/新运营位/)).toBeVisible()
  await expect(page.getByText('共 3 条记录')).toBeVisible()
})

test('admin can create and publish an assessment template draft', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录' }).click()

  await page.getByRole('button', { name: '评估表' }).click()
  await expect(page.getByRole('heading', { name: '评估表模板' })).toBeVisible()

  await page.getByRole('button', { name: '新建模板' }).click()
  await expect(page.getByText('已创建模板草稿')).toBeVisible()

  const draft = page.locator('article').filter({ hasText: '声乐阶段测评 副本' })
  await expect(draft).toBeVisible()
  await expect(draft.getByText('草稿')).toBeVisible()

  await draft.getByRole('button', { name: '发布' }).click()
  await expect(page.getByText('模板已发布')).toBeVisible()
  await expect(draft.getByText('已发布')).toBeVisible()
})

test('teacher can submit an assessment and share the generated report', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('手机号').fill('13800138001')
  await page.getByRole('button', { name: '登录' }).click()

  await page.getByRole('button', { name: '评估工作台' }).click()
  await expect(page.getByRole('heading', { name: '评估工作台' })).toBeVisible()

  await page.getByLabel('气息支撑').fill('95')
  await page.getByLabel('舞台表现').fill('91')
  await expect(page.getByText('实时评分')).toBeVisible()

  await page.getByRole('button', { name: '提交并生成报告' }).click()
  await expect(page.getByText('评估报告已生成')).toBeVisible()
  await expect(page.getByRole('heading', { name: '评估报告' })).toBeVisible()

  await page.getByRole('main').getByRole('button', { name: /^分享$/ }).first().click()
  await expect(page.getByRole('heading', { name: '分享报告预览' })).toBeVisible()
  await expect(page.getByText('已脱敏')).toBeVisible()
})

test('admin logout returns to the login screen', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: '登录' }).click()
  await expect(page.getByRole('heading', { name: '运营总览' })).toBeVisible()

  await page.getByRole('button', { name: '退出' }).click()

  await expect(page.getByRole('heading', { name: '登录后台' })).toBeVisible()
  await expect(page.getByRole('button', { name: '登录' })).toBeVisible()
})
