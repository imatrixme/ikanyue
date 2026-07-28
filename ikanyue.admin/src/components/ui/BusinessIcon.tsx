import type { ImgHTMLAttributes } from 'react'

import { cn } from './utils'

type BusinessIconSize = 'nav' | 'header' | 'metric'

const sizeClasses: Record<BusinessIconSize, string> = {
  nav: 'h-7 w-7',
  header: 'h-9 w-9',
  metric: 'h-8 w-8',
}

interface BusinessIconProps extends Omit<ImgHTMLAttributes<HTMLImageElement>, 'alt' | 'src'> {
  src: string
  size?: BusinessIconSize
}

export function BusinessIcon({ className, size = 'nav', src, ...props }: BusinessIconProps) {
  return <img alt="" aria-hidden="true" className={cn('block shrink-0 object-contain', sizeClasses[size], className)} src={src} {...props} />
}
