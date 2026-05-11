import { SignUp } from "@clerk/nextjs"

import { AuthShell } from "@/components/auth/auth-shell"
import { ClerkConfigurationNotice } from "@/components/auth/clerk-configuration-notice"
import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance"
import { LocalInvitationSessionGuard } from "@/components/auth/local-invitation-session-guard"
import { ClerkAuthWrapper } from "@/components/ui/animated-auth"
import { buildPathWithForwardedClerkAuthParamsFromRecord } from "@/lib/clerk-invitation"
import { isClerkConfigured } from "@/lib/clerk-runtime"

type SignUpPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignUpPage({ searchParams }: SignUpPageProps) {
  const params = await searchParams
  const signInUrl = buildPathWithForwardedClerkAuthParamsFromRecord("/sign-in", params)
  const clerkConfigured = isClerkConfigured()

  return (
    <AuthShell mode="sign-up">
      <LocalInvitationSessionGuard />
      <ClerkAuthWrapper>
        {clerkConfigured ? (
          <SignUp
            path="/sign-up"
            routing="path"
            forceRedirectUrl="/auth/role-redirect"
            fallbackRedirectUrl="/auth/role-redirect"
            signInUrl={signInUrl}
            appearance={clerkAuthAppearance}
          />
        ) : (
          <ClerkConfigurationNotice
            title="Registration temporarily unavailable"
            description="Clerk is not configured for this deployment. Add NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to the runtime and redeploy the dashboard build before opening sign-up again."
          />
        )}
      </ClerkAuthWrapper>
    </AuthShell>
  )
}
