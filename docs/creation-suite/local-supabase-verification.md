# Local Supabase HTTP verification

`scripts/social-local-supabase-check.mjs` is an opt-in synthetic integration runner. It is not part of `npm test`, does not start or reset Supabase, and must only target a disposable local project prepared for this test. It creates synthetic Auth users, SNS rows, consent receipts in issued-fixture mode, and a short synthetic WAV. It does not automatically delete those records; preserve its summary, then discard the disposable project using its separately controlled lifecycle.

Before running it, confirm the local Supabase API and database listeners bind only to `127.0.0.1` / `::1`, the Docker port setting is Localhost only, resource limits remain at or below 8 GiB memory and 15 GiB total disk, and the project has no cloud link or cloud credentials. Prepare a JSON connection file containing `url`, `publishableKey`, and `secretKey`; protect it with mode `0600`. Do not paste or print its contents. The runner rejects any API URL other than `http://127.0.0.1:57431` and rejects a connection file with broader permissions.

Run from the candidate repository root, supplying the connection file explicitly and exactly one mode:

```sh
node scripts/social-local-supabase-check.mjs --connection-file /secure/local/connection.json --draft-policy
```

`--draft-policy` checks that public publishing is refused by the unchanged draft policy. The source policy remains `draft`, and the puzzle source approval guard remains closed. The runner reads the current source terms/privacy version strings for synthetic consent payloads; this does not issue or activate policy.

Only after a separate, clearly marked **temporary local copy** has a synthetic issued policy fixture may the issued-path checks run:

```sh
node scripts/social-local-supabase-check.mjs --connection-file /secure/local/connection.json --issued-policy
```

That mode is a local fixture check, not candidate-source activation, legal publication, or production evidence. Never change the candidate policy to make this mode pass. The runner reports statuses and test labels only; it does not print credentials, request/response bodies, or credential URLs.

The exercised HTTP boundaries include Auth anonymous and local synthetic accounts, invalid JWT/private access, guest transfer and replay/collision, private/public text and music, byte ranges, delete/tombstone cleanup, consent refusal and append-only receipts, comments disabled, and direct Data API/Storage restrictions. Image/puzzle upload success is not tested. Same-ID email promotion via inbox OTP is outside this HTTP runner; a separate actual Auth-adapter and Chrome UI run verified same-ID registration, private PXD bytes/ownership metadata and local audio retention. Google OAuth and production Auth/provider settings remain unverified. The runner makes no claim about production readiness.

For the local function runtime, set `PIXIEED_LOCAL_SUPABASE_HTTP=1` only in the isolated local environment and use the internal origin `http://kong:8000`. Otherwise service URL validation requires HTTPS. Do not carry this local-only setting into production.

The base HTTP scenarios were previously exercised against the disposable local stack and a separately marked issued-policy copy using a temporary runner. The reusable script was also exercised against actual local services in both modes (87 draft checks and 117 issued-fixture checks), in addition to syntax and invalid-argument checks. Running it is an explicit operator action and may create additional synthetic records.

The four user-facing or mixed-public functions (`social-feed`, `create-post`, `delete-post`, `set-author-name`) explicitly use handler-level `Auth.getUser` verification instead of the legacy shared-secret Gateway verifier, which rejected real ES256 Auth sessions in the installed CLI. Every write still verifies the server-derived identity and ownership; missing/invalid tokens were rejected through actual HTTP. The moderator Gateway remains separate and unchanged. See the [official signing-key guidance](https://supabase.com/docs/guides/auth/signing-keys). No hosted Gateway setting is applied by this runbook.
