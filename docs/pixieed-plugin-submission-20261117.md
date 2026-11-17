# PiXiEED Draw plugin — store preparation status

Updated: 2026-11-17 (JST)

## 実装

- `plugins/pixieed/` contains the OAuth store manifest, MCP server declaration, icons, and Draw onboarding skill. The public server is `/mcp/store`; the existing individual-configuration `/mcp` remains available for compatibility.
- The store flow uses OAuth 2.1, CIMD, and PKCE. Draw starts a temporary session and displays a one-use code; the user enters it only on the PiXiEED authorization page opened by ChatGPT, checks the artwork and scopes, then explicitly allows access. The code is valid for two minutes; a Draw session lasts up to 15 minutes. Copying the code between browsers does not prove ownership of the Draw tab.
- The deployed store catalog currently has 29 tools: six optional public reference tools, 19 specific project operations, and state/status/save/disconnect operations. Public tool arguments do not accept credentials or a session selector. The browser keeps its Draw relay credential in memory and sends it only as an Authorization header; ChatGPT holds the OAuth access token. Refresh tokens are not issued. Save is browser-local; publishing and cloud sync are unsupported.
- Privacy and support page drafts are present at `ai/privacy/index.html` and `ai/support/index.html`; onboarding guidance is in `ai/index.html`. The package declares five positive and three negative review cases. The negative pre-consent case allows starting OAuth authorization but forbids treating the artwork as available before explicit approval.

## 確認

- OpenAI developer identity showed **Verified** in the live organization UI on 2026-11-17 JST. No private identity details are recorded here.
- The legacy `/mcp` release was verified on 2026-11-17: main `8ec9768bb53b0b60dbc838ac3fbef1312096e57e`, Worker `9d9b54ca-3e78-4507-bfaf-40d0d5b9ffac`, Pages run `43998755762`. Eleven native tools were listed; live connect, state read, edit/undo, save, and disconnect flows were exercised. This does not assert that every tool was individually tested.
- For `/mcp/store`, Worker version `d637b0a0-f919-43fb-84ed-f69d7fa396b9` was deployed and its smoke checks passed: `/health` and OAuth metadata returned 200; legacy `/mcp` retained 11 tools; `/mcp/store` exposed 29 tools without secret arguments; unauthenticated project-state access returned a 401 challenge. The OAuth authorization page loaded from CIMD and had no horizontal overflow at 390px. Automated checks after the nested-acknowledgement fix passed: workerd 14/14, catalog 10/10, controller/relay/catalog combined 23/23; the full project run passed 3,730/3,730 tests and the site build included 1,118 files. These checks do not verify a real ChatGPT connection or an actual Draw edit/save.
- The package metadata uses the supported `Creativity` category, three short default prompts, five positive and three negative cases, non-commerce declaration, and relative icon assets. `mcp.json` declares OAuth/CIMD and the `/mcp/store` resource.

## 未完了

- This is preparation material, not a submitted or published plugin. The current 29-tool package is not the final submission candidate; a later 43-tool catalog integration and its package checks are planned. Root owns final ZIP generation and final package validation.
- A real ChatGPT OAuth connection and reviewer-run Draw read/edit/save have not been verified. No demo video or reviewer-access setup has been completed. Do not mark the drafted cases as run.
- The privacy/support page URLs (`https://pixieed.jp/ai/privacy/` and `https://pixieed.jp/ai/support/`), the plugin website and terms URL must be opened after site publication and checked for accessible, matching content before submission. Domain challenge remains to be completed in the portal. The user explicitly selected all available countries and regions on 2026-11-17; `publication.countries: []` records that unrestricted targeting, whose import must be verified in the portal. The verified identity is separate from domain verification.
- No store upload, review submission, approval, or publication has occurred. The existing `pixieed-draw-plugin-preparation.zip` is a stale snapshot and must not be submitted. The optional Plugin Creator preparation workflow is available; manual packaging and validation are also supported.
