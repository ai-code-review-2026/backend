"use client"

import * as React from "react"
import { toast as sonnerToast } from "sonner"

type ToastProps = {
  title?: string
  description?: string
  variant?: "default" | "destructive"
}

export const useToast = () => {
  const toast = React.useCallback((props: ToastProps) => {
    if (props.variant === "destructive") {
      sonnerToast.error(props.title || props.description || "Error")
    } else {
      sonnerToast.success(props.title || props.description || "Success")
    }
  }, [])

  return {
    toast,
    dismiss: sonnerToast.dismiss,
  }
}