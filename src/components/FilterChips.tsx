import type { FilterKey } from '../types'

export interface FilterOption {
  key: FilterKey
  label: string
}

export const FILTER_OPTIONS: FilterOption[] = [
  { key: 'wheelchair', label: '♿ 无障碍' },
  { key: 'changingTable', label: '👶 婴儿台' },
  { key: 'free', label: '免费' },
  { key: 'open24', label: '24 小时' },
]

interface Props {
  active: Set<FilterKey>
  counts: Record<FilterKey, number>
  onToggle: (key: FilterKey) => void
  /** 是否显示「通常有厕所」的商场/车站等备选场所 */
  placesEnabled: boolean
  placesCount: number
  onTogglePlaces: () => void
  /** 有筛选条件时备选场所会被隐藏，需要提示用户 */
  placesMuted?: boolean
}

export function FilterChips({
  active,
  counts,
  onToggle,
  placesEnabled,
  placesCount,
  onTogglePlaces,
  placesMuted,
}: Props) {
  return (
    <div className="chips" role="group" aria-label="筛选条件">
      {/* 数据层级开关放在最前面：它决定列表里要不要包含推断出来的备选场所 */}
      <button
        type="button"
        className={`chip chip--places ${
          placesEnabled && !placesMuted ? 'chip--places-on' : ''
        }`}
        aria-pressed={placesEnabled && !placesMuted}
        disabled={placesMuted || placesCount === 0}
        title={
          placesMuted
            ? '开启无障碍/婴儿台等筛选时不会显示推断的备选场所'
            : '显示商场、地铁站、小贩中心等通常设有厕所的场所'
        }
        onClick={onTogglePlaces}
      >
        🏬 商场/车站
        <span className="chip__count">{placesCount}</span>
      </button>

      <span className="chips__divider" aria-hidden="true" />

      {FILTER_OPTIONS.map((option) => {
        const isActive = active.has(option.key)
        const count = counts[option.key]
        return (
          <button
            key={option.key}
            type="button"
            className={`chip ${isActive ? 'chip--active' : ''}`}
            aria-pressed={isActive}
            disabled={count === 0 && !isActive}
            onClick={() => onToggle(option.key)}
          >
            {option.label}
            <span className="chip__count">{count}</span>
          </button>
        )
      })}
    </div>
  )
}
