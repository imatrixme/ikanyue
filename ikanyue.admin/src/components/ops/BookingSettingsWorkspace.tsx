import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import type { OpsApi } from '../../app/api'
import type { BookingReferenceData } from '../../app/bookingTypes'
import { PageHeader, WorkspacePanel } from '../layout/Workspace'
import { Tabs } from '../ui/DataDisplay'
import { BookingConfigurationViews } from './BookingConfigurationViews'
import { BookingConflictViews } from './BookingConflictViews'

type SettingsTab = 'policies' | 'conflicts'
const emptyReferences: BookingReferenceData = { teachers: [], courses: [], creditTypes: [], policies: [] }

// Rarely changed booking rules, kept out of the everyday 预约 workspace.
export function BookingSettingsWorkspace({ api, token }: { api: OpsApi; token: string }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [references, setReferences] = useState<BookingReferenceData>(emptyReferences)
  const [error, setError] = useState('')
  const tab: SettingsTab = searchParams.get('tab') === 'conflicts' ? 'conflicts' : 'policies'

  const loadReferences = useCallback(async () => {
    try { setReferences(await api.getBookingReferenceData(token)) }
    catch (loadError) { setError(loadError instanceof Error ? loadError.message : '加载课程与教师失败') }
  }, [api, token])

  useEffect(() => { const timer = window.setTimeout(() => void loadReferences(), 0); return () => window.clearTimeout(timer) }, [loadReferences])

  function setTab(value: string) {
    const next = new URLSearchParams(searchParams)
    if (value === 'conflicts') next.set('tab', value); else next.delete('tab')
    setSearchParams(next)
  }

  return (
    <WorkspacePanel>
      <PageHeader title="预约规则" />
      <div className="px-4 sm:px-5">
        <Tabs label="预约规则分区" onChange={setTab} options={[{ label: '预约策略', value: 'policies' }, { label: '冲突与迁移', value: 'conflicts' }]} value={tab} />
      </div>
      {error ? <p className="border-b border-[var(--border)] bg-[var(--danger-soft)] px-4 py-3 text-sm text-[var(--destructive)]">{error}</p> : null}
      {tab === 'policies' ? <BookingConfigurationViews api={api} referenceData={references} sections={['policies']} token={token} /> : null}
      {tab === 'conflicts' ? <BookingConflictViews api={api} referenceData={references} token={token} /> : null}
    </WorkspacePanel>
  )
}
