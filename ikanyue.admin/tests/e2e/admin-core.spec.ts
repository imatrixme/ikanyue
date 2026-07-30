import { expect, test } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

async function loginAsAdmin(page: import('@playwright/test').Page, openPoints = true) {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('admin')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日工作台' })).toBeVisible()
  if (openPoints) await openView(page, '学员积分')
}

async function openRewards(page: import('@playwright/test').Page) {
  await openView(page, '实物管理')
}

async function openView(page: import('@playwright/test').Page, name: string) {
  const mobileMenu = page.getByRole('button', { name: '打开导航' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click()
    await page.getByRole('button', { name }).last().click()
  } else {
    await page.getByRole('button', { name }).click()
  }
  const heading = viewHeadings[name]
  if (heading) await expect(page.getByRole('heading', { name: heading })).toBeVisible()
}

const viewHeadings: Record<string, string> = {
  '今日工作台': '今日工作台',
  '学员管理': '学员管理',
  '课程规格': '课程规格',
  '课包与价格': '课包管理',
  '报课管理': '报课管理',
  '班级管理': '班级管理',
  '课堂管理': '课堂管理',
  '机构课表': '机构课表',
  '课程预约': '课程预约',
  '课时账户': '课时账户',
  '教师工作量': '教师工作量',
  '异常中心': '核销异常',
  '操作审计': '操作审计',
  '学员积分': '学员积分',
  '实物管理': '实物管理',
}

test('admin completes grant and redemption from learner row dialogs', async ({ page }) => {
  await loginAsAdmin(page)
  const grant = page.getByRole('button', { name: '为张同学增加积分' })
  await expect(grant).toBeVisible()
  await grant.click()
  await page.getByLabel('积分数量').fill('30')
  await page.getByRole('button', { name: '复核加分结果' }).click()
  await expect(page.getByRole('dialog', { name: '确认增加积分' })).toContainText('150')
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('积分已增加')).toBeVisible()
  await expect(page.getByText('150 分', { exact: true }).filter({ visible: true })).toBeVisible()

  await page.getByRole('button', { name: '为张同学线下兑换' }).click()
  await page.getByRole('button', { name: '复核兑换结果' }).click()
  await expect(page.getByRole('dialog', { name: '确认线下兑换' })).toContainText('贴纸套装')
  await page.getByRole('button', { name: '确认执行' }).click()
  await expect(page.getByText('已扣除积分，确认线下领取')).toBeVisible()
  await expect(page.getByText('100 分', { exact: true }).filter({ visible: true })).toBeVisible()
})

test('learner filters persist and detail reconstructs points history', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByLabel('排序').selectOption('balance-asc')
  await page.reload()
  await expect(page.getByLabel('排序')).toHaveValue('balance-asc')
  await page.getByLabel('搜索学员').fill('李')
  await expect(page.getByRole('button', { name: '查看李同学详情' })).toBeVisible()
  await expect(page.getByText('张同学', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '重置' }).click()

  const detailButton = page.getByRole('button', { name: '查看张同学详情' })
  await detailButton.click()
  await expect(page.getByRole('dialog', { name: '张同学积分详情' })).toContainText('课堂奖励')
  await expect(page.getByRole('dialog', { name: '张同学积分详情' })).toContainText('乐理练习册')
  await page.keyboard.press('Escape')
  await expect(detailButton).toBeFocused()
})

