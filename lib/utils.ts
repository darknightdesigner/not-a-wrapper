import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Format a number with commas for thousands, etc
 */
export function formatNumber(n: number) {
  return new Intl.NumberFormat("en-US").format(n)
}

/**
 * Creates a debounced function that delays invoking the provided function until after
 * the specified wait time has elapsed since the last time it was invoked.
 * Supports `.flush()` to invoke immediately and `.cancel()` to discard pending calls.
 */

type DebouncedFunction<T extends (...args: any[]) => any> = {
  (...args: Parameters<T>): void
  flush: () => void
  cancel: () => void
}

export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): DebouncedFunction<T> {
  let timeout: NodeJS.Timeout | null = null
  let lastArgs: Parameters<T> | null = null

  const debounced = (...args: Parameters<T>): void => {
    lastArgs = args
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => {
      func(...args)
      timeout = null
      lastArgs = null
    }, wait)
  }

  debounced.flush = () => {
    if (timeout && lastArgs) {
      clearTimeout(timeout)
      func(...lastArgs)
      timeout = null
      lastArgs = null
    }
  }

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout)
      timeout = null
      lastArgs = null
    }
  }

  return debounced
}

export const isDev = process.env.NODE_ENV === "development"
