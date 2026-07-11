import { ChevronDown, ImagePlus, Upload, X } from 'lucide-react'
import { useState } from 'react'

import type { RewardItem, RewardItemInput, UploadProgressHandler } from '../../app/types'
import { Button } from '../ui/Button'
import { Panel } from '../ui/Card'
import { Field, Input } from '../ui/Input'
import { Select } from '../ui/Select'
import { RewardMedia } from './RewardMedia'

interface RewardEditorProps {
  loading: boolean
  reward: RewardItem | null
  onClose: () => void
  onSave: (id: string | null, payload: RewardItemInput) => Promise<boolean>
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

const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const maxImageSize = 5 * 1024 * 1024

export function RewardEditor({ loading, reward, onClose, onSave, onUploadImage }: RewardEditorProps) {
  const [form, setForm] = useState<RewardFormState>(() => rewardForm(reward))
  const [fileError, setFileError] = useState('')
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(reward?.image || '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)

  function selectImage(file: File | null) {
    setFileError('')
    setSelectedFile(null)
    setUploadProgress(0)
    if (!file) return
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
    if (!reward || !selectedFile || !onUploadImage) return
    setUploading(true)
    try {
      const updated = await onUploadImage(reward.id, selectedFile, setUploadProgress)
      if (updated) {
        setPreviewUrl(updated.image)
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
    const saved = await onSave(reward?.id || null, {
      description: form.description,
      image: form.image,
      name: form.name,
      pointsPrice: Number(form.pointsPrice),
      sortOrder: Number(form.sortOrder),
      status: form.status,
    })
    if (saved) onClose()
  }

  return (
    <Panel className="min-h-full overflow-hidden rounded-none border-0 shadow-none lg:min-h-0 lg:rounded-lg lg:border lg:shadow-sm">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--card)] px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">{reward ? '编辑实物' : '新增实物'}</p>
          <h3 className="truncate text-lg font-semibold">{reward?.name || '创建新的兑换实物'}</h3>
        </div>
        <Button aria-label="关闭实物编辑器" className="h-9 w-9 px-0" icon={<X className="h-4 w-4" />} onClick={onClose} type="button" variant="ghost" />
      </div>
      <form className="grid gap-5 p-5" onSubmit={submit}>
        <section className="grid gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="h-4 w-4" aria-hidden="true" />实物图片</div>
          <RewardMedia alt="实物图片预览" className="w-full" fit="contain" name={form.name || reward?.name || '实物'} src={previewUrl} />
          {reward ? (
            <>
              <Field label="选择图片" htmlFor="reward-image-file" hint="JPG、PNG、WebP、GIF 或 AVIF，最大 5MB">
                <Input key={fileInputVersion} accept="image/jpeg,image/png,image/webp,image/gif,image/avif" id="reward-image-file" type="file" onChange={(event) => selectImage(event.target.files?.[0] || null)} />
              </Field>
              {fileError ? <p className="text-xs font-medium text-[var(--destructive)]">{fileError}</p> : null}
              {selectedFile ? <p className="text-xs text-[var(--muted-foreground)]">{selectedFile.name}</p> : null}
              {uploading || uploadProgress > 0 ? (
                <div className="grid gap-1">
                  <div className="flex justify-between text-xs text-[var(--muted-foreground)]"><span>{uploading ? '上传中' : '上传完成'}</span><span>{uploadProgress}%</span></div>
                  <progress aria-label="上传进度" className="h-2 w-full accent-[var(--point)]" max={100} value={uploadProgress} />
                </div>
              ) : null}
              <Button disabled={loading || uploading || !selectedFile || !onUploadImage} icon={<Upload className="h-4 w-4" />} onClick={() => void uploadImage()} type="button">
                {uploading ? '上传中' : previewUrl ? '替换图片' : '上传图片'}
              </Button>
            </>
          ) : (
            <p className="rounded-md bg-[var(--info-soft)] px-3 py-2 text-sm text-[var(--info)]">先创建实物，再上传和管理图片。</p>
          )}
        </section>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="实物名称" htmlFor="reward-name">
            <Input id="reward-name" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} />
          </Field>
          <Field label="积分价格" htmlFor="reward-price">
            <Input id="reward-price" min="1" step="1" type="number" value={form.pointsPrice} onChange={(event) => setForm((current) => ({ ...current, pointsPrice: event.target.value }))} />
          </Field>
          <Field label="状态" htmlFor="reward-status">
            <Select id="reward-status" options={[{ value: 'active', label: '上架' }, { value: 'inactive', label: '下线' }]} value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as RewardFormState['status'] }))} />
          </Field>
          <Field className="sm:col-span-2" label="说明" htmlFor="reward-description">
            <Input id="reward-description" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
          </Field>
        </div>

        <details className="rounded-md border border-[var(--border)] px-3 py-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">高级设置<ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
          <div className="mt-4 grid gap-4">
            <Field label="排序" htmlFor="reward-sort"><Input id="reward-sort" step="1" type="number" value={form.sortOrder} onChange={(event) => setForm((current) => ({ ...current, sortOrder: event.target.value }))} /></Field>
            <Field label="兼容图片 URL" htmlFor="reward-image" hint="仅用于保留旧数据；新图片请使用上方上传功能。"><Input id="reward-image" value={form.image} onChange={(event) => setForm((current) => ({ ...current, image: event.target.value }))} /></Field>
          </div>
        </details>

        <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4">
          <Button onClick={onClose} type="button" variant="secondary">取消</Button>
          <Button disabled={loading}>{reward ? '保存实物' : '创建实物'}</Button>
        </div>
      </form>
    </Panel>
  )
}

function rewardForm(reward: RewardItem | null): RewardFormState {
  return {
    description: reward?.description || '',
    image: reward?.image || '',
    name: reward?.name || '',
    pointsPrice: String(reward?.pointsPrice || 50),
    sortOrder: String(reward?.sortOrder || 0),
    status: reward?.status || 'active',
  }
}
