import { Eye, FileCode2, ImagePlus, PanelsTopLeft, Save, TextCursorInput } from 'lucide-react'
import { marked } from 'marked'
import { useRef, useState, type ChangeEvent } from 'react'
import TurndownService from 'turndown'

import { Button } from '../ui/Button'
import { RichTextEditor } from '../ui/RichTextEditor'
import { Sheet } from '../ui/Sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/Tabs'

type DocumentMode = 'edit' | 'preview' | 'split' | 'markdown' | 'html'

interface DocumentEditorModalProps {
  open: boolean
  title: string
  label: string
  value: string
  onClose: () => void
  onSave: (value: string) => void
  onUploadImage?: (file: File) => Promise<string>
}

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
})

export function DocumentEditorModal({ open, title, label, value, onClose, onSave, onUploadImage }: DocumentEditorModalProps) {
  if (!open) {
    return null
  }

  return (
    <DocumentEditorSession
      key={`${title}-${value}`}
      title={title}
      label={label}
      initialValue={value}
      onClose={onClose}
      onSave={onSave}
      onUploadImage={onUploadImage}
    />
  )
}

function DocumentEditorSession({ title, label, initialValue, onClose, onSave, onUploadImage }: {
  title: string
  label: string
  initialValue: string
  onClose: () => void
  onSave: (value: string) => void
  onUploadImage?: (file: File) => Promise<string>
}) {
  const [mode, setMode] = useState<DocumentMode>('edit')
  const [draft, setDraft] = useState(initialValue || '')
  const [markdownDraft, setMarkdownDraft] = useState(() => markdownFromHtml(initialValue || ''))
  const [htmlDraft, setHtmlDraft] = useState(initialValue || '')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  function closeWithProtection() {
    if (draft !== (initialValue || '') && typeof window !== 'undefined' && !window.confirm('当前内容还没有保存，确定要关闭吗？')) {
      return
    }
    onClose()
  }

  function changeMode(nextMode: DocumentMode) {
    if (nextMode === 'markdown') {
      setMarkdownDraft(markdownFromHtml(draft))
    }
    if (nextMode === 'html') {
      setHtmlDraft(draft)
    }
    if (mode === 'markdown') {
      setDraft(htmlFromMarkdown(markdownDraft))
    }
    if (mode === 'html') {
      setDraft(htmlDraft)
    }
    setMode(nextMode)
  }

  function saveAndClose() {
    const next = mode === 'markdown' ? htmlFromMarkdown(markdownDraft) : mode === 'html' ? htmlDraft : draft
    onSave(next)
    onClose()
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (!onUploadImage) {
      setError('未配置图片上传接口')
      return
    }
    setUploading(true)
    setError('')
    try {
      const url = await onUploadImage(file)
      const imageHtml = `<p><img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(file.name)}"></p>`
      const next = `${currentHtml()}${imageHtml}`
      setDraft(next)
      setHtmlDraft(next)
      setMarkdownDraft(markdownFromHtml(next))
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  function currentHtml() {
    if (mode === 'markdown') {
      return htmlFromMarkdown(markdownDraft)
    }
    if (mode === 'html') {
      return htmlDraft
    }
    return draft
  }

  return (
    <Sheet
      open
      title={title}
      description="长内容在这里完成编辑和预览，父表单只保留摘要。"
      onClose={closeWithProtection}
      className="w-[min(1180px,calc(100vw-2rem))]"
      footer={(
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
            <input ref={fileRef} aria-label={`${label}插入图片`} className="sr-only" type="file" accept="image/*" onChange={uploadImage} />
            <Button type="button" variant="secondary" disabled={uploading} onClick={() => fileRef.current?.click()} icon={<ImagePlus className="h-4 w-4" aria-hidden="true" />}>
              {uploading ? '上传中' : '插入图片'}
            </Button>
            {error ? <span className="text-red-700">{error}</span> : <span>图片会先进入编辑草稿，提交父表单时一并保存。</span>}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={closeWithProtection}>取消</Button>
            <Button type="button" onClick={saveAndClose} icon={<Save className="h-4 w-4" aria-hidden="true" />}>保存内容</Button>
          </div>
        </div>
      )}
    >
      <Tabs value={mode} onValueChange={(next) => changeMode(next as DocumentMode)}>
        <TabsList className="mb-4 flex h-auto flex-wrap justify-start gap-1">
          <TabsTrigger aria-label="主编辑模式" value="edit" className="gap-1.5"><TextCursorInput className="h-3.5 w-3.5" aria-hidden="true" />编辑</TabsTrigger>
          <TabsTrigger aria-label="主预览模式" value="preview" className="gap-1.5"><Eye className="h-3.5 w-3.5" aria-hidden="true" />预览</TabsTrigger>
          <TabsTrigger aria-label="主分屏模式" value="split" className="gap-1.5"><PanelsTopLeft className="h-3.5 w-3.5" aria-hidden="true" />分屏</TabsTrigger>
          <TabsTrigger aria-label="主 Markdown 模式" value="markdown" className="gap-1.5"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />Markdown</TabsTrigger>
          <TabsTrigger aria-label="主 HTML 模式" value="html" className="gap-1.5"><FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />HTML</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="mt-0">
          <RichTextEditor label={label} value={draft} onChange={setDraft} onUploadImage={onUploadImage} className="[&_.rich-text-editor]:min-h-[440px]" />
        </TabsContent>
        <TabsContent value="preview" className="mt-0">
          <DocumentPreview html={currentHtml()} />
        </TabsContent>
        <TabsContent value="split" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-2">
            <RichTextEditor label={label} value={draft} onChange={setDraft} onUploadImage={onUploadImage} className="[&_.rich-text-editor]:min-h-[440px]" />
            <DocumentPreview html={draft} />
          </div>
        </TabsContent>
        <TabsContent value="markdown" className="mt-0">
          <textarea
            aria-label={`${label} Markdown编辑`}
            className="min-h-[520px] w-full resize-y rounded-md border border-[var(--input)] bg-[var(--card)] p-3 font-mono text-xs leading-6 shadow-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15"
            value={markdownDraft}
            onChange={(event) => {
              setMarkdownDraft(event.target.value)
              setDraft(htmlFromMarkdown(event.target.value))
            }}
          />
        </TabsContent>
        <TabsContent value="html" className="mt-0">
          <textarea
            aria-label={`${label} HTML编辑`}
            className="min-h-[520px] w-full resize-y rounded-md border border-[var(--input)] bg-[var(--card)] p-3 font-mono text-xs leading-6 shadow-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15"
            value={htmlDraft}
            onChange={(event) => {
              setHtmlDraft(event.target.value)
              setDraft(event.target.value)
            }}
          />
        </TabsContent>
      </Tabs>
    </Sheet>
  )
}

function DocumentPreview({ html }: { html: string }) {
  return (
    <article
      className="prose prose-sm max-h-[560px] min-h-[520px] max-w-none overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-4 leading-7 shadow-sm"
      dangerouslySetInnerHTML={{ __html: html || '<p>暂无内容</p>' }}
    />
  )
}

function markdownFromHtml(html: string) {
  return html ? turndown.turndown(html) : ''
}

function htmlFromMarkdown(markdown: string) {
  return marked.parse(markdown || '', { async: false }) as string
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
