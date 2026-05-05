# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run lint     # Run ESLint
npm start        # Start production server
```

No test suite is configured. `next.config.ts` has `ignoreBuildErrors: true` and `eslint.ignoreDuringBuilds: true` — do not rely on CI to catch type errors.

## Architecture

This is a **Next.js 15 App Router** dashboard for managing AI voice/chatbot services, using a **proxy pattern** to external APIs.

### Data Flow

```
Browser (Client Components)
  → Next.js API Routes (/api/elevenlabs/*, /api/retell/*)
    → External APIs (ElevenLabs, Retell AI)
  → Supabase (auth, token storage, leads/conversations data)
```

### Auth & Security

- Supabase PKCE auth flow, storage key `smartbot-auth`
- API tokens (ElevenLabs, Retell) stored AES-256 encrypted in Supabase (`elevenlabs_tokens`, `retell_tokens` tables)
- All API routes validate Bearer tokens and enforce user isolation via RLS
- `AuthProvider` context (`src/app/components/AuthProvider.tsx`) provides global auth state

### Key Directories

- `src/app/lib/` — API clients and utilities:
  - `supabaseClient.ts` — Supabase client (PKCE, 30s timeout)
  - `elevenLabsApi.ts` — ElevenLabs client with retry/backoff
  - `retellApi.ts` — Retell AI client
  - `conversationsApi.ts` — Conversation fetch/filter/sort/pagination
  - `aiCallsHelper.ts` — Normalization to unified AI call format
- `src/app/api/` — Next.js route handlers (proxy to external APIs)
- `src/app/dashboard/` — Dashboard pages: `/`, `/leads`, `/conversations`, `/ai-calls`, `/settings`
- `supabase/migrations/` — All DB migrations (run in order)

### Supabase Tables

| Table | Purpose |
|---|---|
| `user_services` | Feature flags per user (`has_chatbot`, `has_ai_calls`) |
| `elevenlabs_tokens` | Encrypted ElevenLabs API keys |
| `retell_tokens` | Active Retell API keys |
| `leads` | Customer lead records |
| `conversations` | Chatbot conversation records |
| `elevenlabs_conversations` | ElevenLabs AI call data |
| `elevenlabs_token_access_log` | Audit trail for token access |

### Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

### UI Conventions

- Dark theme: background `#2C2E31`, cards `#3A3D42`, accent `#F0AD4E` (gold)
- Font: Inter (via `src/app/globals.css`)
- UI language: Italian (`it-IT`)
- Path alias: `@/*` → `src/*`
- ElevenLabs API routes use Edge runtime with 60s revalidation
