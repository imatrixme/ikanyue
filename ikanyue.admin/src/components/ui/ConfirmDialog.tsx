import type { ReactNode } from 'react'

import { Button } from './Button'
import { DialogShell } from './DialogShell'

export function ConfirmDialog({ cancelLabel = '取消', confirmLabel = '确认', description, destructive = false, onCancel, onConfirm, title }: { cancelLabel?: string; confirmLabel?: string; description: ReactNode; destructive?: boolean; onCancel: () => void; onConfirm: () => void; title: string }) {
  return (
    <DialogShell onRequestClose={onCancel} size="compact" title={title}>
      <div className="grid gap-5 p-5">
        <div className="text-sm text-[var(--muted-foreground)]">{description}</div>
        <div className="flex justify-end gap-2"><Button onClick={onCancel} type="button" variant="secondary">{cancelLabel}</Button><Button data-autofocus onClick={onConfirm} type="button" variant={destructive ? 'danger' : 'primary'}>{confirmLabel}</Button></div>
      </div>
    </DialogShell>
  )
}
