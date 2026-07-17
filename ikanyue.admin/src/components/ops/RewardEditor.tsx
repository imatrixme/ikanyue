import { ChevronDown, ImagePlus, Upload } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import type { RewardItem, RewardItemInput, UploadProgressHandler } from '../../app/types'
import { Button } from '../ui/Button'
import { Textarea } from '../ui/Controls'
import { Alert } from '../ui/Feedback'
import { Field, Input } from '../ui/Input'
import { FileUploader } from '../ui/Media'
import { Select } from '../ui/Select'
import { RewardMedia } from './RewardMedia'

interface RewardEditorProps {
  loading: boolean
  onCancel: () => void
  onDirtyChange: (dirty: boolean) => void
  onSave: (id: string | null, payload: RewardItemInput) => Promise<boolean>
  onSaved: () => void
  onUploadImage?: (id: string, file: File, onProgress?: UploadProgressHandler) => Promise<RewardItem | null>
  reward: RewardItem | null
}

interface RewardFormState { description: string; image: string; name: string; pointsPrice: string; sortOrder: string; status: 'active' | 'inactive' }
const acceptedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'])
const maxImageSize = 5 * 1024 * 1024

export function RewardEditor({ loading, onCancel, onDirtyChange, onSave, onSaved, onUploadImage, reward }: RewardEditorProps) {
  const initialForm = useMemo(() => rewardForm(reward), [reward])
  const [form, setForm] = useState<RewardFormState>(initialForm)
  const [fileError, setFileError] = useState('')
  const [fileInputVersion, setFileInputVersion] = useState(0)
  const [previewUrl, setPreviewUrl] = useState(reward?.image || '')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploading, setUploading] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initialForm) || Boolean(selectedFile)

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange])

  function update<K extends keyof RewardFormState>(key: K, value: RewardFormState[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

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
    const saved = await onSave(reward?.id || null, { description: form.description, image: form.image, name: form.name, pointsPrice: Number(form.pointsPrice), sortOrder: Number(form.sortOrder), status: form.status })
    if (saved) onSaved()
  }

  return (
    <form className="flex min-h-full flex-col" onSubmit={submit}>
      <div className="grid gap-5 p-5">
        <section className="grid gap-3 sm:grid-cols-[minmax(220px,0.9fr)_minmax(260px,1.1fr)] sm:items-start">
          <div className="grid gap-3"><div className="flex items-center gap-2 text-sm font-semibold"><ImagePlus className="h-4 w-4" aria-hidden="true" />实物图片</div><RewardMedia alt="实物图片预览" className="w-full" fit="contain" name={form.name || reward?.name || '实物'} src={previewUrl} /></div>
          <div className="grid gap-3 pt-7">
            {reward ? <><FileUploader accept="image/jpeg,image/png,image/webp,image/gif,image/avif" error={fileError} fileName={selectedFile?.name} hint="JPG、PNG、WebP、GIF 或 AVIF，最大 5MB" id="reward-image-file" inputKey={fileInputVersion} label="选择图片" onChange={selectImage} progress={uploadProgress} uploading={uploading} /><Button disabled={loading || uploading || !selectedFile || !onUploadImage} icon={<Upload className="h-4 w-4" />} onClick={() => void uploadImage()} type="button">{uploading ? '上传中' : previewUrl ? '替换图片' : '上传图片'}</Button></> : <Alert>先创建实物，再上传和管理图片。</Alert>}
          </div>
        </section>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="sm:col-span-2" label="实物名称" htmlFor="reward-name"><Input data-autofocus id="reward-name" value={form.name} onChange={(event) => update('name', event.target.value)} /></Field>
          <Field label="积分价格" htmlFor="reward-price"><Input id="reward-price" min="1" step="1" type="number" value={form.pointsPrice} onChange={(event) => update('pointsPrice', event.target.value)} /></Field>
          <Field label="状态" htmlFor="reward-status"><Select id="reward-status" options={[{ value: 'active', label: '上架' }, { value: 'inactive', label: '下线' }]} value={form.status} onChange={(event) => update('status', event.target.value as RewardFormState['status'])} /></Field>
          <Field className="sm:col-span-2" label="说明" htmlFor="reward-description"><Textarea id="reward-description" value={form.description} onChange={(event) => update('description', event.target.value)} /></Field>
        </div>
        <details className="rounded-md border border-[var(--border)] px-3 py-2"><summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold">高级设置<ChevronDown className="h-4 w-4" aria-hidden="true" /></summary><div className="mt-4 grid gap-4"><Field label="排序" htmlFor="reward-sort"><Input id="reward-sort" step="1" type="number" value={form.sortOrder} onChange={(event) => update('sortOrder', event.target.value)} /></Field><Field label="兼容图片 URL" htmlFor="reward-image" hint="仅用于保留旧数据；新图片请使用上方上传功能。"><Input id="reward-image" value={form.image} onChange={(event) => update('image', event.target.value)} /></Field></div></details>
      </div>
      <div className="sticky bottom-0 mt-auto flex justify-end gap-2 border-t border-[var(--border)] bg-[var(--card)] px-5 py-4"><Button onClick={onCancel} type="button" variant="secondary">取消</Button><Button disabled={loading || !form.name.trim() || Number(form.pointsPrice) <= 0}>{reward ? '保存实物' : '创建实物'}</Button></div>
    </form>
  )
}

function rewardForm(reward: RewardItem | null): RewardFormState {
  return { description: reward?.description || '', image: reward?.image || '', name: reward?.name || '', pointsPrice: String(reward?.pointsPrice || 50), sortOrder: String(reward?.sortOrder || 0), status: reward?.status || 'active' }
}
