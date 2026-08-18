import { Play, RefreshCw, ScanLine } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { OpsApi } from '../../app/api'
import type { CourseRecord } from '../../app/courseTypes'
import type { ShadowExpectation, ShadowResult } from '../../app/migrationTypes'
import { SectionHeader, SummaryBand, SummaryMetric } from '../layout/Workspace'
import { Badge } from '../ui/Badge'
import { Button } from '../ui/Button'
import { Checkbox, FormMessage, IconButton, Textarea } from '../ui/Controls'

export function ShadowRolloutPanel({ api, token }: { api: OpsApi; token: string }) {
  const [lessons, setLessons] = useState<CourseRecord[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [expectationText, setExpectationText] = useState('[]')
  const [confirmed, setConfirmed] = useState(false)
  const [result, setResult] = useState<ShadowResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const page = await api.listCourseResource(token, 'lessons', { page: 1, perPage: 100 })
      setLessons(page.items.filter((item) => ['completed', 'cancelled', 'correction_pending'].includes(String(item.status))))
    } catch (loadError) { setError(message(loadError, '加载影子课堂失败')) }
    finally { setLoading(false) }
  }, [api, token])
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer) }, [load])

  const expectations = useMemo(() => parseExpectations(expectationText), [expectationText])
  const ready = selected.length > 0 && expectations.value.length === selected.length && !expectations.error && confirmed

  async function createTemplate() {
    setLoading(true); setError(''); setResult(null); setConfirmed(false)
    try {
      const previews = await Promise.all(selected.map((sessionId) => api.previewSettlement(token, sessionId)))
      const template = previews.map((preview, index) => expectationFromPreview(selected[index], preview as ShadowPreview))
      setExpectationText(JSON.stringify(template, null, 2))
    } catch (templateError) { setError(message(templateError, '生成教务核对模板失败')) }
    finally { setLoading(false) }
  }

  async function run() {
    if (!ready) return
    setLoading(true); setError('')
    try { setResult(await api.runCourseCreditShadow(token, selected, expectations.value)) }
    catch (runError) { setError(message(runError, '影子运行失败')) }
    finally { setLoading(false) }
  }

  function toggle(id: string, checked: boolean) {
    setSelected((current) => checked ? [...current, id] : current.filter((item) => item !== id))
    setExpectationText('[]'); setConfirmed(false); setResult(null)
  }

  return <section className="grid gap-4 border-t border-[var(--border)] px-5 py-5"><SectionHeader actions={<IconButton disabled={loading} icon={<RefreshCw className="h-4 w-4" />} label="刷新影子课堂" onClick={() => void load()} type="button" />} description="使用正式资格与核销规则读取真实课堂，但不创建操作、事件或余额写入。" title="发布前影子运行" />
    <SummaryBand><SummaryMetric label="可选真实课堂" value={lessons.length} /><SummaryMetric label="已选择" value={selected.length} /><SummaryMetric label="差异" value={result?.differenceCount ?? '-'} /><SummaryMetric label="写入次数" value={result?.writeCount ?? 0} /></SummaryBand>
    <div className="grid gap-2">{lessons.map((lesson) => <Checkbox checked={selected.includes(lesson.id)} description={`${String(lesson.startAt || '')} · ${String(lesson.status || '')}`} key={lesson.id} label={`${String(lesson.title || lesson.code || lesson.id)} · ${lesson.id}`} onChange={(event) => toggle(lesson.id, event.target.checked)} />)}{!lessons.length && !loading ? <p className="text-sm text-[var(--muted-foreground)]">当前没有已结束且可用于影子核对的课堂。</p> : null}</div>
    <div className="flex flex-wrap gap-3"><Button disabled={loading || selected.length === 0} icon={<ScanLine className="h-4 w-4" />} onClick={() => void createTemplate()} type="button" variant="secondary">生成教务核对模板</Button></div>
    <Textarea aria-label="教务预期 JSON" className="min-h-48 font-mono text-xs" onChange={(event) => { setExpectationText(event.target.value); setConfirmed(false); setResult(null) }} value={expectationText} />
    {expectations.error ? <FormMessage tone="error">{expectations.error}</FormMessage> : null}
    <Checkbox checked={confirmed} description="已独立核对课堂名单、出勤动作、教师工作量和可核销状态。" label="教务预期已人工确认" onChange={(event) => setConfirmed(event.target.checked)} />
    {error ? <FormMessage tone="error">{error}</FormMessage> : null}
    {result ? <ShadowReport result={result} /> : null}
    <Button className="w-fit" disabled={loading || !ready} icon={<Play className="h-4 w-4" />} onClick={() => void run()} type="button">运行只读影子核对</Button>
  </section>
}

function ShadowReport({ result }: { result: ShadowResult }) {
  return <div className="grid gap-3 border-y border-[var(--border)] bg-[var(--card)] px-4 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{result.status === 'passed' ? '影子核对通过' : '影子核对存在差异'}</strong><Badge tone={result.status === 'passed' ? 'green' : 'red'}>{result.differenceCount} 个差异 · {result.writeCount} 次写入</Badge></div>{result.reports.flatMap((report) => report.differences.map((item, index) => <p className="text-sm text-[var(--destructive)]" key={`${report.sessionId}:${item.field}:${index}`}>{report.sessionId} · {item.field} · {item.code}</p>))}</div>
}

interface ShadowPreview { canSettle?: boolean; students?: Array<Record<string, unknown>>; teachers?: Array<Record<string, unknown>> }
function expectationFromPreview(sessionId: string, preview: ShadowPreview): ShadowExpectation {
  return {
    sessionId, canSettle: Boolean(preview.canSettle),
    students: (preview.students || []).map((item) => ({ sessionStudentId: String(item.sessionStudentId || ''), action: String(item.action || '') })),
    teachers: (preview.teachers || []).map((item) => ({ sessionTeacherId: String(item.sessionTeacherId || ''), action: String(item.action || ''), quantity: Number(item.quantity || 0) })),
  }
}
function parseExpectations(text: string): { error: string; value: ShadowExpectation[] } { try { const value = JSON.parse(text); return Array.isArray(value) ? { error: '', value } : { error: '教务预期必须是数组。', value: [] } } catch { return { error: '教务预期 JSON 格式无效。', value: [] } } }
function message(error: unknown, fallback: string) { return error instanceof Error ? error.message : fallback }
