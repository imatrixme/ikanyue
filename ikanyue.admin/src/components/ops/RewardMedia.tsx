import { ImagePreview } from '../ui/Media'

interface RewardMediaProps {
  name: string
  src?: string
  alt?: string
  className?: string
  fit?: 'cover' | 'contain'
}

export function RewardMedia({ name, src = '', alt = '', className, fit = 'cover' }: RewardMediaProps) {
  const initial = name.trim().slice(0, 1) || '礼'
  return (
    <ImagePreview alt={alt} className={className} fallback={<span className="text-lg font-semibold text-[var(--point)]">{initial}</span>} fit={fit} name={name} src={src} />
  )
}
