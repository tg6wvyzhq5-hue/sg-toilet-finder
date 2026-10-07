import { useCallback, useEffect, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

interface Props {
  /** 受控高度，取值 0~1，表示占视口高度的比例 */
  ratio: number
  onRatioChange: (ratio: number) => void
  snapPoints?: number[]
  children: ReactNode
}

/**
 * 移动端底部抽屉：拖动手柄可展开/收起，内容区独立滚动。
 * 用 pointer 事件实现，鼠标和触屏都能用。
 */
export function BottomSheet({
  ratio,
  onRatioChange,
  snapPoints = [0.2, 0.46, 0.88],
  children,
}: Props) {
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef({ startY: 0, startRatio: ratio, moved: false })
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === 'undefined' ? 800 : window.innerHeight,
  )

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])

  const clamp = (value: number) =>
    Math.min(snapPoints[snapPoints.length - 1], Math.max(snapPoints[0], value))

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      dragRef.current = { startY: event.clientY, startRatio: ratio, moved: false }
      setDragging(true)
    },
    [ratio],
  )

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return
      const delta = dragRef.current.startY - event.clientY
      if (Math.abs(delta) > 4) dragRef.current.moved = true
      onRatioChange(clamp(dragRef.current.startRatio + delta / viewportHeight))
    },
    [dragging, onRatioChange, viewportHeight],
  )

  const handlePointerUp = useCallback(() => {
    if (!dragging) return
    setDragging(false)
    const { moved, startRatio } = dragRef.current
    if (!moved) {
      // 轻点手柄：在半展开和全屏之间切换
      const target =
        startRatio > snapPoints[1] + 0.05 ? snapPoints[1] : snapPoints[snapPoints.length - 1]
      onRatioChange(target)
      return
    }
    // 吸附到最近的档位
    const nearest = snapPoints.reduce((best, point) =>
      Math.abs(point - ratio) < Math.abs(best - ratio) ? point : best,
    )
    onRatioChange(nearest)
  }, [dragging, onRatioChange, ratio, snapPoints])

  return (
    <section
      className={`sheet ${dragging ? 'sheet--dragging' : ''}`}
      style={{ height: `${Math.round(ratio * viewportHeight)}px` }}
    >
      <div
        className="sheet__handle-area"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        role="separator"
        aria-label="拖动调整面板高度"
      >
        <span className="sheet__handle" />
      </div>
      <div className={`sheet__content ${dragging ? 'sheet__content--locked' : ''}`}>
        {children}
      </div>
    </section>
  )
}
