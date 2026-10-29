import type { UploadProgressHandler } from './types'

export async function request<T>(url: string, options: { method?: string; body?: unknown; token?: string; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json', ...options.headers }
  if (options.token) headers.authorization = `Bearer ${options.token}`

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const payload = await response.json()
  if (!response.ok || payload.code !== 10000) throw new Error(payload.message || '运营后台请求失败')
  return payload.data as T
}

export function toQuery(query: object): string {
  const params = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  })
  const text = params.toString()
  return text ? `?${text}` : ''
}

// Multipart upload with progress; the server reads the file from `field`.
export function uploadRequest<T>(url: string, token: string, file: File, onProgress?: UploadProgressHandler, field = 'imageFile'): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total > 0) {
        onProgress?.(Math.round((event.loaded / event.total) * 100))
      }
    }
    xhr.onerror = () => reject(new Error('图片上传失败，请检查网络后重试'))
    xhr.onload = () => {
      let payload: { code?: number; data?: T; message?: string }
      try {
        payload = JSON.parse(xhr.responseText) as { code?: number; data?: T; message?: string }
      } catch {
        reject(new Error('图片上传返回了无效响应'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300 || payload.code !== 10000 || payload.data === undefined) {
        reject(new Error(payload.message || '图片上传失败'))
        return
      }
      onProgress?.(100)
      resolve(payload.data)
    }

    const body = new FormData()
    body.set(field, file)
    onProgress?.(0)
    xhr.send(body)
  })
}
