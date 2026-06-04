import {
  Activity,
  ClipboardList,
  Database,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  UserCheck,
} from 'lucide-react'
import { useState } from 'react'

import type { OpsProfile } from '../../app/types'
import { Panel } from '../ui/Card'
import { PageHeader } from '../ui/PageHeader'
import { SettingLine, SettingsPanel } from '../ui/SettingsPanel'
import { Switch } from '../ui/Switch'

interface SystemSettingsViewProps {
  profile: OpsProfile
}

export function SystemSettingsView({ profile }: SystemSettingsViewProps) {
  const [settings, setSettings] = useState({
    registrationEnabled: false,
    requireActivation: true,
    usePublicAssetDomain: true,
    showHealth: true,
    auditVisible: true,
    forceInitialPasswordChange: true,
  })

  function updateSetting(key: keyof typeof settings, value: boolean) {
    setSettings((current) => ({ ...current, [key]: value }))
  }

  return (
    <Panel>
      <PageHeader
        eyebrow="System"
        title="系统设置"
        description="集中查看后台注册、账号策略、小程序、资源域名、权限、健康和审计配置。"
        icon={<ShieldCheck className="h-5 w-5" aria-hidden="true" />}
      />
      <div className="grid gap-4 p-5 xl:grid-cols-2">
        <SettingsPanel
          title="注册开关"
          description="控制教务端账号注册入口和注册后的激活策略。"
          icon={<UserCheck className="h-5 w-5" aria-hidden="true" />}
          status="需管理员激活"
          tone="amber"
        >
          <SettingSwitch label="允许教务注册" checked={settings.registrationEnabled} onCheckedChange={(value) => updateSetting('registrationEnabled', value)} hint="关闭时仅保留登录；开启后教师可提交注册申请。" />
          <SettingSwitch label="注册后必须激活" checked={settings.requireActivation} onCheckedChange={(value) => updateSetting('requireActivation', value)} hint="开启后新账号默认无任何权限，必须由管理员激活。" />
          <SettingLine label="审批位置" value="教师管理" hint="管理员在教师管理中审核、启停和分配管理员权限。" />
        </SettingsPanel>

        <SettingsPanel
          title="账号策略"
          description="默认管理员、强制改密和后台登录安全状态。"
          icon={<LockKeyhole className="h-5 w-5" aria-hidden="true" />}
          status={profile.passwordChangeRequired ? '需改密' : '正常'}
          tone={profile.passwordChangeRequired ? 'red' : 'green'}
        >
          <SettingLine label="当前身份" value={profile.isAdmin ? '管理员' : '教师'} />
          <SettingSwitch label="首次登录强制改密" checked={settings.forceInitialPasswordChange} onCheckedChange={(value) => updateSetting('forceInitialPasswordChange', value)} hint="默认管理员账号只能用于初始化，进入业务视图前必须改密。" />
          <SettingLine label="会话边界" value="/ops/* token" hint="浏览器只访问 Ops API，不直接访问 PocketBase。" />
        </SettingsPanel>

        <SettingsPanel
          title="小程序配置"
          description="微信小程序登录和业务 API 的运行配置状态。"
          icon={<Smartphone className="h-5 w-5" aria-hidden="true" />}
          status="脱敏显示"
          tone="blue"
        >
          <SettingLine label="APPID / SECRET" value="不在前端展示" muted hint="仅显示配置状态，原始密钥由服务端环境变量或部署配置管理。" />
          <SettingLine label="业务入口" value="mapi / xapi" hint="小程序可通过网关或 OpenResty 反代访问 Hono 后端。" />
          <SettingLine label="登录链路" value="jscode2session" hint="缺失密钥时后端返回明确配置错误。" />
        </SettingsPanel>

        <SettingsPanel
          title="资源域名"
          description="小程序素材和报告图片使用公开资源域名访问。"
          icon={<Database className="h-5 w-5" aria-hidden="true" />}
          status="PB 同步"
          tone="green"
        >
          <SettingLine label="文件存储" value="PocketBase 文件字段" hint="PB 负责对象同步，业务代码不直接操作 S3 bucket key。" />
          <SettingSwitch label="使用公开资源域名" checked={settings.usePublicAssetDomain} onCheckedChange={(value) => updateSetting('usePublicAssetDomain', value)} hint="开启后素材 URL 优先拼接 MinIO 公网域名，减少 PB 文件代理带宽占用。" />
          <SettingLine label="敏感信息" value="不展示桶密钥" muted hint="后台只呈现访问策略，不泄露对象存储凭据。" />
        </SettingsPanel>

        <SettingsPanel
          title="权限角色"
          description="管理后台的角色、可见模块和操作边界。"
          icon={<KeyRound className="h-5 w-5" aria-hidden="true" />}
          status="角色过滤"
          tone="blue"
        >
          <SettingLine label="管理员" value="全局教务与系统设置" />
          <SettingLine label="教师" value="仅访问授权学员、课程、报告" />
          <SettingLine label="导航过滤" value="服务端鉴权 + 前端隐藏" hint="隐藏不是权限边界，后端仍执行角色和归属校验。" />
        </SettingsPanel>

        <SettingsPanel
          title="运维健康"
          description="部署、服务状态和回滚验证入口。"
          icon={<Activity className="h-5 w-5" aria-hidden="true" />}
          status="旁路验证"
          tone="amber"
        >
          <SettingLine label="Admin" value="Vite SSR build" />
          <SettingLine label="Hono" value="/healthz + /ops/*" />
          <SettingSwitch label="显示健康状态" checked={settings.showHealth} onCheckedChange={(value) => updateSetting('showHealth', value)} hint="开启后设置页显示部署健康和旁路验证入口。" />
          <SettingLine label="PocketBase" value="schema apply + data backup" hint="上线前先备份，再部署旁路验证，最后切流。" />
        </SettingsPanel>

        <SettingsPanel
          title="审计可见性"
          description="登录、数据变更、越权拒绝和分享操作的追踪入口。"
          icon={<ClipboardList className="h-5 w-5" aria-hidden="true" />}
          status="管理员可见"
          tone="neutral"
        >
          <SettingSwitch label="显示审计入口" checked={settings.auditVisible} onCheckedChange={(value) => updateSetting('auditVisible', value)} hint="关闭只影响入口展示，不关闭服务端审计记录。" />
          <SettingLine label="记录范围" value="登录、创建、更新、发布、撤销、拒绝" />
          <SettingLine label="数据最小化" value="不在响应中泄露敏感字段" />
        </SettingsPanel>
      </div>
    </Panel>
  )
}

interface SettingSwitchProps {
  label: string
  checked: boolean
  hint: string
  onCheckedChange: (checked: boolean) => void
}

function SettingSwitch({ label, checked, hint, onCheckedChange }: SettingSwitchProps) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-[var(--border)] bg-[var(--muted)]/35 px-3 py-2">
      <div>
        <div className="text-xs font-medium text-[var(--foreground)]">{label}</div>
        <div className="mt-1 text-xs text-[var(--muted-foreground)]">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  )
}
