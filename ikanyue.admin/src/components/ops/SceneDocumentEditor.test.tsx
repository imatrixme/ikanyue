import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { DocumentEditorModal } from './DocumentEditorModal'

describe('scene document editor', () => {
  it('switches document editor modes and saves draft content', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    render(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value="<p>原始内容</p>"
        onClose={() => undefined}
        onSave={onSave}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '编辑说明' })
    expect(within(dialog).getByRole('tab', { name: '主编辑模式' })).toHaveAttribute('data-state', 'active')
    await user.click(within(dialog).getByRole('tab', { name: '主预览模式' }))
    expect(within(dialog).getByText('原始内容')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: '主分屏模式' }))
    expect(within(dialog).getAllByText('原始内容').length).toBeGreaterThan(0)
    await user.click(within(dialog).getByRole('tab', { name: '主 Markdown 模式' }))
    const markdown = within(dialog).getByLabelText('说明 Markdown编辑')
    await user.clear(markdown)
    await user.type(markdown, '## 新标题')
    await user.click(within(dialog).getByRole('tab', { name: '主 HTML 模式' }))
    expect(within(dialog).getByLabelText('说明 HTML编辑')).toHaveValue('<h2>新标题</h2>\n')
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))

    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('<h2'))
  })

  it('protects document drafts and handles image upload states', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onSave = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    confirm.mockReturnValueOnce(false).mockReturnValueOnce(true)
    const image = new File(['image'], 'note.png', { type: 'image/png' })
    const { rerender } = render(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value="<p>原始内容</p>"
        onClose={onClose}
        onSave={onSave}
      />,
    )

    let dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.click(within(dialog).getByRole('tab', { name: '主 Markdown 模式' }))
    await user.clear(within(dialog).getByLabelText('说明 Markdown编辑'))
    await user.type(within(dialog).getByLabelText('说明 Markdown编辑'), '草稿')
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '关闭' }))
    expect(onClose).toHaveBeenCalledTimes(1)

    rerender(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
      />,
    )
    dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    expect(within(dialog).getByText('未配置图片上传接口')).toBeInTheDocument()

    rerender(
      <DocumentEditorModal
        open
        title="编辑说明"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
        onUploadImage={async (file) => `https://kyoss.abcmem.com/${file.name}`}
      />,
    )
    dialog = screen.getByRole('dialog', { name: '编辑说明' })
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    await waitFor(() => expect(within(dialog).getByText(/图片会先进入编辑草稿/)).toBeInTheDocument())
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('https://kyoss.abcmem.com/note.png'))

    confirm.mockRestore()
  })

  it('previews empty documents and uploads from html mode', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn()
    const image = new File(['image'], 'html.png', { type: 'image/png' })
    render(
      <DocumentEditorModal
        open
        title="编辑空文档"
        label="说明"
        value=""
        onClose={() => undefined}
        onSave={onSave}
        onUploadImage={async (file) => `https://kyoss.abcmem.com/${file.name}`}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '编辑空文档' })
    await user.click(within(dialog).getByRole('tab', { name: '主预览模式' }))
    expect(within(dialog).getByText('暂无内容')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('tab', { name: '主 HTML 模式' }))
    await user.type(within(dialog).getByLabelText('说明 HTML编辑'), '<p>HTML</p>')
    await user.upload(within(dialog).getByLabelText('说明插入图片'), image)
    await waitFor(() => expect((within(dialog).getByLabelText('说明 HTML编辑') as HTMLTextAreaElement).value).toContain('html.png'))
    await user.click(within(dialog).getByRole('button', { name: '保存内容' }))
    expect(onSave).toHaveBeenCalledWith(expect.stringContaining('html.png'))
  })
})
