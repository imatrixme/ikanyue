import type { PetState } from '../game/types'

interface StatusPanelProps {
  pet: PetState
}

const stats = [
  { key: 'hunger', label: 'Hunger', color: '#4fb99f' },
  { key: 'health', label: 'Health', color: '#f06f5d' },
  { key: 'mood', label: 'Mood', color: '#72bde7' },
] as const

export function StatusPanel({ pet }: StatusPanelProps) {
  const growthPercent = Math.min(100, Math.round((pet.growth / 240) * 100))

  return (
    <aside className="status-panel panel" aria-label="Pet status">
      <p className="panel-title">Status</p>
      <div className="stat-list">
        {stats.map((stat) => (
          <StatRow
            color={stat.color}
            key={stat.key}
            label={stat.label}
            value={pet[stat.key]}
          />
        ))}
        <StatRow color="#f3b957" label="Growth" value={growthPercent} />
      </div>

      <section className="care-note">
        <h2>{pet.hunger < 28 || pet.health < 28 ? 'Needs care' : 'Steady'}</h2>
        <p>
          Feed your pet to raise hunger, mood, and growth. If time passes
          without food, hunger drops first, then health and mood weaken.
        </p>
      </section>
    </aside>
  )
}

interface StatRowProps {
  color: string
  label: string
  value: number
}

function StatRow({ color, label, value }: StatRowProps) {
  return (
    <div className="stat-row">
      <div className="stat-top">
        <span>{label}</span>
        <span className="stat-value">{Math.round(value)}%</span>
      </div>
      <div className="meter" role="meter" aria-label={label}>
        <span
          className="meter-fill"
          style={{
            width: `${Math.max(0, Math.min(100, Math.round(value)))}%`,
            background: color,
          }}
        />
      </div>
    </div>
  )
}
