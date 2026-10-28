import type { FieldSpec } from '../components/RecordForm'

// timeoutFields are the per-API and per-service upstream timeouts.
export const timeoutFields: FieldSpec[] = [
  { name: 'headerTimeoutMs', label: '首字节超时 ms', kind: 'number', hint: '0 使用默认值（API 为 0 时用服务的设置）' },
  { name: 'timeoutMs', label: '整体超时 ms', kind: 'number', hint: '0 使用默认值；流式接口按需设置' },
  { name: 'idleTimeoutMs', label: '空闲超时 ms', kind: 'number' },
]
