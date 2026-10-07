import type { PlaceResult, Toilet, ToiletWithDistance } from '../types'
import { formatDistance } from '../lib/geo'
import { toiletTitle } from '../lib/toilets'

/** 让搜索结果一眼看出这条是实测厕所、场所内厕所，还是推断的备选场所 */
function tierHint(toilet: Toilet): string {
  if (toilet.kind === 'place') {
    return `🏬 ${toilet.categoryLabel ?? '场所'}（通常有厕所）`
  }
  if (toilet.kind === 'inside') {
    return `🏬 ${toilet.categoryLabel ? `${toilet.categoryLabel}内` : '场所内'}厕所`
  }
  return ''
}

interface Props {
  value: string
  onChange: (value: string) => void
  toiletResults: ToiletWithDistance[]
  placeResults: PlaceResult[]
  placeLoading: boolean
  placeError: string | null
  onSelectToilet: (id: string) => void
  onSelectPlace: (place: PlaceResult) => void
}

export function SearchBar({
  value,
  onChange,
  toiletResults,
  placeResults,
  placeLoading,
  placeError,
  onSelectToilet,
  onSelectPlace,
}: Props) {
  const showPanel =
    value.trim().length > 0 &&
    (toiletResults.length > 0 ||
      placeResults.length > 0 ||
      placeLoading ||
      placeError !== null)

  return (
    <div className="search">
      <div className="search__field">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path
            d="M11 4a7 7 0 1 0 4.2 12.6l4.1 4.1 1.4-1.4-4.1-4.1A7 7 0 0 0 11 4Zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10Z"
            fill="currentColor"
          />
        </svg>
        <input
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="搜索厕所、商场、地铁站或地点"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label="搜索厕所或地点"
        />
        {value && (
          <button
            type="button"
            className="search__clear"
            aria-label="清空搜索"
            onClick={() => onChange('')}
          >
            ✕
          </button>
        )}
      </div>

      {showPanel && (
        <div className="search__panel">
          {toiletResults.length > 0 && (
            <>
              <div className="search__group">厕所（{toiletResults.length}）</div>
              {toiletResults.slice(0, 6).map((toilet) => (
                <button
                  key={toilet.id}
                  type="button"
                  className="search__item"
                  onClick={() => onSelectToilet(toilet.id)}
                >
                  <span className="search__item-name">{toiletTitle(toilet)}</span>
                  <span className="search__item-meta">
                    {[
                      tierHint(toilet),
                      formatDistance(toilet.distance),
                      `${toilet.walkMinutes} 分钟`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </button>
              ))}
            </>
          )}

          {placeResults.length > 0 && (
            <>
              <div className="search__group">地点（把地图移到这里）</div>
              {placeResults.map((place) => (
                <button
                  key={place.id}
                  type="button"
                  className="search__item"
                  onClick={() => onSelectPlace(place)}
                >
                  <span className="search__item-name">{place.name}</span>
                  <span className="search__item-meta">{place.detail}</span>
                </button>
              ))}
            </>
          )}

          {placeLoading && <div className="search__hint">正在搜索地点…</div>}
          {!placeLoading && placeError && (
            <div className="search__hint search__hint--error">{placeError}</div>
          )}
          {!placeLoading &&
            !placeError &&
            toiletResults.length === 0 &&
            placeResults.length === 0 && (
              <div className="search__hint">没有找到匹配的厕所或地点</div>
            )}
        </div>
      )}
    </div>
  )
}
