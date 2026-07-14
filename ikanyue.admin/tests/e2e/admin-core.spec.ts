import { expect, test } from '@playwright/test'

async function loginAsAdmin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('admin')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByRole('heading', { name: '学员积分' })).toBeVisible()
}

async function openRewards(page: import('@playwright/test').Page) {
  await openView(page, '实物管理')
}

async function openView(page: import('@playwright/test').Page, name: '学员管理' | '学员积分' | '实物管理') {
  const mobileMenu = page.getByRole('button', { name: '打开导航' })
  if (await mobileMenu.isVisible()) {
    await mobileMenu.click()
    await page.getByRole('button', { name }).last().click()
  } else {
    await page.getByRole('button', { name }).click()
  }
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

test('non-admin login is blocked from the points console', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('账号或手机号').fill('13800138001')
  await page.getByLabel('密码').fill('secret')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await expect(page.getByText('积分兑换后台仅允许管理员访问')).toBeVisible()
  await expect(page.getByRole('heading', { name: '学员积分' })).toHaveCount(0)
})

test('admin logout returns to the login screen', async ({ page }) => {
  await loginAsAdmin(page)
  await page.getByRole('button', { name: '退出' }).click()
  await expect(page.getByRole('heading', { name: '看乐积分兑换后台' })).toBeVisible()
})

async function controlsDoNotOverlap(page: import('@playwright/test').Page, ids: string[]) {
  return page.evaluate((controlIds) => {
    const rects = controlIds.map((id) => document.getElementById(id)?.getBoundingClientRect()).filter(Boolean) as DOMRect[]
    return rects.length === controlIds.length && rects.every((rect, index) => index === 0 || rect.left >= rects[index - 1].right)
  }, ids)
}
