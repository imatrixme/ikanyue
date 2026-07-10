import { ImagePlus, PackageOpen, Plus, Upload } from 'lucide-react'
import { useState } from 'react'

import type { RewardItem, RewardItemInput, UploadProgressHandler } from '../../app/types'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'

interface RewardItemsPanelProps {
  loading: boolean
  rewards: RewardItem[]
  onSave: (id: string | null, payload: RewardItemInput) => Promise<void>
  onUploadImage?: (id: string, file: File, onProgress?: UploadProgressHandler) => Promise<RewardItem | null>
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

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const maxImageSize = 5 * 1024 * 1024

export function RewardItemsPanel({ loading, rewards, onSave, onUploadImage }: RewardItemsPanelProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [fileError, setFileError] = useState('')
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [previewUrl, setPreviewUrl] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
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
    setFileError('')
    setPreviewUrl(reward.image || '')
    setSelectedFile(null)
    setUploadProgress(0)
    setFileInputVersion((value) => value + 1)
  }

  function reset() {
    setEditingId(null)
    setForm(emptyForm)
    setFileError('')
    setPreviewUrl('')
    setSelectedFile(null)
    setUploadProgress(0)
    setFileInputVersion((value) => value + 1)
  }

  function selectImage(file: File | null) {
    setFileError('')
    setSelectedFile(null)
    setUploadProgress(0)
    if (!file) {
      return
    }
    if (!acceptedImageTypes.has(file.type)) {
      setFileError('仅支持 JPG、PNG、WebP、GIF 或 AVIF 图片')
      return
    }
    if (file.size <= 0 || file.size > maxImageSize) {
      setFileError(file.size <= 0 ? '图片文件不能为空' : '图片不能超过 5MB')
      return
    }
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => setPreviewUrl(typeof reader.result === 'string' ? reader.result : '')
    reader.readAsDataURL(file)
  }

  async function uploadImage() {
    if (!editingId || !selectedFile || !onUploadImage) {
      return
    }
    setUploading(true)
    try {
      const reward = await onUploadImage(editingId, selectedFile, setUploadProgress)
      if (reward) {
        setPreviewUrl(reward.image)
        setSelectedFile(null)
        setUploadProgress(100)
        setFileInputVersion((value) => value + 1)
      }
    } finally {
      setUploading(false)
    }
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
                  <td className="px-4 py-3 font-semibold">
                    <div className="flex items-center gap-3">
                      {reward.image ? (
                        <img alt="" className="h-10 w-10 shrink-0 rounded-md border border-[var(--border)] object-cover" src={reward.image} />
                      ) : (
                        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]">
                          <PackageOpen className="h-4 w-4" aria-hidden="true" />
                        </span>
                      )}
                      <span>{reward.name}</span>
                    </div>
                  </td>
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
          <Field label="兼容图片 URL" htmlFor="reward-image">
            <Input id="reward-image" value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} />
          </Field>
          {editingId ? (
            <div className="grid gap-3 rounded-md border border-[var(--border)] bg-[var(--muted)]/35 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ImagePlus className="h-4 w-4" aria-hidden="true" />
                实物图片
              </div>
              {previewUrl ? (
                <img alt="实物图片预览" className="aspect-[4/3] w-full rounded-md border border-[var(--border)] bg-[var(--background)] object-contain" src={previewUrl} />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-md border border-dashed border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                  暂无图片
                </div>
              )}
              <Field label="选择图片" htmlFor="reward-image-file" hint="JPG、PNG、WebP、GIF 或 AVIF，最大 5MB">
                <Input
                  key={fileInputVersion}
                  accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
                  id="reward-image-file"
                  type="file"
                  onChange={(event) => selectImage(event.target.files?.[0] || null)}
                />
              </Field>
              {fileError ? <p className="text-xs font-medium text-[var(--destructive)]">{fileError}</p> : null}
              {selectedFile ? <p className="text-xs text-[var(--muted-foreground)]">{selectedFile.name}</p> : null}
              {uploading || uploadProgress > 0 ? (
                <div className="grid gap-1">
                  <div className="flex justify-between text-xs text-[var(--muted-foreground)]">
                    <span>{uploading ? '上传中' : '上传完成'}</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <progress aria-label="上传进度" className="h-2 w-full accent-[var(--primary)]" max={100} value={uploadProgress} />
                </div>
              ) : null}
              <Button
                disabled={loading || uploading || !selectedFile || !onUploadImage}
                icon={<Upload className="h-4 w-4" aria-hidden="true" />}
                onClick={() => void uploadImage()}
                type="button"
              >
                {uploading ? '上传中' : previewUrl ? '替换图片' : '上传图片'}
              </Button>
            </div>
          ) : null}
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
