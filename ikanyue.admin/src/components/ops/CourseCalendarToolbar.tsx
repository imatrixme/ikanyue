import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'

import type { CourseCalendarMode } from '../../app/calendarScheduler'
import type { CourseCalendarResponse, CourseCalendarView } from '../../app/calendarTypes'
import { Button } from '../ui/Button'
import { IconButton, SegmentedControl } from '../ui/Controls'
import { Field } from '../ui/Input'
import { Select } from '../ui/Select'
import { FilterToolbar } from '../layout/Workspace'

interface Props {
  dateLabel: string
  facets?: CourseCalendarResponse['facets']
  filters: Record<string, string>
  mode: CourseCalendarMode
  onFilter: (name: string, value: string) => void
  onMode: (mode: CourseCalendarMode) => void
  onReset: () => void
  onShift: (direction: -1 | 1) => void
  onToday: () => void
  onView: (view: CourseCalendarView) => void
  teacherOnly?: boolean
  view: CourseCalendarView
}

export function CourseCalendarToolbar(props: Props) {
  const hasFilters = Object.values(props.filters).some(Boolean)
  return (
    <>
      <section className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2">
          <IconButton icon={<ChevronLeft className="h-4 w-4" />} label="上一时间段" onClick={() => props.onShift(-1)} type="button" />
          <Button onClick={props.onToday} type="button" variant="secondary">今天</Button>
          <IconButton icon={<ChevronRight className="h-4 w-4" />} label="下一时间段" onClick={() => props.onShift(1)} type="button" />
          <strong className="ml-1 text-sm sm:text-base">{props.dateLabel}</strong>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!props.teacherOnly ? <SegmentedControl<CourseCalendarMode> label="课表模式" onChange={props.onMode} options={[{ label: '查看', value: 'browse' }, { label: '排课', value: 'schedule' }]} value={props.mode} /> : null}
          <SegmentedControl<CourseCalendarView> label="课表视图" onChange={props.onView} options={props.mode === 'schedule' || props.teacherOnly ? [{ label: '日', value: 'day' }, { label: '周', value: 'week' }] : [{ label: '日', value: 'day' }, { label: '周', value: 'week' }, { label: '月', value: 'month' }, { label: '列表', value: 'list' }]} value={props.view} />
        </div>
      </section>
      <FilterToolbar className="sm:grid-cols-2 xl:grid-cols-[repeat(6,minmax(0,1fr))_auto]">
        {!props.teacherOnly ? <CalendarSelect label="教师" name="teacherId" options={props.facets?.teachers || []} {...props} /> : null}
        <CalendarSelect label="学员" name="studentId" options={props.facets?.students || []} {...props} />
        <CalendarSelect label="班级" name="classId" options={props.facets?.classes || []} {...props} />
        <CalendarSelect label="课程" name="courseSpecId" options={props.facets?.courses || []} {...props} />
        <Field label="课堂状态">
          <Select allowEmpty aria-label="课堂状态" onChange={(event) => props.onFilter('status', event.target.value)} options={statusOptions} placeholder="全部状态" value={props.filters.status} />
        </Field>
        <Field label="排课来源">
          <Select allowEmpty aria-label="排课来源" onChange={(event) => props.onFilter('originType', event.target.value)} options={originOptions} placeholder="全部来源" value={props.filters.originType} />
        </Field>
        <Button className="self-end" disabled={!hasFilters} icon={<RotateCcw className="h-4 w-4" />} onClick={props.onReset} type="button" variant="secondary">重置</Button>
      </FilterToolbar>
    </>
  )
}

function CalendarSelect({ filters, label, name, onFilter, options }: Props & { label: string; name: string; options: Array<{ id: string; name: string }> }) {
  return <Field label={label}><Select allowEmpty aria-label={label} onChange={(event) => onFilter(name, event.target.value)} options={options.map((item) => ({ label: item.name, value: item.id }))} placeholder={`全部${label}`} value={filters[name]} /></Field>
}

const statusOptions = [
  { label: '待上课', value: 'scheduled' }, { label: '名单已锁定', value: 'enrollment_closed' },
  { label: '上课中', value: 'in_progress' }, { label: '已完成', value: 'completed,settled' },
  { label: '已取消', value: 'cancelled' }, { label: '教务处理中', value: 'correction_pending' },
]

const originOptions = [
  { label: '班级排课', value: 'class' }, { label: '预约成课', value: 'appointment' },
  { label: '教务排课', value: 'admin' },
]
