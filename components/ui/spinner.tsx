import { Icon, type IconProps } from "@/components/ui/icon"
import type { SVGProps } from "react"
import styles from "./spinner.module.css"

/** 3x3 dot-matrix frames, rows top to bottom, `1` = lit. Order is the loop. */
const FRAMES = [
  "011 011 100",
  "001 011 010",
  "001 001 110",
  "000 101 101",
  "100 100 011",
  "100 110 010",
  "110 110 001",
  "010 111 101",
] as const

// Each frame is a 10x10 cell; dot geometry measured from the reference.
const FRAME_SIZE = 10
const DOT_CENTERS = [1.1, 5, 8.9] as const
const DOT_RADIUS = 1.1

/** Every lit dot of every frame as one path, frames laid out left to right. */
const STRIP_PATH = FRAMES.flatMap((frame, index) =>
  frame.split(" ").flatMap((row, rowIndex) =>
    [...row].flatMap((cell, colIndex) => {
      if (cell !== "1") return []
      const x = index * FRAME_SIZE + DOT_CENTERS[colIndex] - DOT_RADIUS
      const y = DOT_CENTERS[rowIndex]
      const d = DOT_RADIUS * 2
      return `M${x} ${y}a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 ${d} 0a${DOT_RADIUS} ${DOT_RADIUS} 0 1 0 -${d} 0`
    })
  )
).join("")

function DotMatrixGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox={`0 0 ${FRAME_SIZE} ${FRAME_SIZE}`}
      fill="currentColor"
      {...props}
    >
      <path className={styles.strip} d={STRIP_PATH} />
    </svg>
  )
}

/** Glyph is 75% of the slot by default (the reference's matrix-to-text
 * proportion), expressed as an inset so `glyphInset` and `glyphSize` both
 * override it. */
function Spinner({
  slotSize = 16,
  glyphInset = "calc(var(--icon-slot-size) * 0.25)",
  ...props
}: Omit<IconProps, "icon">) {
  return (
    <Icon
      icon={DotMatrixGlyph}
      slotSize={slotSize}
      glyphInset={glyphInset}
      role="status"
      aria-label="Loading"
      {...props}
    />
  )
}

export { Spinner }
