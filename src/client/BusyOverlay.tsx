/**
 * The shared busy veil: one overlay for every account operation whose result
 * only lands on screen after the list re-read.
 *
 * 参考：workbuddy2api-panel 的「添加账号」弹窗 —— 操作期间用一层蒙版把界面
 *   定住并说明正在做什么，而不是让用户对着没有变化的表格猜。本实现把该形态
 *   抽成可复用组件，供删除、导入、扫码添加三处共用同一套视觉与处理规则。
 * 遮罩持续到列表刷新完成，避免服务端已修改数据、页面仍显示旧列表时
 * 提前解除操作提示。显示文字与超时由调用方控制，本组件负责统一展示。
 *
 * @module dsh-connect-workbuddy/client/BusyOverlay
 */

import { createElement as h } from 'react'
import type { ReactElement } from 'react'

/** Props: the veil's message, whether it is showing, and an optional detail line. */
export interface BusyOverlayProps {
  /** The scenario line, already translated by the caller (e.g. "正在删除…"). */
  message: string
  /** Extra detail under the message, already translated; omitted when absent. */
  hint?: string
  /**
   * Whether the veil is up. Rendering nothing while false keeps the common
   * resting case free of an invisible layer that would still eat clicks.
   */
  visible: boolean
}

/**
 * The shared busy veil's spinner: an arc that breathes while it turns.
 *
 * Deliberately the host's own state-spinner shape (dsh's `_dsh-state-dot-spin`)
 * rather than a border-ring: a two-tone CSS ring at .7s read as a loading
 * indicator from another decade and was out of step with every spinner in the
 * shell. The motion lives in CSS (`dsm-workbuddy-veil-spin` /
 * `-dash`), so this element only describes the geometry; `currentColor` lets it
 * inherit whatever tier it sits in.
 *
 * `aria-hidden` because the veil's `role="status"` already announces the
 * message — a second announcement from a decorative arc is noise.
 */
function VeilSpinner(): ReactElement {
  return (
    <svg className="dsm-workbuddy-veil-spinner" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <circle className="dsm-workbuddy-veil-spinner-track" cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle className="dsm-workbuddy-veil-spinner-arc" cx="10" cy="10" r="8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

/**
 * The veil has no focusable control or dismissal button. It announces the
 * caller's message through a polite status region and marks the region busy.
 * The caller controls completion and timeout handling.
 */
export function BusyOverlay({ message, hint, visible }: BusyOverlayProps): ReactElement | null {
  if (!visible) return null
  return (
    <div className="dsm-workbuddy-veil" role="status" aria-busy="true" aria-live="polite">
      <div className="dsm-workbuddy-veil-card">
        <VeilSpinner />
        <span className="dsm-workbuddy-veil-text">{message}</span>
        {hint === undefined ? null : <span className="dsm-workbuddy-veil-hint">{hint}</span>}
      </div>
    </div>
  )
}
