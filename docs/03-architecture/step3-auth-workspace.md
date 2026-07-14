# Step 3 Auth And Workspace Bootstrap

Status: implemented locally on 2026-07-14.

## What Step 3 Adds

- Supabase Google OAuth callback route:
  `src/app/auth/callback/route.ts`
- Auth server actions:
  `src/app/auth/actions.ts`
- Auth error page:
  `src/app/auth/auth-code-error/page.tsx`
- Workspace bootstrap helper:
  `src/lib/workspaces/bootstrap.ts`
- Runtime origin helper:
  `src/lib/auth/origin.ts`
- Real capture panel client component:
  `src/components/capture-panel.tsx`

## Auth Flow

Google SSO and email magic-link sign-in use Supabase Auth.

1. User clicks Google or submits email.
2. Supabase redirects to `/auth/callback`.
3. The callback route exchanges the auth code for a Supabase session cookie.
4. The callback route loads the authenticated user.
5. `ensureDefaultWorkspace` creates the user's first workspace if needed.
6. The user returns to `/`.

The app never stores Google OAuth secrets. Google Client ID/Secret live only in
the Supabase Dashboard provider configuration.

## Workspace Bootstrap

`ensureDefaultWorkspace` creates:

- `workspaces` row with `owner_id = auth user id`
- `workspace_members` row with `role = owner`

This is intentionally simple for MVP. Team/member management is out of scope.

## Capture Flow

The logged-in app shell now renders a real capture panel. Submitting text calls
`POST /api/captures`, which:

- validates input with Zod,
- stores `captures.raw_text`,
- optionally stores `capture_sources`,
- creates a queued `processing_jobs` row.

OpenAI processing is still not called in Step 3.

## Manual Verification

Automated checks:

```bash
npm run lint
npm run build
```

Manual checks needed:

1. Open `http://localhost:3000`.
2. Click Google sign-in.
3. Complete Google OAuth.
4. Confirm the app returns to `/`.
5. Confirm `workspaces` and `workspace_members` rows are created.
6. Paste a short capture and confirm rows appear in `captures` and
   `processing_jobs`.

## Remaining Risks

- Supabase URL allow-list may need `http://localhost:3000/auth/callback` if
  Google login rejects the redirect.
- Email sign-in depends on Supabase email delivery and `Confirm email` settings.
- Capture creation is still multi-step rather than a single SQL transaction.
