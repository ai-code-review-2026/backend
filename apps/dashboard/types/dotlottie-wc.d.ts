import type { DetailedHTMLProps, HTMLAttributes } from "react"

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "dotlottie-wc": DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string
        autoplay?: boolean
        loop?: boolean
      }
    }
  }
}

export {}
