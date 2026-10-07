import type { ToiletWithDistance } from '../types'
import { formatDistance } from '../lib/geo'
import { toiletBadges, toiletSubtitle, toiletTitle } from '../lib/toilets'
import { googleWalkingUrl } from '../lib/navigate'

interface Props {
  toilet: ToiletWithDistance
  origin: { lat: number; lon: number } | null
  selected: boolean
  onSelect: () => void
}

export function ToiletListItem({ toilet, origin, selected, onSelect }: Props) {
  const badges = toiletBadges(toilet).slice(0, 3)
  const subtitle = toiletSubtitle(toilet)

  const isPlace = toilet.kind === 'place'

  return (
    <div
      className={`toilet-item ${selected ? 'toilet-item--selected' : ''} ${
        isPlace ? 'toilet-item--place' : ''
      }`}
    >
      <button type="button" className="toilet-item__body" onClick={onSelect}>
        <span className="toilet-item__title">{toiletTitle(toilet)}</span>
        {subtitle && <span className="toilet-item__sub">{subtitle}</span>}
        {badges.length > 0 && (
          <span className="toilet-item__badges">
            {badges.map((badge) => (
              <span key={badge.key} className="badge">
                {badge.label}
              </span>
            ))}
          </span>
        )}
      </button>

      <div className="toilet-item__right">
        <span className="toilet-item__distance">{formatDistance(toilet.distance)}</span>
        <span className="toilet-item__walk">{toilet.walkMinutes} 分钟</span>
        <a
          className="toilet-item__go"
          href={googleWalkingUrl(toilet, origin)}
          target="_blank"
          rel="noreferrer"
          aria-label={`导航到 ${toiletTitle(toilet)}`}
          onClick={(event) => event.stopPropagation()}
        >
          导航
        </a>
      </div>
    </div>
  )
}
