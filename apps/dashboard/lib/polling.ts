export type Poller = {
  start: () => void
  stop: () => void
}

export function createPoller(
  poll: () => Promise<void>,
  options?: {
    intervalMs?: number
    onError?: (error: unknown) => void
  },
): Poller {
  const interval = options?.intervalMs ?? 10_000
  let timeoutId: ReturnType<typeof setTimeout> | null = null
  let isRunning = false

  const run = async () => {
    if (!isRunning) return
    try {
      await poll()
    } catch (error) {
      options?.onError?.(error)
    }
    if (isRunning) {
      timeoutId = setTimeout(run, interval)
    }
  }

  return {
    start: () => {
      if (isRunning) return
      isRunning = true
      void run()
    },
    stop: () => {
      isRunning = false
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    },
  }
}
