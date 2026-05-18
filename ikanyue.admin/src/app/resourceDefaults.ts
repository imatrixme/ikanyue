import type { OpsResource } from './types'

export function defaultResourcePayload(resource: OpsResource, now = new Date()): Record<string, unknown> {
  const suffix = now.toISOString().slice(5, 16).replace('T', ' ')
  switch (resource) {
    case 'teachers':
      return { realName: `新教师 ${suffix}`, cellphone: '13800000000', verified: false, blocked: false, isAdmin: false }
    case 'activities':
      return { title: `新活动 ${suffix}`, type: 'open-class', status: 'draft', location: '待定' }
    case 'audioMaterials':
      return { title: `新音频 ${suffix}`, author: '待定', status: 'draft', difficulty: 'L1' }
    case 'videoMaterials':
      return { title: `新视频 ${suffix}`, author: '待定', status: 'draft', resolution: '1080p' }
    case 'operationSlots':
      return { channel: 'wechat-mini', placement: 'home-banner', title: `新运营位 ${suffix}`, status: 'draft', targetType: 'none', sortOrder: 100 }
    default:
      return { realName: `新学员 ${suffix}`, nickName: '新学员', cellphone: '13900000000', blocked: false }
  }
}
