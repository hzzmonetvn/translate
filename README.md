# Translate Workspace

A small private translation workspace, connected directly to a local OmniRoute server. Includes login, model search, language selection, automatic model fallback, translation API tokens and password changes. Vietnamese interface, responsive layout, no translation history.

## Requirements

- Node.js 22.18 or later (built-in SQLite).
- OmniRoute with working OpenAI-compatible `/v1/models` and `/v1/chat/completions` endpoints.
- Caddy or another HTTPS reverse proxy for production.

## Local setup

```sh
npm ci --ignore-scripts
cp .env.example .env
node scripts/password.js
```

Save the generated password privately and put the generated hash into `.env`. Set `OMNI_API_KEY` to the existing OmniRoute key. For development set `NODE_ENV=development`, `APP_ORIGIN=http://localhost:3028`, and `TRUST_PROXY=0`.

```sh
npm start
```

Open `http://localhost:3028`. The account is created on the first start only. Later password changes are stored in SQLite; changing the bootstrap hash in `.env` does not overwrite an existing account.

## API

Log in, open **API & tài khoản**, and create a named token. Store the token immediately; it is displayed once.

```sh
curl https://translate.example.com/api/v1/translate \
  -H 'Authorization: Bearer YOUR_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"text":"Hello, world!","source":"auto","target":"vi","model":"cx/gpt-6.1-sol"}'
```

Response:

```json
{"translation":"Xin chào thế giới!","source":"auto","target":"vi","model":"cx/gpt-6.1-sol"}
```

The response can also include upstream `usage`. `source`, `target` and `model` are optional, defaulting to `auto`, `vi` and `DEFAULT_MODEL` respectively. Model IDs must match the current upstream catalog. If the chosen model errors, times out after 15 seconds, or returns an empty answer, the backend tries each `FALLBACK_MODELS` entry in order; the response still names the model the caller requested.

OpenRouter models use full provider-prefixed IDs such as `openrouter/google/gemini-3.8-flash`. Aliases such as `auto/fast` may fan out to unavailable providers, so verify a model with a one-line translation before making it the default. Live tests from the deployment host measured about 1.6 to 3.7 seconds with `openrouter/google/gemini-3.8-flash` and `openrouter/qwen/qwen3.8-flash`. Latency still depends on the provider pool.

- `GET /api/v1/models`: returns `models: [{id, provider}]` and `defaultModel`.
- `POST /api/v1/translate`: returns the translated text.
- Supply `Authorization: Bearer YOUR_TOKEN` for either API endpoint.
- Language codes: `auto` (source only), `vi`, `en`, `ja`, `ko`, `zh-CN`, `zh-TW`, `fr`, `de`, `es`, `ru`, `th`, `id`, `pt`, `it`, `ar`, `hi`.
- Limits: 20,000 characters per text request, 10 MB and 20,000 entries per file. A valid API token is not throttled and has no concurrent-translation cap. Browser sessions keep 120 starts per minute and three concurrent translations. Each model attempt times out after 15 seconds.
- Errors use `{"error":"message"}` with HTTP 400, 401, 403, 413, 415, 429, 502 or 504 as appropriate.
- Tokens are limited to the two API endpoints. Use the web account settings to revoke them.

## Production

1. Build with `npm run build` and copy the contents of `dist/` into `/opt/translate`.
2. Create a dedicated `translate` system user.
3. Install `deploy/translate.service` into `/etc/systemd/system/`.
4. Create `/etc/translate.env` as root with mode `0600`. Set production origin, bootstrap username/hash, OmniRoute base URL/key, default model, `TRUST_PROXY=1`, and `DB_PATH=/var/lib/translate/translate.sqlite`.
5. Back up the existing Caddyfile, add the block in `deploy/Caddyfile.example` using the actual hostname, validate Caddy, and reload it.
6. Add a proxied Cloudflare DNS A record pointing at the VPS origin.
7. Run `systemctl enable --now translate` and check the public HTTPS domain.

The application listens on loopback only. Use the supplied Caddy block: it overwrites `X-Translate-Client-IP` with the direct peer address and accepts `CF-Connecting-IP` only from listed Cloudflare peers. Update those ranges from Cloudflare when they change. Do not make the backend port public. Production session cookies require HTTPS. Health endpoint: `GET /healthz`.

The OmniRoute key stays in the server environment. SQLite holds password hashes, session hashes and token hashes, not translation history. Upstream providers receive submitted text under their own retention settings. Keep environment files and state backups private.

### File translation

`POST /api/v1/translate-file` accepts `{filename, content, source, target, model}` and streams NDJSON:

```
{"type":"start","total":120,"format":"xml"}
{"type":"progress","done":25,"total":120}
{"type":"done","output":"<translated file>","translated":118,"failed":2,...}
{"type":"error","error":"message"}
```

Supported files: Android `strings.xml` or other resource XML, `.txt`, `.md`. For Android, the backend rewrites only translatable values and leaves keys, comments, namespaces, `<plurals>` quantities, `translatable="false"`, CDATA and resource references untouched. Placeholders (`%1$s`), XML tags, entities (`&amp;`) and Java escapes (`\n`) are tokenized before the model sees the text and restored afterwards; any entry that loses a token is retried alone and then kept in the source language, with its name reported in `failedNames`. Entries are batched (30 items / 5,000 characters) and translated three batches at a time. Identical values are translated once and reused across every resource that shares them, and values with no translatable letters after placeholder protection (for example `%1$s` or `100%`) are kept untouched and reported as `skipped`. For Android files, resource keys travel with each batch as disambiguation context and the prompt asks for concise app UI wording. Each file batch attempt times out after 30 seconds. Save the downloaded XML as `app/src/main/res/values-<lang>/strings.xml`.

### Rollback and backup

Before each deployment, save `/opt/translate` as a dated sibling directory and copy `/etc/caddy/Caddyfile` to a dated backup. Restore that directory and Caddyfile, reload Caddy and restart `translate` to roll back. Stop the service before backing up or restoring its SQLite database and companion WAL files. Do not delete state when rolling back application code.

## Verification

```sh
npm test
npm run build
```

GitHub Actions runs tests and builds on Node 22 and 24 and uploads release files. See `DECISIONS.md` for the implementation tradeoffs.

## Five quick checks

1. Why is the OmniRoute key stored on the server rather than in browser code?
2. How does an API token differ from the browser login session?
3. Which route lists models, and how long is the catalog cached?
4. What happens to existing browser sessions after changing the password?
5. What are the input size and concurrent translation limits?
