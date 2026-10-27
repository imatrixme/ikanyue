import { useEffect, useRef, type RefObject } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function useOverlayFocus(ref: RefObject<HTMLElement | null>, dismissible: boolean, onRequestClose: () => void) {
  const openerRef = useRef<HTMLElement | null>(null)
  const closeHandlerRef = useRef(onRequestClose)

  useEffect(() => {
    closeHandlerRef.current = onRequestClose
  }, [onRequestClose])

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const overlay = ref.current
    const initial = overlay?.querySelector<HTMLElement>('[data-autofocus]')
      || overlay?.querySelector<HTMLElement>(focusableSelector)
      || overlay
    initial?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (!ref.current) return
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault()
        closeHandlerRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const focusable = Array.from(ref.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true')
      if (focusable.length === 0) {
        event.preventDefault()
        ref.current.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      const opener = openerRef.current
      if (opener?.isConnected) opener.focus()
    }
  }, [dismissible, ref])
}
