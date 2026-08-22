"use client"

import { useEffect, useRef, useState } from "react"

import { cn } from "@/shared/lib/cn"

/**
 * 计算右侧面板宽度（px）：clamp 到 [rightMin, containerWidth - leftMin]。
 * 容器很窄时，左侧最小宽度不参与挤压右侧，保证右侧至少 rightMin。
 */
export function resolvePanelWidth(
  rawWidth: number,
  containerWidth: number,
  rightMin = 320,
  leftMin = 280,
): number {
  const max = Math.max(rightMin, containerWidth - leftMin)
  return Math.min(Math.max(rawWidth, rightMin), max)
}

interface SplitterProps {
  /** 右侧面板当前宽度（px） */
  value: number
  /** 拖动 / 键盘调整后的新宽度（已 clamp） */
  onChange: (value: number) => void
  /** 右侧面板最小宽度（px），默认 320 */
  rightMin?: number
  /** 左侧面板最小宽度（px），用于推导右侧最大宽度，默认 280 */
  leftMin?: number
  /** 拖动开始/结束时通知父组件（用于关闭过渡动画） */
  onDraggingChange?: (dragging: boolean) => void
  label?: string
}

/**
 * 竖直分隔条：悬停显示指示线，按住拖动可调整左右两侧宽度。
 * 必须作为 grid / flex 容器中与两侧面板同级的子元素。
 */
export function Splitter({
  value,
  onChange,
  rightMin = 320,
  leftMin = 280,
  onDraggingChange,
  label = "调整面板宽度",
}: SplitterProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  // 拖动期间禁止全文文本选中，避免拖拽时选中内容
  useEffect(() => {
    if (!dragging) return
    const prev = document.body.style.userSelect
    document.body.style.userSelect = "none"
    return () => {
      document.body.style.userSelect = prev
    }
  }, [dragging])

  const clampValue = (v: number): number => {
    const container = ref.current?.parentElement
    const containerWidth =
      container?.getBoundingClientRect().width ?? Number.POSITIVE_INFINITY
    return resolvePanelWidth(v, containerWidth, rightMin, leftMin)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    setDragging(true)
    onDraggingChange?.(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    const container = ref.current?.parentElement
    if (!container) return
    const rect = container.getBoundingClientRect()
    // 分隔条到容器右边缘的距离 = 右侧面板宽度
    onChange(clampValue(rect.right - e.clientX))
  }

  const stopDragging = () => {
    setDragging(false)
    onDraggingChange?.(false)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16
    if (e.key === "ArrowLeft") {
      e.preventDefault()
      onChange(clampValue(value - step))
    } else if (e.key === "ArrowRight") {
      e.preventDefault()
      onChange(clampValue(value + step))
    }
  }

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={rightMin}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onKeyDown={onKeyDown}
      className={cn(
        // w-2 命中区骑跨 0 宽轨道边界：两侧面板贴齐、不产生空档；
        // z-10 保证悬停指示线不被相邻面板背景遮挡
        "group relative z-10 flex w-2 shrink-0 cursor-col-resize touch-none select-none items-center justify-center outline-none justify-self-center",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
      )}
    >
      {/* 指示线：默认透明，hover / 拖动时高亮显示 */}
      <div
        className={cn(
          "h-full w-0.5 rounded-full bg-primary/50 transition-[opacity,background-color]",
          dragging ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      />
    </div>
  )
}
