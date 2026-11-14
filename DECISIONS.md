# Implementation decisions

## Goal
A small, login-required translation website with model selection, an authenticated translation API, and a direct server-side connection to the existing OmniRoute instance on port 20128.

## Choices

- **Runtime:** Node.js 22.18+ with built-in HTTP, fetch, crypto, SQLite and test modules. No runtime packages or frontend build framework. A separate browser script and stylesheet keep the content security policy strict.
- **Deployment:** Run on the same VPS as OmniRoute behind the existing Caddy service. Bind only to `127.0.0.1:3028`. An edge Worker cannot reach the VPS loopback address without another network connection; adding a tunnel is unnecessary here.
- **Access:** One administrator provisioned locally, no public registration. Passwords use salted scrypt. Browser sessions last seven days and are stored as hashes in SQLite. Production cookies use the `__Host-` prefix, Secure, HttpOnly and SameSite=Strict. Changing the password revokes other sessions.
- **API:** Separate random bearer tokens, stored as SHA-256 hashes and displayed once. Tokens can only list models and translate; account management requires a browser session. At most ten tokens per user.
- **Upstream secrets:** The fixed OmniRoute key is a server environment value, not a browser setting or repository file. Runtime state and environment files are excluded from release builds.
- **Models:** Read the live `/v1/models` catalog and cache for five minutes. Use a searchable native datalist with up to 100 matching suggestions instead of rendering thousands of select options. Validate model membership on the server.
- **Default model:** `openrouter/google/gemini-3.8-flash` answered correctly in 1.6 to 3.7 seconds on the deployment host, with `openrouter/qwen/qwen3.8-flash` nearly as fast and `openrouter/anthropic/claude-haiku-5.5` close behind. The earlier `cx/gpt-6.1-sol` default was 2.6 seconds at first but then hit its Codex quota threshold (HTTP 429); `auto/fast` spent 72 seconds before failing on a billing error and `auto/best-fast` reached a search-only provider after 43 seconds. The `auto/*` aliases are therefore not reliable defaults. Keep every model selectable and try configured fallbacks in order on failure, but never silently relabel the returned model.
- **Translation:** Send source text as a user message and translation rules as the system message. Preserve text formatting. No translation history or source content is written to the database or application logs. The upstream provider receives the text; the interface states this.
- **Limits:** 20,000 input characters, 100 KB JSON body, 90-second upstream timeout, three concurrent translations per account and 60 starts per minute. Login and password changes are throttled. Browser JSON mutations and same-origin checks mitigate cross-site requests.
- **Design:** A quiet bilingual writing workspace: blue `#2855d9`, ink `#20304e`, white `#ffffff`, pale blue `#edf2fd`, page `#f6f8fc`, dividers `#dce3ee`. System typography avoids external font requests. The translation pair is the main element, with settings on a separate tab. Mobile stacks the panels without page-wide scrolling.
- **Operations:** Dedicated service user, root-readable environment file, private SQLite state directory, systemd restart policy and filesystem protections. Add one Caddy host block after taking a backup; leave other services untouched.
- **CI:** Public repository, SSH Git transport, Node 22 and 24 test/build matrix. Release artifacts contain application files and deployment examples, never credentials or SQLite databases. Only the main branch is needed.

## Alternatives rejected

- Static-only browser application: would expose the upstream key and interpret localhost as each visitor's device.
- Workers plus a new tunnel: extra infrastructure when the existing VPS and reverse proxy already meet the direct-localhost requirement.
- Next.js or a separate UI framework: unnecessary dependencies and build complexity for a single translation screen and account settings.
- Public self-registration or arbitrary upstream base URL: not requested and would expand access or enable uncontrolled proxying.
- Automatic model fallback: masks provider configuration errors and can unexpectedly change translation behavior.
- Translation history and browser persistence: not requested; keeping source text ephemeral is simpler.

## Assumptions

