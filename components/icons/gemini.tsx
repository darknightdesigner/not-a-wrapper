import { forwardRef, type SVGProps } from "react"

export interface GeminiIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

export const GeminiIcon = forwardRef<SVGSVGElement, GeminiIconProps>(
  ({ size = 24, width, height, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 64 64"
      fill="none"
      {...props}
    >
      <g clipPath="url(#gemini)">
        <path
          fill="currentColor"
          d="M32 64A38.14 38.14 0 0 0 0 32 38.14 38.14 0 0 0 32 0a38.15 38.15 0 0 0 32 32 38.15 38.15 0 0 0-32 32"
        />
      </g>
      <defs>
        <clipPath id="gemini">
          <path fill="#fff" d="M0 0h64v64H0z" />
        </clipPath>
      </defs>
    </svg>
  )
)

GeminiIcon.displayName = "GeminiIcon"

export default GeminiIcon
