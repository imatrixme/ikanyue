import { FileText, UploadCloud, X } from 'lucide-react'
import { useEffect, useMemo, type ChangeEvent } from 'react'

import { Button } from './Button'
import { isFileValue } from '../../app/resourceForms'

interface FilePickerProps {
  id?: string
  label: string
  value: string | File
  accept?: string
  onValueChange: (value: string | File) => void
}

export function FilePicker({ id, label, value, accept, onValueChange }: FilePickerProps) {
  const objectUrl = useMemo(() => {
    if (!isFileValue(value) || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return ''
    }
    return URL.createObjectURL(value)
  }, [value])
  const fileName = isFileValue(value) ? value.name : fileNameFromPath(value)
  const imagePreview = useMemo(() => {
    if (isFileValue(value)) {
      return value.type.startsWith('image/') ? objectUrl : ''
    }
    return isImageUrl(value) ? value : ''
  }, [objectUrl, value])

  useEffect(() => {
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl)
      }
    }
  }, [objectUrl])

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) {
      onValueChange(file)
    }
  }

  return (
    <div className="grid gap-3 rounded-md border border-dashed border-[var(--input)] bg-[var(--muted)]/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {imagePreview ? (
            <img alt={`${label}预览`} className="h-16 w-20 rounded-md border border-[var(--border)] object-cover" src={imagePreview} />
          ) : (
            <span className="inline-flex h-16 w-20 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)]">
              <FileText className="h-5 w-5" aria-hidden="true" />
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-[var(--foreground)]">{fileName || '未选择文件'}</div>
            <div className="text-xs text-[var(--muted-foreground)]">{isFileValue(value) ? '浏览器端暂存，保存时随表单提交' : value ? '已有文件' : '请选择本地文件'}</div>
          </div>
        </div>
        <label>
          <input aria-label={`选择${label}`} className="sr-only" id={id} type="file" accept={accept} onChange={onFileChange} />
          <Button asSpan icon={<UploadCloud className="h-4 w-4" aria-hidden="true" />} variant="secondary">
            选择文件
          </Button>
        </label>
      </div>
      {value ? (
        <Button className="justify-self-start" icon={<X className="h-4 w-4" aria-hidden="true" />} onClick={() => onValueChange('')} type="button" variant="ghost">
          清除文件
        </Button>
      ) : null}
    </div>
  )
}

function fileNameFromPath(value: string | File) {
  if (!value || isFileValue(value)) {
    return ''
  }
  const segments = value.split(/[/?#]/).filter(Boolean)
  return segments[segments.length - 1] || value
}

function isImageUrl(value: string | File) {
  return typeof value === 'string' && /\.(png|jpe?g|webp|gif|avif|svg)(\?.*)?$/i.test(value)
}
