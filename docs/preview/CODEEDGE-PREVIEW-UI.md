# Codeedge CIGO preview UI

Child branch: `preview/codeedge-intelligence-ui`, based on frozen integration PR #7 at `e964f484a6561c6e0f25b9d25f4fca89d076cc01`. This phase adds presentation only. It does not rewrite or repeat the completed Business OS integration and does not modify PR #6, PR #7, Business OS PR #78 or frozen main.

## Brand reference and design

The official wordmark is copied byte-for-byte from released Business OS main `c705d2e2b2eb552015f79c412dce4d40e9bf1016`, `public/assets/logo.svg`. SHA-256: `220e8df319a7910a16531678b061b95665bf8acfabea186dbee1f0cc6db100db`. The preview test pins that digest. There is no replacement CIGO logo.

Released navy tokens: background `#06101f`, deep background `#040b16`, surface `#0a1830`, border `#173a67`, text `#f7fbff`, blue `#2484ff`, cyan `#21d6ef`. Muted text is brightened for small-text readability. Typography uses the Business OS Inter/system stack without downloading fonts. Sidebar width, header height, selected navigation, cards, controls, borders and focus indicators follow the released application shell.

The hierarchy is Codeedge → Business OS → CIGO. Content is left-aligned. The executive overview puts qualitative business health and comparable observations before candidate considerations, with connection/freshness/uncertainty beside them. Charts identify separate cohorts and do not imply a funnel or causation. The UI does not fabricate a health score, financial profit or ROI.

```text
Official Codeedge wordmark | Header: intelligence / synthetic demo
Intelligence navigation   | Overview heading / demo scenario
                          | Business health       | Connection
                          | Observations / reviews| Uncertainty
                          | Across the business   | Memory
```

On tablet/mobile the sidebar becomes a keyboard-contained navigation drawer; cards reflow and tables scroll inside labelled regions. Dialogs use the native modal focus boundary, close with Escape and restore focus. Reduced motion disables the loading animation.

## Presentation architecture and truth boundaries

`apps/preview/demo-model.mjs` composes the existing metric/cross-domain analysis, recommendation/evaluation/decision packet, evidence intake, business memory, knowledge view and evidence-grounded analysis modules at build time. Existing engine and server boundary files remain unchanged. The established R9 pilot remains intact; this UI adds bounded domain fixtures rather than duplicating its trust/action architecture.

Only three named synthetic scenarios are accepted: steady operations, capacity constrained, and limited observations. Northstar Care is fictional. The seeded UTC reporting window is September 2026; the fixed observation snapshot is 7 October 2026, 12:00 UTC. Values are illustrative, not real business performance. Freshness is explicitly relative to that snapshot, never represented as live synchronization.

The static build publishes exactly five allowlisted files: HTML, CSS, presentation JavaScript, public synthetic DTO JavaScript and the wordmark. It excludes compiled server modules, source credentials, environment variables, workspace identities, fingerprints, raw receipts and approvals. The browser imports only synthetic DTOs; it has no live fetch/effect client, persistent storage or API route. CSP restricts scripts/styles/images to the same origin and denies forms/framing. No new dependencies are added.

Metrics and proposals remain UNVERIFIED/non-actionable with insufficient confidence. Memory remains ASSUMPTION. Decision packets have no reviewer identity, approval, decision or execution authority. The UI never promotes HTTP success into VERIFIED/FACT. Stale/partial metrics have unavailable values and cannot prepare grounded proposals. All execution controls are disabled and no mutation/approval endpoint exists.

“Demo connected” indicates fixture availability only. The interface identifies no live Business OS connection and no authenticated source receipt issued by this demo. It shows resource shapes, last observation, freshness, evidence status and safe provenance summaries. Marketing/retention/capacity aggregate examples do not claim those aggregates exist in the live v1 read contract. Finance is a local summary, not an external ledger snapshot. No customer contact or provider secrets appear.

## Local preview and validation

From the repository root:

```text
npm ci --ignore-scripts
npm run preview:build
npm run preview:serve
```

Open `http://127.0.0.1:4173`. The local server binds loopback, serves an explicit file allowlist and accepts GET/HEAD only. Set PORT to choose another local port. Navigation, search, domain filtering, scenario switching and explanations change only presentation. The footer's Preview state selector demonstrates loading, empty and unavailable behavior without displaying previous values as current. A real failed data-module load also renders a safe retry state.

Validation:

```text
npm run verify
npm run test:preview
npm run test:postgres
```

The existing mandatory suites remain 270 engine tests and 14 actual disposable PostgreSQL tests, with no skips. Eight additional preview tests cover deterministic engine composition, fixed synthetic scope/no effects, stale/partial suppression, scenario-correct explanations, DTO authority/secret minimisation, asset/publish allowlist, exact official-logo digest and escaping/CSP. CIGO CI builds and enforces the eight-test summary separately; existing mandatory count gates and PostgreSQL provisioning are preserved.

Browser acceptance covers 1440, 768 and 390 pixels across all seven views: no document overflow; contained tables; readable charts/cards; drawer navigation/focus trap; visible keyboard focus; native explanation dialogs/Escape/focus restoration; labelled selectors/search; scenarios; disabled execution; loading/empty/error and actual data-module failure. Browser requests remain GET/HEAD. Exact head, CI runs, deployment evidence and screenshots are recorded in the child PR and final handoff report.

Uncompressed published assets are bounded to 120 KB; combined gzip is tested below 25 KB. No external font/chart/UI framework, polling, duplicated fetch or provider connection is required. Static immutable Preview origins keep artifacts bound to a reviewed commit.

## Preview release and production separation

`vercel.json` builds only the synthetic static preview. Deploy only the child branch/exact reviewed SHA to Preview. Keep Deployment Protection enabled. Never promote this demo as a live authenticated production intelligence console, never attach production Business OS credentials, and never merge or self-approve existing remediation/integration PRs during this phase.

If creation of a dedicated project is blocked by platform permissions, record that response and use only separately isolated authorized test Preview infrastructure, or retain a local preview and mark hosted deployment BLOCKED. Do not modify Business OS production/project protection to work around access.

A future live UI needs independently reviewed server authentication/authorization, session-derived workspace identity, safe server-only projection of durable provenance and separately authorized production governance. Codex's engineering checks are not an independent human security review. Production effects, customer messages/calls, financial writes and R7 execution remain outside this phase.
