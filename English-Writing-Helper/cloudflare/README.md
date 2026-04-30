# English Writing Helper Usage Backend

Cloudflare resources:

- Worker: `english-writing-helper-usage`
- Public endpoint: `https://english-writing-helper-usage.michael-ewh.workers.dev/usage`
- Managed translation endpoint: `https://english-writing-helper-usage.michael-ewh.workers.dev/managed/translate`
- Managed credits balance endpoint: `https://english-writing-helper-usage.michael-ewh.workers.dev/managed/balance`
- Payment webhook endpoint: `https://english-writing-helper-usage.michael-ewh.workers.dev/webhooks/payment`
- Health check: `https://english-writing-helper-usage.michael-ewh.workers.dev/health`
- Owner dashboard: `https://english-writing-helper-usage.michael-ewh.workers.dev/dashboard`
- D1 database: `english_writing_helper_usage`
- D1 database ID: `e0dfbe3a-4f84-4158-9cc2-ba7c5d871ca4`

The extension sends only anonymous usage counts when the user has anonymous usage reporting enabled. It does not send source text, translated text, API keys, current page URL, or browsing history.

Managed Credits mode is different from anonymous usage reporting: the selected text is sent to this Worker so the backend can call the AI provider and deduct prepaid credits. Source text and translated text should not be stored in D1 logs; only counts, model/provider, status, license key, and credit usage are stored.

Stored fields:

- anonymous usage ID
- event name
- success or failure status
- source and output character counts
- provider
- writing style
- source surface
- extension version
- date bucket
- managed credits license and ledger data, when the user chooses Managed Credits
- managed translation counts and charged characters, without source text or translated text

Required production secrets before enabling Managed Credits:

- `MANAGED_GEMINI_API_KEY`: Gemini API key used by the Worker for managed translations.
- `LEMON_API_KEY`: Lemon Squeezy API key used to create checkout URLs.
- `LEMON_STORE_ID`: Lemon Squeezy store ID.
- `LEMON_VARIANT_STARTER`: Lemon Squeezy variant ID for the US$4.99 / 100,000 character package.
- `LEMON_VARIANT_PLUS`: Lemon Squeezy variant ID for the US$9.99 / 250,000 character package.
- `LEMON_VARIANT_PRO`: Lemon Squeezy variant ID for the US$24.99 / 750,000 character package.
- `LEMON_WEBHOOK_SECRET`: Lemon Squeezy webhook signing secret. The Worker verifies `X-Signature` with HMAC SHA-256.
- `LEMON_TEST_MODE`: set to `true` while testing Lemon Squeezy checkout.
- `MANAGED_SUCCESS_URL`: optional redirect URL after a successful checkout.

Until the Lemon secrets are configured, `/checkout` shows a non-production placeholder page with the generated license key.

Before deploying the 0.3.0 Worker, apply:

- `cloudflare/migrations/0.3.0-managed-credits.sql`

Useful dashboard checks:

- Open the owner dashboard URL above after signing in once with the admin token.
- The admin token is stored locally in macOS Keychain as `codex-ewh-dashboard-token`.
- Open Cloudflare Dashboard > Workers & Pages > `english-writing-helper-usage` for Worker status.
- Open Cloudflare Dashboard > D1 > `english_writing_helper_usage` for raw events and daily summaries.
