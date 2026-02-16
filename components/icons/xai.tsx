import { forwardRef, type SVGProps } from "react"

export type XaiIconProps = {
  size?: number | string
} & SVGProps<SVGSVGElement>

export const XaiIcon = forwardRef<SVGSVGElement, XaiIconProps>(
  ({ size = 24, width, height, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      fill="currentColor"
      fillRule="evenodd"
      {...props}
    >
      <title>Grok</title>
      <path d="M6.469 8.776L16.512 23h-4.464L2.005 8.776H6.47zm-.004 7.9l2.233 3.164L6.467 23H2l4.465-6.324zM22 2.582V23h-3.659V7.764L22 2.582zM22 1l-9.952 14.095-2.233-3.163L17.533 1H22z" />
    </svg>
  )
)

XaiIcon.displayName = "XaiIcon"

export default XaiIcon
