import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import {
  Bold,
  Code2,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Strikethrough,
} from 'lucide-react'
import { marked } from 'marked'
import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import TurndownService from 'turndown'

import { Button } from './Button'
import { Input } from './Input'
import { Tabs, TabsList, TabsTrigger } from './Tabs'
import { cn } from './utils'

type EditorMode = 'visual' | 'markdown' | 'html'

interface RichTextEditorProps {
  id?: string
  label: string
  value: string
  onChange: (value: string) => void
  onUploadImage?: (file: File) => Promise<string>
  className?: string
}

const turndown = new TurndownService({
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  headingStyle: 'atx',
})

export function RichTextEditor({ id, label, value, onChange, onUploadImage, className }: RichTextEditorProps) {
  const [mode, setMode] = useState<EditorMode>('visual')
  const [htmlSource, setHtmlSource] = useState(value || '')
  const [markdownSource, setMarkdownSource] = useState(() => markdownFromHtml(value || ''))
  const [linkHref, setLinkHref] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const modeRef = useRef(mode)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Image.configure({
        allowBase64: false,
        inline: false,
      }),
      Link.configure({
        autolink: true,
        openOnClick: false,
      }),
    ],
    content: value || '',
    editorProps: {
      attributes: {
        id: id || '',
        'aria-label': label,
        class: 'min-h-36 px-3 py-2 text-sm leading-6 outline-none',
      },
    },
    immediatelyRender: false,
    onUpdate({ editor: currentEditor }) {
      if (modeRef.current === 'visual') {
        onChange(currentEditor.getHTML())
      }
    },
  })

  useEffect(() => {
    if (!editor || mode !== 'visual' || editor.isFocused) {
      return
    }
    const next = value || ''
    if (editor.getHTML() !== next) {
      editor.commands.setContent(next, { emitUpdate: false })
    }
  }, [editor, mode, value])

  function changeMode(nextMode: EditorMode) {
    const currentHtml = currentHtmlValue()
    if (nextMode === 'markdown') {
      setMarkdownSource(markdownFromHtml(currentHtml))
    }
    if (nextMode === 'html') {
      setHtmlSource(currentHtml)
    }
    if (nextMode === 'visual') {
      editor?.commands.setContent(currentHtml, { emitUpdate: false })
      onChange(currentHtml)
    }
    setMode(nextMode)
  }

  function currentHtmlValue() {
    if (mode === 'visual') {
      return editor?.getHTML() || value || ''
    }
    if (mode === 'markdown') {
      return htmlFromMarkdown(markdownSource)
    }
    return htmlSource
  }

  function updateMarkdown(next: string) {
    setMarkdownSource(next)
    onChange(htmlFromMarkdown(next))
  }

  function updateHtml(next: string) {
    setHtmlSource(next)
    onChange(next)
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    if (!onUploadImage) {
      setError('未配置富文本图片上传接口')
      return
    }
    setUploading(true)
    setError('')
    try {
      const url = await onUploadImage(file)
      editor?.chain().focus().setImage({ src: url, alt: file.name }).run()
      if (mode !== 'visual') {
        const imageHtml = `<p><img src="${escapeHtmlAttribute(url)}" alt="${escapeHtmlAttribute(file.name)}"></p>`
        const next = `${currentHtmlValue()}${imageHtml}`
        updateHtml(next)
        setHtmlSource(next)
        setMarkdownSource(markdownFromHtml(next))
      }
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  function applyLink() {
    if (!editor) {
      return
    }
    const href = linkHref.trim()
    if (!href) {
      editor.chain().focus().unsetLink().run()
      setShowLinkInput(false)
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    setShowLinkInput(false)
    setLinkHref('')
  }

  return (
    <div className={cn('overflow-hidden rounded-md border border-[var(--input)] bg-[var(--card)] shadow-sm focus-within:border-[var(--ring)] focus-within:ring-2 focus-within:ring-[var(--ring)]/15', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--muted)]/45 px-2 py-1.5">
        <EditorToolbar
          label={label}
          mode={mode}
          uploading={uploading}
          onImageClick={() => inputRef.current?.click()}
          onLinkClick={() => setShowLinkInput((current) => !current)}
          onToggle={(command) => {
            if (!editor) {
              return
            }
            command(editor)
          }}
        />
        <Tabs value={mode} onValueChange={(next) => changeMode(next as EditorMode)}>
          <TabsList className="min-h-8">
            <TabsTrigger className="min-h-6 px-2 py-1 text-[11px]" value="visual">编辑</TabsTrigger>
            <TabsTrigger className="min-h-6 px-2 py-1 text-[11px]" value="markdown">Markdown</TabsTrigger>
            <TabsTrigger className="min-h-6 px-2 py-1 text-[11px]" value="html">HTML</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {showLinkInput ? (
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-2 py-2">
          <Input
            aria-label={`${label}链接`}
            className="h-8 flex-1"
            placeholder="https://"
            value={linkHref}
            onChange={(event) => setLinkHref(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                applyLink()
              }
            }}
          />
          <Button className="h-8" type="button" variant="secondary" onClick={applyLink}>应用</Button>
        </div>
      ) : null}
      <input ref={inputRef} aria-label={`${label}上传图片`} className="sr-only" type="file" accept="image/*" onChange={uploadImage} />
      {mode === 'visual' ? (
        <EditorContent
          editor={editor}
          className="rich-text-editor max-h-[420px] min-h-36 overflow-auto [&_.ProseMirror-focused]:outline-none"
        />
      ) : null}
      {mode === 'markdown' ? (
        <textarea
          aria-label={`${label} Markdown源码`}
          className="min-h-56 w-full resize-y bg-[var(--card)] px-3 py-2 font-mono text-xs leading-6 outline-none"
          value={markdownSource}
          onChange={(event) => updateMarkdown(event.target.value)}
        />
      ) : null}
      {mode === 'html' ? (
        <textarea
          aria-label={`${label} HTML源码`}
          className="min-h-56 w-full resize-y bg-[var(--card)] px-3 py-2 font-mono text-xs leading-6 outline-none"
          value={htmlSource}
          onChange={(event) => updateHtml(event.target.value)}
        />
      ) : null}
      {error ? <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
    </div>
  )
}

function EditorToolbar({ label, mode, uploading, onImageClick, onLinkClick, onToggle }: {
  label: string
  mode: EditorMode
  uploading: boolean
  onImageClick: () => void
  onLinkClick: () => void
  onToggle: (command: (editor: NonNullable<ReturnType<typeof useEditor>>) => void) => void
}) {
  const disabled = mode !== 'visual'
  return (
    <div className="flex flex-wrap items-center gap-1">
      <ToolButton disabled={disabled} label={`${label}二级标题`} icon={<Heading2 className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleHeading({ level: 2 }).run())} />
      <ToolButton disabled={disabled} label={`${label}加粗`} icon={<Bold className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleBold().run())} />
      <ToolButton disabled={disabled} label={`${label}斜体`} icon={<Italic className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleItalic().run())} />
      <ToolButton disabled={disabled} label={`${label}删除线`} icon={<Strikethrough className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleStrike().run())} />
      <ToolButton disabled={disabled} label={`${label}无序列表`} icon={<List className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleBulletList().run())} />
      <ToolButton disabled={disabled} label={`${label}有序列表`} icon={<ListOrdered className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleOrderedList().run())} />
      <ToolButton disabled={disabled} label={`${label}引用`} icon={<Quote className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleBlockquote().run())} />
      <ToolButton disabled={disabled} label={`${label}代码`} icon={<Code2 className="h-4 w-4" />} onClick={() => onToggle((editor) => editor.chain().focus().toggleCodeBlock().run())} />
      <ToolButton disabled={disabled} label={`${label}链接`} icon={<Link2 className="h-4 w-4" />} onClick={onLinkClick} />
      <ToolButton disabled={uploading} label={`${label}图片`} icon={<ImagePlus className="h-4 w-4" />} onClick={onImageClick} />
    </div>
  )
}

function ToolButton({ disabled, icon, label, onClick }: { disabled?: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return <Button aria-label={label} className="h-8 w-8 px-0" disabled={disabled} icon={icon} onClick={onClick} type="button" variant="ghost" />
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
