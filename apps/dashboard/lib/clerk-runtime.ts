type ClerkRuntimeConfig = {
  clerkJSUrl?: string
  clerkJSVersion?: string
  scriptLoadTimeout?: number
}

const LOCAL_CLERK_JS_URL = "/vendor/clerk-js/current/clerk.browser.js"

function normalizeEnv(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized ? normalized : undefined
}

export function getClerkRuntimeConfig(): ClerkRuntimeConfig {
  const explicitUrl = normalizeEnv(process.env.NEXT_PUBLIC_CLERK_JS_URL)
  const explicitVersion = normalizeEnv(process.env.NEXT_PUBLIC_CLERK_JS_VERSION)

  if (explicitUrl) {
    return {
      clerkJSUrl: explicitUrl,
      clerkJSVersion: explicitVersion,
      scriptLoadTimeout: 30_000,
    }
  }

  return {
    clerkJSUrl: LOCAL_CLERK_JS_URL,
    clerkJSVersion: explicitVersion,
    scriptLoadTimeout: 30_000,
  }
}
