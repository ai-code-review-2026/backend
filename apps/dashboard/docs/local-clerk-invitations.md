# Local Clerk Invitation Testing (localhost:3001)

This guide explains how to test Clerk organization invitations locally without session collisions.

## Why this is needed

Clerk invitation links include invitation query params (for example `__clerk_ticket` / `__clerk_invitation_token`).
If the inviter is already signed in in the same browser profile, Clerk will reuse that session unless you isolate the session.

The dashboard local flow now detects invitation params and, in development, forces a sign-out before rendering the accept flow so the invitee can create/sign in with a different account.

## Local app behavior

- Invitation links that include Clerk invitation params are routed to `/accept-invitation`.
- `/accept-invitation` forwards those params to `/sign-up`.
- `/sign-up` and `/sign-in` keep the invitation params across auth page switches.
- In `NODE_ENV=development`, if an invitation param is present and a Clerk session already exists, the app signs out first and reloads the same invitation URL.

## Recommended test flow

1. Open the dashboard as the inviter in your normal browser profile (`http://localhost:3001`).
2. Send the organization invitation from `/dashboard/organization`.
3. Open the invitation link in one of these isolated contexts:
   - a private/incognito window, or
   - a second browser profile, or
   - another browser (for example Chrome inviter, Firefox invitee).
4. Accept the invitation and complete sign-up/sign-in for the invited account.
5. Verify post-auth redirect lands on `/auth/role-redirect` then dashboard as the invited user.

## Environment variables for local auth redirects

In `apps/dashboard/.env.local`, use local paths so Clerk redirect resolution stays on localhost app routes:

```env
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL=/auth/role-redirect
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/role-redirect
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/auth/role-redirect
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/auth/role-redirect
```

Because the app runs on port `3001`, Clerk instance dashboard settings must include `http://localhost:3001` as an allowed origin/redirect target.

## Clerk Dashboard configuration for localhost

Follow these exact steps in the [Clerk Dashboard](https://dashboard.clerk.com) for your dev instance:

### 1. Set Home URL

- Go to **Configure** → **General** → **Home URL**
- Set to: `http://localhost:3001`
- This ensures Clerk knows where to redirect users after auth flows complete

### 2. Configure allowed redirect URLs

- Go to **Configure** → **General** → **Allowed redirect URLs**
- Add: `http://localhost:3001`
- Add: `http://localhost:3001/auth/role-redirect`
- Add: `http://localhost:3001/accept-invitation`
- These URLs tell Clerk which destinations are safe for post-auth redirects

### 3. Configure invitation redirect URL (when creating invitations)

When you create an organization invitation, you must specify the redirect URL so Clerk sends the invitee to your local app instead of the default Account Portal:

**Via Clerk Dashboard UI:**
- Go to **Organizations** → select your org → **Members** → **Invite**
- Enter the invitee's email and role
- The invitation will use your app's configured redirect URLs

**Via Backend API (recommended for custom redirect):**
```bash
curl 'https://api.clerk.com/v1/organizations/{org_id}/invitations' \
  -X POST \
  -H 'Authorization: Bearer {CLERK_SECRET_KEY}' \
  -H 'Content-Type: application/json' \
  -d '{
    "inviter_user_id": "{user_id}",
    "email_address": "invitee@example.com",
    "role": "org:member",
    "redirect_url": "http://localhost:3001/accept-invitation"
  }'
```

The `redirect_url` ensures the invitation link points to `http://localhost:3001/accept-invitation?__clerk_ticket=...` instead of the production domain.

### 4. Verify User & Authentication settings

- Go to **Configure** → **User & authentication**
- Ensure **Email** is enabled (required for sending invitation emails)
- Ensure **Sign up** is enabled (invitees need to create accounts)
- Under **Session settings**, verify session duration is appropriate for testing

### 5. Test the flow end-to-end

1. As the inviter, navigate to `/dashboard/organization` and send an invitation
2. Check the invitation email (or Clerk Dashboard → **Users** → pending invitations)
3. Open the invitation link in an **incognito window** or **different browser**
4. The link should redirect to `http://localhost:3001/accept-invitation?__clerk_ticket=...`
5. The app should detect the token, sign out any existing session (in dev mode), and show the sign-up page
6. Complete sign-up with the invited email
7. After auth completes, verify redirect to `/auth/role-redirect` → dashboard as the new user

### Troubleshooting

| Issue | Solution |
|-------|----------|
| Invitation redirects to production URL | Ensure `redirect_url` is set to `http://localhost:3001/accept-invitation` when creating the invitation |
| Session collision (invitee gets inviter's account) | Use incognito window or different browser profile; the `LocalInvitationSessionGuard` should auto-sign-out in dev |
| `__clerk_ticket` not detected | Check that the invitation URL contains the query param; verify middleware is running |
| Redirect loop after sign-up | Verify `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL=/auth/role-redirect` is set in `.env.local` |
| "Bot traffic detected" error | This is Clerk's bot protection; use a real browser for testing, not automated tools |
