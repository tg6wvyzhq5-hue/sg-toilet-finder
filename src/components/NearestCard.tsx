import type { ToiletWithDistance } from '../types'
import { formatDistance, formatWalkTime } from '../lib/geo'
import { toiletBadges, toiletSubtitle, toiletTitle } from '../lib/toilets'
import { googleWalkingUrl } from '../lib/navigate'

interface Props {
  toilet: ToiletWithDistance
  origin: { lat: number; lon: number } | null
  onDetail: () => void
}

/** 离你最近的那个厕所，做最显眼的推荐卡片 */
export function NearestCard({ toilet, origin, onDetail }: Props) {
  const badges = toiletBadges(toilet).slice(0, 3)
  const subtitle = toiletSubtitle(toilet)

  return (
    <div className="nearest">
      <div className="nearest__head">
        <span className="nearest__label">离你最近的厕所</span>
        <span className="nearest__walk">{formatWalkTime(toilet.walkMinutes)}</span>
      </div>

      <div className="nearest__main">
        <span className="nearest__distance">{formatDistance(toilet.distance)}</span>
        <div className="nearest__info">
          <span className="nearest__name">{toiletTitle(toilet)}</span>
          {subtitle && <span className="nearest__sub">{subtitle}</span>}
        </div>
      </div>

      {badges.length > 0 && (
        <div className="nearest__badges">
          {badges.map((badge) => (
            <span key={badge.key} className="badge badge--onprimary">
              {badge.label}
            </span>
          ))}
        </div>
      )}

      <div className="nearest__actions">
        <a
          className="btn btn--white"
          href={googleWalkingUrl(toilet, origin)}
          target="_blank"
          rel="noreferrer"
        >
          开始步行导航
        </a>
        <button type="button" className="btn btn--ghost-white" onClick={onDetail}>
          详情
        </button>
      </div>
    </div>
  )
}
