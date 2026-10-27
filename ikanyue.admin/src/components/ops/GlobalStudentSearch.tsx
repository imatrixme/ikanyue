import { Search } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { StudentRecord } from '../../app/types'
import { cn } from '../ui/utils'

interface GlobalStudentSearchProps {
  onOpen: (student: StudentRecord) => void
  onSearch: (keyword: string) => Promise<StudentRecord[]>
}

/** Top-bar student lookup. `/` focuses it from anywhere outside a form field. */
export function GlobalStudentSearch({ onOpen, onSearch }: GlobalStudentSearchProps) {
  const input = useRef<HTMLInputElement>(null)
  const [keyword, setKeyword] = useState('')
  const [results, setResults] = useState<StudentRecord[]>([])
  const [searched, setSearched] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    function focusOnSlash(event: globalThis.KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      const target = event.target as HTMLElement | null
      if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))) return
      event.preventDefault()
      input.current?.focus()
    }
    window.addEventListener('keydown', focusOnSlash)
    return () => window.removeEventListener('keydown', focusOnSlash)
  }, [])

  useEffect(() => {
    const needle = keyword.trim()
    if (!needle) return
    let current = true
    const timer = window.setTimeout(() => {
      void onSearch(needle).then((items) => {
        if (!current) return
        setResults(items.slice(0, 8))
        setSearched(needle)
        setActive(0)
      }).catch(() => {
        if (current) { setResults([]); setSearched(needle) }
      })
    }, 250)
    return () => { current = false; window.clearTimeout(timer) }
  }, [keyword, onSearch])

  const needle = keyword.trim()
  const visible = needle ? results : []
  const settled = needle !== '' && searched === needle

  function choose(student: StudentRecord) {
    onOpen(student)
    setKeyword('')
    setOpen(false)
    input.current?.blur()
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0))) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)) }
    else if (event.key === 'Enter' && visible[active]) { event.preventDefault(); choose(visible[active]) }
    else if (event.key === 'Escape') { setKeyword(''); setOpen(false); input.current?.blur() }
  }

  return (
    <div className="relative w-full max-w-xs" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false) }}>
      <Search aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
      <input
        aria-autocomplete="list"
        aria-controls={open && needle ? 'global-student-results' : undefined}
        aria-expanded={open && needle !== ''}
        aria-label="全局搜索学员"
        autoComplete="off"
        className="h-9 w-full rounded-md border border-[var(--input)] bg-[var(--card)] pl-8 pr-8 text-sm outline-none focus-visible:border-[var(--ring)] focus-visible:ring-2 focus-visible:ring-[var(--ring)]/15"
        onChange={(event) => { setKeyword(event.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="搜索学员姓名或手机号"
        ref={input}
        role="combobox"
        value={keyword}
      />
      <kbd aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">/</kbd>
      {open && needle ? (
        <div className="absolute right-0 z-50 mt-1 max-h-72 w-full min-w-64 overflow-auto rounded-md border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg" id="global-student-results" role="listbox">
          {!settled ? <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]">正在搜索...</p> : null}
          {settled && visible.length === 0 ? <p className="px-3 py-2 text-sm text-[var(--muted-foreground)]">没有找到“{needle}”</p> : null}
          {settled ? visible.map((student, index) => (
            <button aria-selected={index === active} className={cn('flex w-full items-center justify-between gap-3 rounded-sm px-3 py-2 text-left text-sm hover:bg-[var(--muted)]', index === active && 'bg-[var(--muted)]')} key={student.id} onClick={() => choose(student)} onMouseEnter={() => setActive(index)} role="option" type="button">
              <span className="truncate font-medium">{student.realName || student.nickName || '未命名学员'}</span>
              <span className="shrink-0 tabular-nums text-xs text-[var(--muted-foreground)]">{student.cellphone}</span>
            </button>
          )) : null}
        </div>
      ) : null}
    </div>
  )
}
