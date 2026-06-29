import { PackageOpen, Plus } from 'lucide-react'
import { useState } from 'react'

import type { RewardItem, RewardItemInput } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface RewardItemsPanelProps {
  loading: boolean
  rewards: RewardItem[]
  onSave: (id: string | null, payload: RewardItemInput) => Promise<void>
}

interface RewardFormState {
  description: string
  image: string
  name: string
  pointsPrice: string
  sortOrder: string
  status: 'active' | 'inactive'
}

const emptyForm: RewardFormState = {
  description: '',
  image: '',
  name: '',
  pointsPrice: '50',
  sortOrder: '0',
  status: 'active',
}

export function RewardItemsPanel({ loading, rewards, onSave }: RewardItemsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const sortedRewards = [...rewards].sort((left, right) => Number(left.sortOrder || 0) - Number(right.sortOrder || 0))

  function edit(reward: RewardItem) {
    setEditingId(reward.id)
    setForm({
      description: reward.description || '',
      image: reward.image || '',
      name: reward.name,
      pointsPrice: String(reward.pointsPrice),
      sortOrder: String(reward.sortOrder || 0),
      status: reward.status,
    })
  }

  function reset() {
    setEditingId(null)
    setForm(emptyForm)
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSave(editingId, {
      description: form.description,
      image: form.image,
      name: form.name,
      pointsPrice: Number(form.pointsPrice),
      sortOrder: Number(form.sortOrder),
      status: form.status,
    })
    reset()
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4">
          <div>
            <p className="text-xs font-medium text-[var(--muted-foreground)]">Reward catalog</p>
            <h2 className="text-lg font-semibold">实物列表</h2>
          </div>
          <Badge tone="blue">{rewards.filter((item) => item.status === 'active').length} 个上架</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--muted)]/70 text-left text-xs text-[var(--muted-foreground)]">
                <th className="px-4 py-3 font-medium">实物</th>
                <th className="px-4 py-3 font-medium">积分价格</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">说明</th>
                <th className="px-4 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {sortedRewards.map((reward) => (
                <tr key={reward.id} className="border-b border-[var(--border)] last:border-0">
                  <td className="px-4 py-3 font-semibold">{reward.name}</td>
                  <td className="px-4 py-3 tabular-nums">{reward.pointsPrice}</td>
                  <td className="px-4 py-3">
                    <Badge tone={reward.status === 'active' ? 'green' : 'neutral'}>{reward.status === 'active' ? '上架' : '下线'}</Badge>
                  </td>
                  <td className="max-w-[320px] px-4 py-3 text-[var(--muted-foreground)]">{reward.description || '-'}</td>
                  <td className="px-4 py-3">
                    <Button className="h-8 px-2 text-xs" onClick={() => edit(reward)} type="button" variant="secondary">
                      编辑
                    </Button>
                  </td>
                </tr>
              ))}
              {sortedRewards.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-[var(--muted-foreground)]" colSpan={5}>
                    暂无实物
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <div className="border-b border-[var(--border)] px-5 py-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {editingId ? <PackageOpen className="h-4 w-4" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {editingId ? '编辑实物' : '新增实物'}
          </h3>
        </div>
        <form className="grid gap-4 p-5" onSubmit={submit}>
          <Field label="实物名称" htmlFor="reward-name">
            <Input id="reward-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="积分价格" htmlFor="reward-price">
            <Input id="reward-price" min="1" step="1" type="number" value={form.pointsPrice} onChange={(event) => setForm((current) => ({ ...current, pointsPrice: event.target.value }))} />
          </Field>
          <Field label="状态" htmlFor="reward-status">
            <Select
              id="reward-status"
              options={[
                { value: 'active', label: '上架' },
                { value: 'inactive', label: '下线' },
              ]}
              value={form.status}
              onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as 'active' | 'inactive' }))}
            />
          </Field>
          <Field label="排序" htmlFor="reward-sort">
            <Input id="reward-sort" step="1" type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} />
          </Field>
          <Field label="图片 URL" htmlFor="reward-image">
            <Input id="reward-image" value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} />
          </Field>
          <Field label="说明" htmlFor="reward-description">
            <Input id="reward-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button disabled={loading}>{editingId ? '保存实物' : '创建实物'}</Button>
            {editingId ? (
              <Button onClick={reset} type="button" variant="secondary">
                取消
              </Button>
            ) : null}
          </div>
        </form>
      </Panel>
    </div>
  )
}
