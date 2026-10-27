import { Plus, Save, Send, Archive, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { commerceApi, money, type Offer, type OfferCatalog, type OfferPolicy } from '../../app/commerceApi'
import { Button } from '../ui/Button'
import { IconButton } from '../ui/Controls'
import { AsyncState } from '../ui/DataDisplay'
import { DialogShell } from '../ui/DialogShell'
import { commerceInput } from './CommerceOrders'
import { cancellationPolicyText } from '../../app/commercePolicy'

export function CommerceOffers({ token }: { token: string }) {
  const [catalog, setCatalog] = useState<OfferCatalog | null>(null)
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const [editor, setEditor] = useState<Offer | 'new' | null>(null)
  const load = useCallback(async () => { setError(''); try { setCatalog(await commerceApi.offers(token)) } catch (error) { setError(error instanceof Error ? error.message : '商品加载失败') } }, [token])
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer) }, [load])
  async function transition(offer: Offer) {
    const publish = offer.status === 'draft'
    const reason = window.prompt(`${publish ? '发布' : '下架'}「${offer.name}」的原因`)
    if (!reason) return
    setBusy(true); setError('')
    try { await commerceApi.publishOffer(token, offer, publish ? 'active' : 'inactive', reason); await load() }
    catch (error) { setError(error instanceof Error ? error.message : '操作失败') } finally { setBusy(false) }
  }
  return <div className="p-4"><div className="mb-4 flex justify-end"><Button icon={<Plus />} disabled={!catalog} onClick={() => setEditor('new')}>新建课程商品</Button></div>
    {error && catalog ? <p role="alert" className="mb-3 text-sm text-[var(--destructive)]">{error}</p> : null}
    <AsyncState loading={!catalog && !error} error={catalog ? '' : error} loadingLabel="正在加载课程商品..." onRetry={() => void load()}>
      <div className="divide-y divide-[var(--border)]">{catalog?.offers.map((offer) => <div key={offer.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
        <div className="min-w-0"><h3 className="font-semibold">{offer.name}</h3><p className="my-1 text-sm">{money((catalog.prices.find((price) => price.id === offer.priceVersionId)?.amount || 0) * 100)} · {({ draft: '草稿', active: '在售', inactive: '已下架' })[offer.status]}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{cancellationPolicyText(offer.policy)}</p>
        </div><div className="flex flex-wrap gap-2"><Button variant="secondary" icon={<Plus />} disabled={busy} onClick={() => setEditor(offer)}>另建新版本</Button>{offer.status !== 'inactive' ? <Button icon={offer.status === 'draft' ? <Send /> : <Archive />} disabled={busy} onClick={() => void transition(offer)}>{offer.status === 'draft' ? '发布' : '下架'}</Button> : null}</div>
      </div>)}{catalog?.offers.length === 0 ? <p className="py-8 text-center text-sm">暂无课程商品</p> : null}</div>
    </AsyncState>
    {editor && catalog ? <OfferEditor token={token} catalog={catalog} source={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} onSaved={() => { setEditor(null); void load() }} /> : null}
  </div>
}
function OfferEditor({ token, catalog, source, onClose, onSaved }: { token: string; catalog: OfferCatalog; source?: Offer; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(source?.name || '')
  const [packageId, setPackageId] = useState(source?.packageId || '')
  const [priceVersionId, setPrice] = useState(source?.priceVersionId || '')
  const [tiers, setTiers] = useState(source?.policy.cancellationTiers || [{ beforeMinutes: 1440, feeBps: 0 }, { beforeMinutes: 0, feeBps: 10000 }])
  const [busy, setBusy] = useState(false); const [error, setError] = useState('')
  const key = useRef(crypto.randomUUID())
  async function save() {
    setBusy(true); setError('')
    const policy: OfferPolicy = { version: (source?.policy.version || 0) + 1, packageRefund: 'unused_paid_value', reservationRefund: 'cash', cancellationTiers: tiers }
    try { await commerceApi.saveOffer(token, { key: key.current, name, packageId, priceVersionId, policy }); onSaved() }
    catch (error) { setError(error instanceof Error ? error.message : '保存失败') } finally { setBusy(false) }
  }
  return <DialogShell title="新建课程商品" onRequestClose={onClose} dismissible={!busy} size="wide"><form className="space-y-4 p-5" onSubmit={(event) => { event.preventDefault(); void save() }}>
    {error ? <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p> : null}
    <label className="grid gap-1 text-sm">商品名称<input required minLength={2} maxLength={100} className={commerceInput} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="grid gap-1 text-sm">课程课包<select required className={commerceInput} value={packageId} onChange={(event) => { setPackageId(event.target.value); setPrice('') }}><option value="">请选择课包</option>{catalog.packages.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    <label className="grid gap-1 text-sm">售价<select required className={commerceInput} value={priceVersionId} onChange={(event) => setPrice(event.target.value)}><option value="">请选择价格版本</option>{catalog.prices.filter((row) => row.packageId === packageId).map((row) => <option key={row.id} value={row.id}>{money(row.amount * 100)} · 第{row.version}版</option>)}</select></label>
    <fieldset className="space-y-3"><legend className="mb-2 font-medium">取消预约扣费规则</legend>{tiers.map((tier, index) => <div key={index} className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-xs">距开课至少（分钟）<input required type="number" min="0" step="1" className={`${commerceInput} w-full`} value={tier.beforeMinutes} onChange={(event) => setTiers(tiers.map((row, i) => i === index ? { ...row, beforeMinutes: Number(event.target.value) } : row))} /></label>
      <label className="grid min-w-0 flex-1 gap-1 text-xs">扣费比例（%）<input required type="number" min="0" max="100" step="0.01" className={`${commerceInput} w-full`} value={tier.feeBps / 100} onChange={(event) => setTiers(tiers.map((row, i) => i === index ? { ...row, feeBps: Math.round(Number(event.target.value) * 100) } : row))} /></label>
      <IconButton label={`删除第${index + 1}档规则`} icon={<Trash2 />} disabled={tiers.length <= 1} onClick={() => setTiers(tiers.filter((_, i) => i !== index))} />
    </div>)}<Button type="button" variant="secondary" icon={<Plus />} onClick={() => setTiers([...tiers.slice(0, -1), { beforeMinutes: 60, feeBps: 5000 }, ...tiers.slice(-1)])}>增加时间点</Button></fieldset>
    <p className="text-sm">取消预约将扣减对应课时，并按该课时实付金额原路退款。开课后扣费100%；机构取消不扣费。未预约的剩余课时按实付分摊金额退还。</p>
    <div className="flex justify-end"><Button type="submit" icon={<Save />} disabled={busy}>保存草稿</Button></div>
  </form></DialogShell>
}
