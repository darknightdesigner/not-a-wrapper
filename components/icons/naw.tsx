import { forwardRef, type SVGProps } from "react"

export type NawIconProps = {
  size?: number | string
} & SVGProps<SVGSVGElement>

export const NawIcon = forwardRef<SVGSVGElement, NawIconProps>(
  ({ size = 24, width, height, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <circle cx="12" cy="12" r="10" fill="currentColor" stroke="none" />
    </svg>
  )
)

NawIcon.displayName = "NawIcon"

export default NawIcon
