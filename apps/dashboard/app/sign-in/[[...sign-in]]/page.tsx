import { SignIn } from "@clerk/nextjs"

import { AuthShell } from "@/components/auth/auth-shell"
import { clerkAuthAppearance } from "@/components/auth/clerk-auth-appearance"
import { LocalInvitationSessionGuard } from "@/components/auth/local-invitation-session-guard"
import { ClerkAuthWrapper } from "@/components/ui/animated-auth"
import { buildPathWithForwardedClerkAuthParamsFromRecord } from "@/lib/clerk-invitation"

type SignInPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const params = await searchParams
  const signUpUrl = buildPathWithForwardedClerkAuthParamsFromRecord("/sign-up", params)

  return (
    <AuthShell mode="sign-in">
      <LocalInvitationSessionGuard />
      <ClerkAuthWrapper>
        <SignIn
          path="/sign-in"
          routing="path"
          forceRedirectUrl="/auth/role-redirect"
          fallbackRedirectUrl="/auth/role-redirect"
          signUpUrl={signUpUrl}
          appearance={clerkAuthAppearance}
        />
      </ClerkAuthWrapper>
    </AuthShell>
  )
}
