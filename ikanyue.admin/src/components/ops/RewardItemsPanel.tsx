import { Pencil, Plus } from 'lucide-react'
import { useState } from 'react'

import type { RewardItem, RewardItemInput, UploadProgressHandler } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { cn } from '../ui/utils'
import { RewardEditor } from './RewardEditor'
import { RewardMedia } from './RewardMedia'

interface RewardItemsPanelProps {
  loading: boolean
  rewards: RewardItem[]
  onSave: (id: string | null, payload: RewardItemInput) => Promise<boolean>
  onUploadImage?: (id: string, file: File, onProgress?: UploadProgressHandler) => Promise<RewardItem | null>
}

export function RewardItemsPanel({ loading, rewards, onSave, onUploadImage }: RewardItemsPanelProps) {
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const sortedRewards = [...rewards].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))
  const editingReward = sortedRewards.find((reward) => reward.id === editingId) || null

  function edit(reward: RewardItem) {
    setEditingId(reward.id)
    setEditorOpen(true)
  }

  function create() {
    setEditingId(null)
    setEditorOpen(true)
  }

  function close() {
    setEditorOpen(false)
    setEditingId(null)
  }

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)]">
      <Panel className="min-w-0 overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">实物管理</h2>
            <p className="mt-1 text-sm text-[var(--muted-foreground)]">维护积分价格、上下架状态和展示图片。</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="blue">{rewards.filter((item) => item.status === 'active').length} 个上架</Badge>
            <Button aria-label="新增实物" className="h-9 w-9 px-0" icon={<Plus className="h-4 w-4" />} onClick={create} type="button" />
          </div>
        </div>
        {sortedRewards.length > 0 ? (
          <div className="divide-y divide-[var(--border)]">
            <div className="hidden grid-cols-[minmax(180px,1.4fr)_90px_80px_minmax(120px,1fr)_64px] gap-3 bg-[var(--muted)]/65 px-4 py-2.5 text-xs text-[var(--muted-foreground)] md:grid">
              <span>实物</span><span>积分</span><span>状态</span><span>说明</span><span className="text-right">操作</span>
            </div>
            {sortedRewards.map((reward) => (
              <div key={reward.id} className={cn('grid gap-3 px-4 py-3 transition-colors md:grid-cols-[minmax(180px,1.4fr)_90px_80px_minmax(120px,1fr)_64px] md:items-center', editingId === reward.id ? 'bg-[var(--point-soft)]/55' : 'hover:bg-[var(--muted)]/45')}>
                <div className="flex min-w-0 items-center gap-3">
                  <RewardMedia className="w-20 md:w-16" name={reward.name} src={reward.image} />
                  <div className="min-w-0"><p className="truncate font-semibold">{reward.name}</p><p className="mt-1 truncate text-xs text-[var(--muted-foreground)] md:hidden">{reward.description || '暂无说明'}</p></div>
                </div>
                <div className="flex items-center justify-between gap-3 md:block"><span className="text-xs text-[var(--muted-foreground)] md:hidden">积分价格</span><span className="font-semibold tabular-nums text-[var(--point)]">{reward.pointsPrice} 分</span></div>
                <div className="flex items-center justify-between gap-3 md:block"><span className="text-xs text-[var(--muted-foreground)] md:hidden">状态</span><Badge tone={reward.status === 'active' ? 'green' : 'neutral'}>{reward.status === 'active' ? '上架' : '下线'}</Badge></div>
                <p className="hidden truncate text-sm text-[var(--muted-foreground)] md:block">{reward.description || '-'}</p>
                <Button aria-label={`编辑${reward.name}`} className="h-9 w-full px-3 md:w-9 md:px-0" icon={<Pencil className="h-4 w-4" />} onClick={() => edit(reward)} type="button" variant="secondary"><span className="md:hidden">编辑</span></Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid justify-items-center gap-3 px-5 py-16 text-center"><p className="font-semibold">还没有实物</p><p className="text-sm text-[var(--muted-foreground)]">创建第一个可供学员线下领取的实物。</p><Button icon={<Plus className="h-4 w-4" />} onClick={create}>新增实物</Button></div>
        )}
      </Panel>

      <aside className={cn('z-40 overflow-y-auto bg-[var(--background)] lg:sticky lg:top-24 lg:z-auto lg:max-h-[calc(100vh-7rem)] lg:bg-transparent', editorOpen ? 'fixed inset-0 block' : 'hidden lg:block')}>
        {editorOpen ? (
          <RewardEditor key={editingReward?.id || 'new-reward'} loading={loading} onClose={close} onSave={onSave} onUploadImage={onUploadImage} reward={editingReward} />
        ) : (
          <Panel className="grid min-h-72 place-items-center p-8 text-center"><div><p className="font-semibold">选择一个实物进行编辑</p><p className="mt-2 text-sm text-[var(--muted-foreground)]">也可以从左上角新增实物。</p></div></Panel>
        )}
      </aside>
    </div>
  )
}
