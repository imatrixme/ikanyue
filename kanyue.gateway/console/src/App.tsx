import { useSyncExternalStore, type ComponentType } from 'react'
import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom'

import { Button } from './components/ui/Button'
import { cn } from './components/ui/utils'
import { session } from './lib/api'
import { ConsumersPage, OperationsPage, PluginsPage, RoutesPage, SecretsPage, ServicesPage, SitesPage } from './pages/ConfigPages'
import { LoginPage } from './pages/LoginPage'
import { AlertChannelsPage, AlertRulesPage, AuditPage, ExportersPage, LogsPage, OverviewPage, ReleasePage, TrafficPage } from './pages/OpsPages'

interface Page {
  path: string
  title: string
  Component: ComponentType
}

const sections: { title: string; pages: Page[] }[] = [
  { title: '运行', pages: [{ path: 'overview', title: '概览', Component: OverviewPage }, { path: 'traffic', title: '流量', Component: TrafficPage }, { path: 'logs', title: '日志', Component: LogsPage }] },
  {
    title: '配置',
    pages: [
      { path: 'services', title: '服务与实例', Component: ServicesPage },
      { path: 'operations', title: '接口', Component: OperationsPage },
      { path: 'sites', title: '站点', Component: SitesPage },
      { path: 'routes', title: '路由', Component: RoutesPage },
      { path: 'plugins', title: '插件', Component: PluginsPage },
      { path: 'consumers', title: '消费者', Component: ConsumersPage },
      { path: 'secrets', title: '密钥', Component: SecretsPage },
      { path: 'release', title: '发布', Component: ReleasePage },
    ],
  },
  {
    title: '告警与审计',
    pages: [
      { path: 'alert-rules', title: '告警规则', Component: AlertRulesPage },
      { path: 'alert-channels', title: '告警渠道', Component: AlertChannelsPage },
      { path: 'exporters', title: '日志导出', Component: ExportersPage },
      { path: 'audit', title: '审计', Component: AuditPage },
    ],
  },
]

function Shell() {
  return (
    <div className="grid min-h-screen md:grid-cols-[13rem_1fr]">
      <nav className="border-r border-[var(--border)] bg-[var(--sidebar)] px-3 py-4">
        <div className="mb-4 px-2 text-sm font-semibold">看乐网关</div>
        {sections.map((section) => (
          <div className="mb-4" key={section.title}>
            <div className="px-2 pb-1 text-xs text-[var(--muted-foreground)]">{section.title}</div>
            {section.pages.map((page) => (
              <NavLink
                className={({ isActive }) => cn('block rounded-md px-2 py-1.5 text-sm', isActive ? 'bg-[var(--sidebar-accent)] font-semibold' : 'hover:bg-[var(--accent)]')}
                key={page.path}
                to={`/${page.path}`}
              >
                {page.title}
              </NavLink>
            ))}
          </div>
        ))}
        <div className="mt-6 break-all px-2 text-xs text-[var(--muted-foreground)]">
          {session.email()}
          <Button className="mt-2 w-full" onClick={session.signOut}>退出</Button>
        </div>
      </nav>
      <main className="min-w-0 px-6 py-5">
        <Routes>
          {sections.flatMap((section) => section.pages).map(({ path, Component }) => <Route element={<Component />} key={path} path={`/${path}`} />)}
          <Route element={<Navigate replace to="/overview" />} path="*" />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  const token = useSyncExternalStore(session.subscribe, session.token)
  return (
    <BrowserRouter basename="/console">
      {token ? <Shell /> : <LoginPage />}
    </BrowserRouter>
  )
}
