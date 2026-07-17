import { ImageOff, LoaderCircle } from 'lucide-react'
import { useState, type ReactNode } from 'react'

import { Field, Input } from './Input'
import { cn } from './utils'

type MediaState = 'empty' | 'failed' | 'loaded' | 'loading'

export function ImagePreview({ alt = '', className, fallback, fit = 'cover', name, src = '' }: { alt?: string; className?: string; fallback?: ReactNode; fit?: 'contain' | 'cover'; name: string; src?: string }) {
  const [loadedSrc, setLoadedSrc] = useState('')
  const [failedSrc, setFailedSrc] = useState('')
  const state: MediaState = !src ? 'empty' : failedSrc === src ? 'failed' : loadedSrc === src ? 'loaded' : 'loading'
  return (
    <div className={cn('relative isolate aspect-[4/3] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]', className)}>
      {src && state !== 'failed' ? <img alt={alt} className={cn('absolute inset-0 h-full w-full transition-opacity', fit === 'contain' ? 'object-contain' : 'object-cover', state === 'loaded' ? 'opacity-100' : 'opacity-0')} onError={() => setFailedSrc(src)} onLoad={() => setLoadedSrc(src)} src={src} /> : null}
      {state !== 'loaded' ? <div aria-label={state === 'loading' ? `${name}图片加载中` : `${name}暂无可用图片`} className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]">{state === 'loading' ? <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" /> : state === 'failed' ? <span className="grid justify-items-center gap-1 text-xs"><ImageOff aria-hidden="true" className="h-4 w-4" />图片不可用</span> : fallback}</div> : null}
    </div>
  )
}

export function FileUploader({ accept, error, fileName, hint, id, inputKey, label, onChange, progress, uploading }: { accept: string; error?: string; fileName?: string; hint: string; id: string; inputKey?: number; label: string; onChange: (file: File | null) => void; progress?: number; uploading?: boolean }) {
  return (
    <div className="grid gap-2">
      <Field hint={hint} htmlFor={id} label={label}><Input accept={accept} id={id} key={inputKey} onChange={(event) => onChange(event.target.files?.[0] || null)} type="file" /></Field>
      {error ? <p className="text-xs font-medium text-[var(--destructive)]">{error}</p> : null}
      {fileName ? <p className="truncate text-xs text-[var(--muted-foreground)]">{fileName}</p> : null}
      {uploading || (progress || 0) > 0 ? <div className="grid gap-1"><div className="flex justify-between text-xs text-[var(--muted-foreground)]"><span>{uploading ? '上传中' : '上传完成'}</span><span>{progress || 0}%</span></div><progress aria-label="上传进度" className="h-2 w-full accent-[var(--point)]" max={100} value={progress || 0} /></div> : null}
    </div>
  )
}
