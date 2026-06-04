import { useEffect, useState, type RefObject, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

interface FloatingTooltipProps {
  anchorRef: RefObject<HTMLElement | null>
  children: ReactNode
  open: boolean
  width?: number
}

export function FloatingTooltip({ anchorRef, children, open, width = 520 }: FloatingTooltipProps) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null)

  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      return
    }

    function updatePosition() {
      const anchor = anchorRef.current
      if (!anchor) {
        return
      }
      const rect = anchor.getBoundingClientRect()
      const maxLeft = Math.max(12, window.innerWidth - Math.min(width, window.innerWidth - 24) - 12)
      setPosition({
        left: Math.min(Math.max(12, rect.left), maxLeft),
        top: Math.min(rect.bottom + 8, window.innerHeight - 96),
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open, width])

  if (!open || !position || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      className="pointer-events-none fixed z-[80] max-h-[min(420px,calc(100vh-2rem))] overflow-auto rounded-md border border-[var(--border)] bg-[var(--popover)] p-3 text-left text-[var(--popover-foreground)] shadow-2xl"
      role="tooltip"
      style={{
        left: position.left,
        top: position.top,
        width: `min(${width}px, calc(100vw - 24px))`,
      }}
    >
      {children}
    </div>,
    document.body,
  )
}
