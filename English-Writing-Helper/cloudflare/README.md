# English Writing Helper Usage Backend

Cloudflare resources:

- Worker: `english-writing-helper-usage`
- Public endpoint: `https://english-writing-helper-usage.michael-ewh.workers.dev/usage`
- Health check: `https://english-writing-helper-usage.michael-ewh.workers.dev/health`
- D1 database: `english_writing_helper_usage`
- D1 database ID: `e0dfbe3a-4f84-4158-9cc2-ba7c5d871ca4`

The extension sends only anonymous usage counts when the user has anonymous usage reporting enabled. It does not send source text, translated text, API keys, current page URL, or browsing history.

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

Useful dashboard checks:

- Open Cloudflare Dashboard.
- Go to Workers & Pages > `english-writing-helper-usage` for Worker status.
- Go to D1 > `english_writing_helper_usage` for raw events and daily summaries.