test('admin filters, edits, creates, and protects unsaved rewards', async ({ page }) => {
  await loginAsAdmin(page)
  await openRewards(page)
  await expect(page.getByRole('heading', { name: '实物管理' })).toBeVisible()

  await page.getByLabel('状态').selectOption('inactive')
  await expect(page.getByText('下线奖品', { exact: true }).filter({ visible: true })).toBeVisible()
  await page.getByLabel('最低积分').fill('20')
  await expect(page.getByText('没有匹配的实物')).toBeVisible()
  await page.getByRole('button', { name: '重置筛选' }).click()

  await page.getByRole('button', { name: '编辑贴纸套装' }).click()
  await page.getByLabel('积分价格').fill('60')
  await page.getByRole('button', { name: '关闭弹窗' }).click()
  await expect(page.getByText('放弃未保存修改？')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click()
  await expect(page.getByLabel('积分价格')).toHaveValue('60')
  await page.getByRole('button', { name: '保存实物' }).click()
  await expect(page.getByText('实物已更新')).toBeVisible()
  await expect(page.getByText('60 分', { exact: true }).filter({ visible: true })).toBeVisible()

  await page.getByRole('button', { name: '新增实物' }).click()
  await page.getByLabel('实物名称').fill('帆布袋')
  await page.getByLabel('积分价格').fill('90')
  await page.getByRole('button', { name: '创建实物' }).click()
  await expect(page.getByText('实物已创建')).toBeVisible()
  await expect(page.getByText('帆布袋', { exact: true }).filter({ visible: true })).toBeVisible()
})

test('point dialog Escape restores focus and never nests overlays', async ({ page }) => {
  await loginAsAdmin(page)
  const grant = page.getByRole('button', { name: '为张同学增加积分' })
  await grant.click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.getByRole('button', { name: '复核加分结果' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await page.keyboard.press('Escape')
  await expect(grant).toBeFocused()
})

test('responsive dialogs fit the viewport without horizontal overflow', async ({ page }) => {
  await loginAsAdmin(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  if (page.viewportSize()!.width >= 768) {
    expect(await controlsDoNotOverlap(page, ['learner-keyword', 'learner-min', 'learner-max', 'learner-sort'])).toBe(true)
  }

  await page.getByRole('button', { name: '为张同学增加积分' }).click()
  const viewport = page.viewportSize()!
  const pointDialog = page.getByRole('dialog')
  const pointBox = await pointDialog.boundingBox()
  expect(pointBox).not.toBeNull()
  if (viewport.width < 640) {
    expect(pointBox!.x).toBe(0)
    expect(pointBox!.y).toBe(0)
    expect(Math.round(pointBox!.width)).toBe(viewport.width)
    expect(Math.round(pointBox!.height)).toBe(viewport.height)
  } else {
    expect(pointBox!.width).toBeLessThan(viewport.width)
    expect(pointBox!.height).toBeLessThan(viewport.height)
  }
  expect(await pointDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')

  await openRewards(page)
  if (viewport.width >= 768) {
    expect(await controlsDoNotOverlap(page, ['reward-keyword', 'reward-filter-status', 'reward-min', 'reward-max', 'reward-filter-sort'])).toBe(true)
  }
  await page.getByRole('button', { name: '新增实物' }).click()
  const rewardDialog = page.getByRole('dialog')
  const rewardBox = await rewardDialog.boundingBox()
  expect(rewardBox).not.toBeNull()
  if (viewport.width < 640) {
    expect(Math.round(rewardBox!.width)).toBe(viewport.width)
    expect(Math.round(rewardBox!.height)).toBe(viewport.height)
  }
  expect(await rewardDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('course operations stay usable across responsive layouts', async ({ page }) => {
  await loginAsAdmin(page, false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await openView(page, '课程规格')
  await expect(page.getByRole('heading', { name: '课程规格' })).toBeVisible()
  await expect(page.getByText('综合声乐班', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  await page.getByRole('button', { name: '新增课程规格' }).click()
  const courseDialog = page.getByRole('dialog', { name: '新增课程规格' })
  await expect(courseDialog).toBeVisible()
  expect(await courseDialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.keyboard.press('Escape')

  await openView(page, '报课管理')
  await expect(page.getByRole('heading', { name: '报课管理' })).toBeVisible()
  await page.getByRole('button', { name: '新建报课' }).click()
  await expect(page.getByRole('dialog', { name: '管理员报课' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
})

test('course booking workspace stays responsive across queue, configuration, and conflict flows', async ({ page }) => {
  await loginAsAdmin(page, false)
  await openView(page, '课程预约')
  await expect(page.getByRole('heading', { name: '课程预约' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)
  if (page.viewportSize()!.width >= 1280) {
    expect(await controlsDoNotOverlap(page, [
      'booking-status-filter',
      'booking-teacher-filter',
      'booking-course-filter',
      'booking-from-filter',
      'booking-to-filter',
    ])).toBe(true)
  }

  await page.getByRole('button', { name: '切换到日程' }).click()
  await expect(page).toHaveURL(/mode=calendar/)
  await expect(page.getByText('个预约').first()).toBeVisible()
  await page.getByRole('button', { name: '切换到列表' }).click()
  await expect(page).toHaveURL(/mode=list/)
  await page.getByLabel('预约状态').selectOption('confirmed,rescheduled')
  await expect(page).toHaveURL(/status=confirmed%2Crescheduled/)
  await page.getByRole('button', { name: /^(查看|预约详情)$/ }).filter({ visible: true }).first().click()
  let dialog = page.getByRole('dialog', { name: '一对一声乐课预约' })
  await expect(dialog).toContainText('李同学')
  await expect(dialog).toContainText('时间占用明细')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await dialog.getByRole('button', { name: '调整时间' }).click()
  dialog = page.getByRole('dialog', { name: '调整预约时间' })
  await expect(dialog).toContainText('发生冲突时原预约保持不变')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await dialog.getByRole('button', { name: '返回' }).click()
  await page.getByRole('dialog', { name: '一对一声乐课预约' }).getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByRole('tab', { name: '开放配置' }).click()
  await expect(page.getByRole('heading', { name: '教师可预约课程' })).toBeVisible()
  await page.getByRole('button', { name: '切换到开放时间' }).click()
  await expect(page.getByRole('heading', { name: '每周开放' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  await page.getByRole('tab', { name: '冲突与迁移' }).click()
  await expect(page.getByRole('heading', { name: '冲突处理队列' })).toBeVisible()
  await page.getByRole('button', { name: '记录处理结果' }).filter({ visible: true }).first().click()
  await expect(page.getByRole('dialog', { name: '记录冲突处理结果' })).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expectAccessible(page)
})

test('institution timetable preserves calendar state and responsive lesson detail', async ({ page }) => {
  await loginAsAdmin(page, false)
  await openView(page, '机构课表')
  await page.goto('/calendar?view=week&date=2026-08-03')
  await expect(page.getByRole('heading', { name: '机构课表' })).toBeVisible()
  await expect(page.getByText('少儿声乐小课', { exact: true }).filter({ visible: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  if (page.viewportSize()!.width >= 768) {
    await expect(page.getByTestId('calendar-time-grid')).toBeVisible()
  } else {
    await expect(page.getByTestId('calendar-agenda')).toBeVisible()
  }

  await page.getByRole('button', { name: '切换到月' }).click()
  await expect(page).toHaveURL(/view=month/)
  await expect(page.getByTestId('calendar-month-grid')).toBeVisible()
  await page.getByRole('button', { name: '切换到列表' }).click()
  await expect(page).toHaveURL(/view=list/)
  await page.getByText('少儿声乐小课', { exact: true }).filter({ visible: true }).first().click()
  const detail = page.getByRole('dialog', { name: '少儿声乐小课' })
  await expect(detail).toContainText('周老师')
  await expect(detail).toContainText('看乐艺术一号教室')
  await expect(page.getByRole('dialog')).toHaveCount(1)
  expect(await detail.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await expectAccessible(page)
  await detail.getByRole('button', { name: '关闭弹窗' }).click()

  await page.getByLabel('教师').selectOption('teacher_1')
  await expect(page).toHaveURL(/teacherId=teacher_1/)
  await expect(page.getByText('少儿声乐小课', { exact: true }).filter({ visible: true }).first()).toBeVisible()
})

test('representative admin workspaces have no serious accessibility violations', async ({ page }) => {
  await loginAsAdmin(page)
  await expectAccessible(page)

  const detail = page.getByRole('button', { name: '查看张同学详情' })
  await detail.click()
  await expect(page.getByRole('dialog', { name: '张同学积分详情' })).toBeVisible()
  await expectAccessible(page)
  await page.keyboard.press('Escape')

  await openView(page, '学员管理')
  await expectAccessible(page)
  await openRewards(page)
  await expectAccessible(page)
})

test('admin creates, edits, and disables a learner from student management', async ({ page }) => {
  await loginAsAdmin(page)
  await openView(page, '学员管理')
  await expect(page.getByRole('heading', { name: '学员管理' })).toBeVisible()
  await page.getByRole('button', { name: '新增学员' }).click()
  await page.getByLabel('学员姓名').fill('端到端学员')
  await page.getByLabel('昵称').fill('端到端')
  await page.getByLabel('手机号').fill('13900139999')
  await page.getByLabel('初始密码').fill('secret123')
  await page.getByRole('button', { name: '创建学员' }).click()
  await expect(page.getByText('学员已创建')).toBeVisible()
  await expect(page.getByText('端到端学员', { exact: true }).filter({ visible: true })).toBeVisible()

  await openView(page, '学员积分')
  await expect(page.getByRole('button', { name: '为端到端学员增加积分' })).toBeVisible()
  await openView(page, '学员管理')
  await page.getByRole('button', { name: '编辑端到端学员' }).click()
  const dialog = page.getByRole('dialog', { name: '编辑端到端学员' })
  await dialog.getByLabel('状态').selectOption('inactive')
  await dialog.getByRole('button', { name: '保存学员' }).click()
  await expect(page.getByText('学员已更新')).toBeVisible()
  await openView(page, '学员积分')
  await expect(page.getByRole('button', { name: '为端到端学员增加积分' })).toHaveCount(0)
})

test('non-admin login receives scoped course navigation without points access', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('13800138001')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '今日工作台' })).toBeVisible()
  await openView(page, '课堂管理')
  await expect(page.getByRole('heading', { name: '课堂管理' })).toBeVisible()
  await expect(page.getByRole('button', { name: '学员积分' })).toHaveCount(0)
})

test('admin logout returns to the login screen', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page.getByRole('heading', { name: '看乐积分兑换后台' })).toBeVisible()
})

async function controlsDoNotOverlap(page: import('@playwright/test').Page, ids: string[]) {
  return page.evaluate((controlIds) => {
    const rects = controlIds.map((id) => document.getElementById(id)?.getBoundingClientRect()).filter(Boolean) as DOMRect[]
    const separated = (left: DOMRect, right: DOMRect) => left.right <= right.left || right.right <= left.left || left.bottom <= right.top || right.bottom <= left.top
    return rects.length === controlIds.length && rects.every((rect, index) => rects.slice(index + 1).every((other) => separated(rect, other)))
  }, ids)
}

async function expectAccessible(page: import('@playwright/test').Page) {
  await page.waitForTimeout(250)
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations.filter((violation) => violation.impact === 'critical' || violation.impact === 'serious')).toEqual([])
}
