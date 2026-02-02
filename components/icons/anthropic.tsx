import { forwardRef, type SVGProps } from "react"

export interface AnthropicIconProps extends SVGProps<SVGSVGElement> {
  size?: number | string
}

export const AnthropicIcon = forwardRef<SVGSVGElement, AnthropicIconProps>(
  ({ size = 24, width, height, ...props }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={width ?? size}
      height={height ?? size}
      viewBox="0 0 245 245"
      fill="none"
      {...props}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M141.151 35.933h36.78L245 204.166h-36.781zm-74.093 0h38.455l67.069 168.233h-37.505l-13.71-35.331H51.215l-13.72 35.321H0L67.069 35.953zm42.181 101.665L86.291 78.471l-22.948 59.137h45.886z"
        clipRule="evenodd"
      />
    </svg>
  )
)

AnthropicIcon.displayName = "AnthropicIcon"

export default AnthropicIcon
