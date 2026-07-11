import { ImageOff, LoaderCircle } from 'lucide-react'
import { useState } from 'react'

import { cn } from '../ui/utils'

interface RewardMediaProps {
  name: string
  src?: string
  alt?: string
  className?: string
  fit?: 'cover' | 'contain'
}

type MediaState = 'empty' | 'loading' | 'loaded' | 'failed'

export function RewardMedia({ name, src = '', alt = '', className, fit = 'cover' }: RewardMediaProps) {
  const [loadedSrc, setLoadedSrc] = useState('')
  const [failedSrc, setFailedSrc] = useState('')
  const state: MediaState = !src ? 'empty' : failedSrc === src ? 'failed' : loadedSrc === src ? 'loaded' : 'loading'

  const initial = name.trim().slice(0, 1) || '礼'
  const showPlaceholder = state !== 'loaded'

  return (
    <div
      className={cn(
        'relative isolate aspect-[4/3] shrink-0 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--muted)]',
        className,
      )}
    >
      {src && state !== 'failed' ? (
        <img
          alt={alt}
          className={cn(
            'absolute inset-0 h-full w-full transition-opacity',
            fit === 'contain' ? 'object-contain' : 'object-cover',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
          )}
          onError={() => setFailedSrc(src)}
          onLoad={() => setLoadedSrc(src)}
          src={src}
        />
      ) : null}
      {showPlaceholder ? (
        <div
          aria-label={state === 'loading' ? `${name}图片加载中` : `${name}暂无可用图片`}
          className="absolute inset-0 flex items-center justify-center bg-[var(--muted)] text-[var(--muted-foreground)]"
        >
          {state === 'loading' ? (
            <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" />
          ) : state === 'failed' ? (
            <span className="grid justify-items-center gap-1 text-[10px]">
              <ImageOff className="h-4 w-4" aria-hidden="true" />
              图片不可用
            </span>
          ) : (
            <span className="text-lg font-semibold text-[var(--point)]">{initial}</span>
          )}
        </div>
      ) : null}
    </div>
  )
}
