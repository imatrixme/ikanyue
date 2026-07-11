import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { createMockOpsApi } from '../../app/api'
import { mockProfiles } from '../../app/mockData'
import { Field, Input } from '../ui/Input'
import { ForcePasswordChangeView } from './ForcePasswordChangeView'
import { LoginView } from './LoginView'
import { Shell } from './Shell'

describe('points lite shell and login components', () => {
  it('opens and closes mobile navigation and renders toast variants', async () => {
    const user = userEvent.setup()
    const onViewChange = vi.fn()
    const onLogout = vi.fn()
    const { rerender } = render(
      <Shell
        activeView="points"
        profile={{ ...mockProfiles.admin, realName: '' }}
        toast={{ type: 'error', message: '错误消息' }}
        onLogout={onLogout}
        onViewChange={onViewChange}
      >
        <div>主体</div>
      </Shell>,
    )

    expect(screen.getByText('错误消息')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '打开导航' }))
    expect(screen.getAllByRole('navigation', { name: '后台导航' })).toHaveLength(2)
    await user.click(screen.getAllByRole('button', { name: '实物管理' })[1])
    expect(onViewChange).toHaveBeenCalledWith('rewards')
    expect(screen.getAllByRole('navigation', { name: '后台导航' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '打开导航' }))
    await user.click(screen.getByRole('button', { name: '关闭导航遮罩' }))
    expect(screen.getAllByRole('navigation', { name: '后台导航' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '打开导航' }))
    await user.click(screen.getByRole('button', { name: '关闭导航' }))
    expect(screen.getAllByRole('navigation', { name: '后台导航' })).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '退出' }))
    expect(onLogout).toHaveBeenCalled()

    rerender(
      <Shell
        activeView="rewards"
        profile={mockProfiles.admin}
        toast={{ type: 'info', message: '提示消息' }}
        onLogout={onLogout}
        onViewChange={onViewChange}
      >
        <div>主体</div>
      </Shell>,
    )
    expect(screen.getByText('提示消息')).toBeInTheDocument()
  })

  it('registers a pending account and reports registration errors', async () => {
    const user = userEvent.setup()
    const api = createMockOpsApi()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    render(<LoginView api={api} loading={false} onSuccess={onSuccess} onError={onError} />)

    await user.click(screen.getByRole('button', { name: '切换到注册' }))
    await user.type(screen.getByLabelText('手机号'), '13900000000')
    await user.type(screen.getByLabelText('姓名'), '新老师')
    await user.type(screen.getByLabelText('昵称'), '老师')
    await user.type(screen.getByLabelText('密码'), 'secret123')
    await user.click(screen.getByRole('button', { name: '提交注册' }))
    expect(await screen.findByText('注册成功，请等待管理员激活')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '切换到登录' }))
    await user.click(screen.getByRole('button', { name: '切换到注册' }))
    await user.clear(screen.getByLabelText('手机号'))
    await user.clear(screen.getByLabelText('姓名'))
    await user.click(screen.getByRole('button', { name: '提交注册' }))
    expect(onError).toHaveBeenCalledWith('手机号、姓名和密码不能为空')
  })

  it('renders login/register loading labels and fallback messages', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const api = {
      ...createMockOpsApi(),
      login: async () => {
        throw 'plain login failure'
      },
      register: async () => ({ status: 'pending_activation' as const, message: '', profile: mockProfiles.teacher }),
    }
    const { rerender } = render(<LoginView api={api} loading={true} onSuccess={onSuccess} onError={onError} />)
    expect(screen.getByRole('button', { name: '登录中' })).toBeDisabled()

    rerender(<LoginView api={api} loading={false} onSuccess={onSuccess} onError={onError} />)
    await user.type(screen.getByLabelText('账号或手机号'), 'admin')
    await user.type(screen.getByLabelText('密码'), 'secret')
    await user.click(screen.getByRole('button', { name: /^登录$/ }))
    expect(onError).toHaveBeenCalledWith('登录失败')

    await user.click(screen.getByRole('button', { name: '切换到注册' }))
    await user.type(screen.getByLabelText('手机号'), '13900000001')
    await user.type(screen.getByLabelText('姓名'), '李老师')
    await user.click(screen.getByRole('button', { name: '提交注册' }))
    expect(await screen.findByText('注册成功，请等待管理员激活')).toBeInTheDocument()

    rerender(<LoginView api={api} loading={true} onSuccess={onSuccess} onError={onError} />)
    await user.click(screen.getByRole('button', { name: '切换到注册' }))
    expect(screen.getByRole('button', { name: '注册中' })).toBeDisabled()
  })

  it('reports forced password change failures', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onError = vi.fn()
    const api = {
      ...createMockOpsApi(),
      changePassword: async () => {
        throw new Error('change down')
      },
    }
    render(
      <ForcePasswordChangeView
        api={api}
        token="token"
        profile={{ ...mockProfiles.admin, realName: '', nickName: '', cellphone: '13800138002' }}
        errorMessage="上次失败"
        onError={onError}
        onSuccess={onSuccess}
      />,
    )

    expect(screen.getByText('上次失败')).toBeInTheDocument()
    expect(screen.getByText(/13800138002/)).toBeInTheDocument()
    await user.type(screen.getByLabelText('当前密码'), 'old')
    await user.type(screen.getByLabelText('新密码'), 'new')
    await user.type(screen.getByLabelText('确认新密码'), 'new')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(onError).toHaveBeenCalledWith('change down')
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('reports non-error forced password change failures and field hints', async () => {
    const user = userEvent.setup()
    const onError = vi.fn()
    render(
      <>
        <Field htmlFor="hinted" label="提示字段" hint="这里是提示">
          <Input id="hinted" />
        </Field>
        <ForcePasswordChangeView
          api={{
            ...createMockOpsApi(),
            changePassword: async () => {
              throw 'plain failure'
            },
          }}
          token="token"
          profile={mockProfiles.admin}
          onError={onError}
          onSuccess={vi.fn()}
        />
      </>,
    )

    expect(screen.getByText('这里是提示')).toBeInTheDocument()
    await user.type(screen.getByLabelText('当前密码'), 'old')
    await user.type(screen.getByLabelText('新密码'), 'new')
    await user.type(screen.getByLabelText('确认新密码'), 'new')
    await user.click(screen.getByRole('button', { name: '确认修改' }))
    expect(onError).toHaveBeenCalledWith('修改密码失败')
  })
})
