import type { ToiletWithDistance } from '../types'
import { formatCoordinate, formatDistance } from '../lib/geo'
import {
  formatAddress,
  isProbablyOpenNow,
  toiletBadges,
  toiletSubtitle,
  toiletTitle,
} from '../lib/toilets'
import {
  appleMapsUrl,
  canShare,
  citymapperUrl,
  googlePlaceUrl,
  googleWalkingUrl,
  isIOS,
  osmUrl,
} from '../lib/navigate'

interface Props {
  toilet: ToiletWithDistance
  origin: { lat: number; lon: number } | null
  onBack: () => void
  onShowOnMap: () => void
  onShare: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail__row">
      <span className="detail__row-label">{label}</span>
      <span className="detail__row-value">{value}</span>
    </div>
  )
}

export function ToiletDetail({
  toilet,
  origin,
  onBack,
  onShowOnMap,
  onShare,
}: Props) {
  const openNow = isProbablyOpenNow(toilet)
  const badges = toiletBadges(toilet)
  const subtitle = toiletSubtitle(toilet)
  const isOsm = toilet.source !== 'google'
  const isPlace = toilet.kind === 'place'

  const mapLinks = isIOS()
    ? [
        { label: 'Apple 地图', href: appleMapsUrl(toilet) },
        { label: 'Citymapper', href: citymapperUrl(toilet, origin) },
        { label: 'Google 地图', href: googlePlaceUrl(toilet) },
      ]
    : [
        { label: 'Google 地图', href: googlePlaceUrl(toilet) },
        { label: 'Citymapper', href: citymapperUrl(toilet, origin) },
        { label: 'Apple 地图', href: appleMapsUrl(toilet) },
      ]

  return (
    <div className="detail">
      <div className="detail__top">
        <button type="button" className="detail__back" onClick={onBack}>
          ← 返回列表
        </button>
        <button type="button" className="detail__share" onClick={onShare}>
          分享
        </button>
      </div>

      <h2 className="detail__title">{toiletTitle(toilet)}</h2>
      {subtitle && <p className="detail__sub">{subtitle}</p>}

      <div className="detail__stats">
        <div className="detail__stat">
          <span className="detail__stat-value">{formatDistance(toilet.distance)}</span>
          <span className="detail__stat-label">直线距离</span>
        </div>
        <div className="detail__stat">
          <span className="detail__stat-value">{toilet.walkMinutes} 分钟</span>
          <span className="detail__stat-label">预计步行</span>
        </div>
        <div className="detail__stat">
          <span className="detail__stat-value">
            {isPlace
              ? '推断'
              : openNow === true
                ? '开放中'
                : openNow === false
                  ? '可能已关'
                  : '未知'}
          </span>
          <span className="detail__stat-label">
            {isPlace ? '非 OSM 实测' : (toilet.openingHours ?? '无营业时间')}
          </span>
        </div>
      </div>

      {isPlace && (
        <p className="detail__notice">
          这里没有 OSM 实测的厕所点位。{toilet.categoryLabel ?? '这类场所'}
          通常设有公共厕所，多数在楼层角落、电梯厅或停车场附近，进店后跟着「Toilet /
          洗手间」指示牌走即可。
        </p>
      )}

      {badges.length > 0 && (
        <div className="detail__badges">
          {badges.map((badge) => (
            <span key={badge.key} className="badge badge--soft">
              {badge.label}
            </span>
          ))}
        </div>
      )}

      <div className="detail__actions">
        <a
          className="btn btn--primary"
          href={googleWalkingUrl(toilet, origin)}
          target="_blank"
          rel="noreferrer"
        >
          步行导航
        </a>
        <button type="button" className="btn btn--outline" onClick={onShowOnMap}>
          在地图上看
        </button>
        {canShare() && (
          <button type="button" className="btn btn--outline" onClick={onShare}>
            分享位置
          </button>
        )}
      </div>

      <div className="detail__rows">
        {toilet.address && <Row label="地址" value={formatAddress(toilet.address)} />}
        {toilet.level && <Row label="楼层" value={toilet.level} />}
        {toilet.operator && <Row label="运营方" value={toilet.operator} />}
        {toilet.access === 'customers' && <Row label="使用限制" value="顾客专用" />}
        {toilet.indoor && <Row label="位置类型" value="室内" />}
        <Row label="坐标" value={formatCoordinate(toilet.lat, toilet.lon)} />
        {toilet.description && <Row label="备注" value={toilet.description} />}
      </div>

      <div className="detail__links">
        {mapLinks.map((link) => (
          <a key={link.label} href={link.href} target="_blank" rel="noreferrer">
            {link.label}
          </a>
        ))}
        {isOsm && (
          <a href={osmUrl(toilet)} target="_blank" rel="noreferrer">
            在 OSM 查看/编辑
          </a>
        )}
      </div>

      <p className="detail__note">
        距离为直线距离，实际步行距离会更长一些；营业时间来自 OpenStreetMap
        志愿者数据，可能不是最新的。
      </p>

      <span className="detail__source">
        {isOsm ? '数据来源：OpenStreetMap（ODbL）' : '数据来源：Google Places'}
      </span>
    </div>
  )
}
