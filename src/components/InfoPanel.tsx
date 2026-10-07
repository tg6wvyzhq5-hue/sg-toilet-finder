import type { Dataset } from '../types'

interface Props {
  dataset: Dataset | null
  liveActive: boolean
  totalCount: number
  liveLoading: boolean
  liveError: string | null
  googleEnabled: boolean
  googleStatus: string | null
  onRefreshLive: () => void
  onClose: () => void
}

export function InfoPanel({
  dataset,
  liveActive,
  totalCount,
  liveLoading,
  liveError,
  googleEnabled,
  googleStatus,
  onRefreshLive,
  onClose,
}: Props) {
  const generated = dataset
    ? new Date(dataset.generatedAt).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—'

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label="数据与说明">
      <div className="modal__backdrop" onClick={onClose} />
      <div className="modal__card">
        <div className="modal__head">
          <h2>数据与说明</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </div>

        <dl className="modal__list">
          <div>
            <dt>数据来源</dt>
            <dd>
              <a href={dataset?.sourceUrl ?? 'https://www.openstreetmap.org'} target="_blank" rel="noreferrer">
                OpenStreetMap（ODbL 许可）
              </a>
            </dd>
          </div>
          <div>
            <dt>数据快照时间</dt>
            <dd>{generated}</dd>
          </div>
          <div>
            <dt>当前点位数量</dt>
            <dd>
              {totalCount} 个{liveActive ? '（已在线更新）' : ''}
            </dd>
          </div>
          <div>
            <dt>定位隐私</dt>
            <dd>定位只在你的浏览器里参与计算，不会上传到任何服务器。</dd>
          </div>
        </dl>

        <button
          type="button"
          className="btn btn--outline btn--block"
          onClick={onRefreshLive}
          disabled={liveLoading}
        >
          {liveLoading ? '正在从 OSM 拉取最新数据…' : '从 OpenStreetMap 在线更新点位'}
        </button>
        {liveError && <p className="modal__error">{liveError}</p>}
        <p className="modal__hint">
          在线更新会直接请求 Overpass API，通常需要 5–30 秒；失败时继续使用内置数据。
        </p>

        <div className="modal__section">
          <h3>关于 Google Places</h3>
          {googleEnabled ? (
            <p className="modal__hint">
              {googleStatus ?? '已启用：会用 Places API 补充 OSM 未收录的厕所点位。'}
            </p>
          ) : (
            <p className="modal__hint">
              未配置 Google API Key。想要补充商场/酒店内部厕所，可在项目根目录创建{' '}
              <code>.env</code>，写入 <code>VITE_GOOGLE_MAPS_API_KEY=你的Key</code>{' '}
              后重新构建。导航按钮（Google 地图 / Apple 地图 / Citymapper）不需要 Key。
            </p>
          )}
        </div>

        <div className="modal__section">
          <h3>小提示</h3>
          <ul className="modal__tips">
            <li>点击地图任意位置，可以把那里设为「起点」，按距离重新排序。</li>
            <li>定位被拒绝时也能用：点地图选点即可。</li>
            <li>数据是志愿者众包的，如果发现厕所已关闭或信息有误，欢迎到 OSM 上顺手修正。</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