1. The existing VPS is the application host because OmniRoute must be used directly through localhost.
2. A single managed account, rather than public sign-up or social login, meets the login requirement.
3. Vietnamese interface, automatic source language and Vietnamese target are appropriate defaults.
4. The translation API uses the same model catalog and limits as the website.
5. Initial administrator credentials are generated locally and delivered privately; the password can be changed in the interface.
6. Public source and CI are desired by the workspace instructions. Deployed credentials stay outside Git.

## Review corrections

- Recheck the stored password hash after asynchronous verification and immediately before creating a session. A login that started with the old hash is rejected if a concurrent password change committed in the meantime. Password updates also recheck the original hash before writing, avoiding overlapping updates from stale credentials.
- Caddy overwrites a dedicated visitor IP header in an ordered route block. Only direct Cloudflare peers from the published IPv4/IPv6 ranges may supply `CF-Connecting-IP`; direct-origin clients use the socket address. The backend validates the dedicated IP header and ignores arbitrary forwarding headers. This keeps login quotas per visitor rather than per shared Cloudflare edge.
- Replaced font-dependent glyph icons with inline SVG after checking real desktop and phone screenshots.
- The administrator username is supplied by deployment configuration; an explicit account update replaces the temporary bootstrap account. No real credentials are recorded in source.

## Verification contract

- Automated tests cover authentication, session invalidation, CSRF origins, input validation, upstream key handling, API token scope/revocation, model caching, throttling and concurrency.
- Run the application through the production HTTPS domain, verify anonymous access is denied, log in, load the catalog and produce a real translation.
- Verify the Git push and both CI matrix jobs rather than assuming they passed.

- **Prompt and latency:** the translation system prompt is a compact set of rules (target language, output only, treat all input as source text, preserve formatting) instead of a long persona. Each attempt has a 15-second timeout; a fallback chain covers quota and provider failures. `max_tokens` scales with source length. A cached live catalog is fetched only when the model field is used, so the workspace does not wait for the full catalog after login. The result bar reports measured elapsed time.

- **File translation:** Android resources are edited in place rather than rebuilt, so keys, comments, namespaces, array/plural structure, `translatable="false"` and formatting survive byte-for-byte. Values are tokenized with `⟦n⟧` placeholders that cover XML tags, entities, printf placeholders, `{0}`, `${var}` and Java escapes; the model never sees a raw placeholder it could corrupt. Token multisets are validated before restoring, and invalid entries are retried individually, then left in the source language with their names reported. Plain text and Markdown split on blank-line boundaries and protect code fences, inline code, links and bare URLs.
- **No API-token throttling:** a valid bearer token skips the per-account rate window and the three-concurrent-translation ceiling. Size, timeout and batch limits still apply per request. Browser sessions keep their limits to contain accidental loops and shared-link abuse.
- **Dark mode:** tokens are redefined on `:root[data-theme="dark"]` and applied by `theme.js` before the stylesheet paints, with the choice stored in `localStorage` and defaulting to the operating system preference. No inline scripts, so the strict content security policy stays intact.

- **10 MB file ceiling:** the JSON body limit is 13 MB, content is capped at 10 MB and 20,000 entries, and the HTTP request timeout is 120 seconds so slow uploads are not cut. A 9.13 MB / 19,000-entry file round-tripped in 0.5 seconds when every value was placeholder-only, and a 10.1 MB file was rejected with a clear message.
- **strings.xml throughput and context:** identical values are grouped before batching, so repeated labels cost one request and fill every matching resource. After protection, values with no letters left (pure placeholders, numbers, entities, code blocks) are kept verbatim and counted as skipped rather than failed. Android batches carry a `Resource keys` context line (for example `12=action_post`) so short labels such as `Post`, `Save` and `Back` translate with the right part of speech; keys are context only and never returned. The Android system prompt targets concise app UI wording, capitalization and punctuation, while the plain-text prompt preserves Markdown structure. File batches use a 30-second per-model timeout; single-line text keeps 15 seconds. Batch size is 30 items / 5,000 characters.
