/**
 * 处理积分浮层定位和点击外部关闭。
 * 参考 dingminhua/dsh-connect-trae 的 client/popover.ts，遵循 MIT，Copyright (c) 2026 LaoDing。
 * 根据视口决定上下放置和边界收缩；滚动、窗口大小和面板尺寸变化时重新测量。
 * pointerdown 位于触发器和面板之外时关闭浮层。
 * 保留本地 DOM 实现，便于 Node 测试，不引入 primitives 的 CSS 及其他 DSH 依赖。
 * Trae 2.12.0/2.13.0 的客户端加载问题来自 react-dom 被打入 bundle：
 * 其开发构建引用 process.env.NODE_ENV，在浏览器模块加载阶段报错。
 * 问题不由 primitives 导入导致。外置依赖配置见 tsdown.config.ts 的 CLIENT_EXTERNALS，
 * 回归验证见 tests/client-runtime-imports.spec.ts。
 */
import { useEffect, useLayoutEffect, useState } from 'react'
import type { CSSProperties, RefObject } from 'react'

/** Inputs for {@link useAnchoredPosition}. */
export interface AnchoredPositionOptions {
  /** Whether the floating element is mounted and should track its anchor. */
  open: boolean
  /** The element the panel is placed from. */
  anchorRef: RefObject<HTMLElement | null>
  /** The floating element, measured so the clamp uses real dimensions. */
  panelRef: RefObject<HTMLElement | null>
  /** Which anchor edge the panel hangs from: above (`top`) or below (`bottom`). */
  side?: 'top' | 'bottom'
  /** Which anchor edge the panel lines up with: left (`start`) or right (`end`). */
  align?: 'start' | 'end'
  /** Distance kept between the anchor edge named by `side` and the panel. */
  gap: number
  /** Distance kept between the panel and each viewport edge. */
  margin: number
}

/**
 * Clearance to keep from the top of the viewport.
 *
 * The shell reserves a strip at the top of the frame
 * (`--dsh-frame-top-clearance`) for the window chrome, so a panel clamped to
 * `margin` alone can still land under it. Absent variable or no `data-fullscreen`
 * distinction is handled the same way the shell does: fall back to `min`.
 */
export function overlayTopMargin(min: number): number {
  if (typeof document === 'undefined') return min
  const root = document.documentElement
  const clearance = Number.parseFloat(getComputedStyle(root).getPropertyValue('--dsh-frame-top-clearance'))
  if (Number.isNaN(clearance)) return min
  return Math.max(min, (root.hasAttribute('data-fullscreen') ? 0 : clearance) + 20)
}

/** Keep a `position: fixed` floating element anchored to a trigger. */
export function useAnchoredPosition(options: AnchoredPositionOptions): CSSProperties | null {
  const { open, anchorRef, panelRef, side = 'bottom', align = 'start', gap, margin } = options
  const [position, setPosition] = useState<CSSProperties | null>(null)

  // Layout effect: the first measurement happens in the commit that opens the
  // panel, so the clamp uses real dimensions before anything paints and the
  // panel never flashes at the wrong spot.
  useLayoutEffect(() => {
    if (!open) {
      setPosition(null)
      return undefined
    }
    const place = (): void => {
      const rect = anchorRef.current?.getBoundingClientRect()
      if (rect === undefined) return
      const panel = panelRef.current
      const width = panel?.offsetWidth ?? 0
      const height = panel?.offsetHeight ?? 0
      let left = align === 'end' ? rect.right - width : rect.left
      let top = side === 'top' ? rect.top - gap - height : rect.bottom + gap
      // Clamp only along an axis whose size is known: a zero measurement would
      // otherwise pin the panel to the margin.
      if (width > 0) left = Math.min(Math.max(left, margin), window.innerWidth - width - margin)
      if (height > 0) top = Math.min(Math.max(top, overlayTopMargin(margin)), window.innerHeight - height - margin)
      setPosition({ left, top })
    }
    place()
    // Capture phase: an ancestor scroller moves the anchor too, and a
    // bubble-phase listener on window never sees it.
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    // The panel's own height changes without either event (a status line
    // appearing), and a stale clamp would let it cross the margin it must
    // respect. Guarded because `ResizeObserver` is absent under jsdom.
    const panel = panelRef.current
    let observer: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && panel !== null) {
      observer = new ResizeObserver(place)
      observer.observe(panel)
    }
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, anchorRef, panelRef, side, align, gap, margin])

  return position
}

/**
 * Close an open popover when a pointerdown lands outside it.
 *
 * `portal` counts as inside: the panel is portaled to `document.body`, so it is
 * not a descendant of `root` and a click on the panel itself would otherwise
 * read as "outside" and dismiss the popover the user is trying to use.
 */
export function useDismissOnOutsidePointer(
  root: RefObject<HTMLElement | null>,
  open: boolean,
  setOpen: (open: boolean) => void,
  portal?: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return undefined
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node
        && root.current?.contains(event.target) !== true
        && portal?.current?.contains(event.target) !== true) {
        setOpen(false)
      }
    }
    // `pointerdown` rather than `click`: dismissing on press-down is what makes
    // the popover feel like the shell's own, and it fires before a click on
    // something underneath could be acted on.
    document.addEventListener('pointerdown', closeOutside)
    return () => { document.removeEventListener('pointerdown', closeOutside) }
  }, [root, open, setOpen, portal])
}
