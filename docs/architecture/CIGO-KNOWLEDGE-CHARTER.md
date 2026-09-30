# CIGO Canonical Knowledge Charter

## Purpose

This file is the durable knowledge baseline for all CIGO autonomous builders and reviewers. It exists so automation does not depend on transient chat history.

On every run, CIGO automation must read:
1. `ops/STATE.json` — current machine state and task.
2. This file — durable product/architecture/strategy knowledge.
3. `ops/HANDOFF.md` — mirror only.
4. Only then inspect relevant repository evidence and reference repositories.

If this charter conflicts with newer repository evidence or an explicitly updated product constitution, preserve repository evidence and update the charter deliberately rather than silently ignoring the conflict.

---

## Product hierarchy and ownership

The Codeedge ecosystem is:

**Codeedge MVP → Codeedge Business OS → CIGO**

### Codeedge MVP
Permanent protected core and pilot foundation. It provides proven patterns for authentication, SSR, tenancy, RLS, grounded AI, MFA, SQL/testing/CI and essential pilot capability.

CIGO must never destructively modify the MVP.

### Codeedge Business OS
The operational system of record. It owns operational workflows and execution, including:
- CRM
- leads
- customers
- conversations
- Website Chat
- WhatsApp
- email
- SMS
- bookings/appointments
- AI Voice / AI Receptionist execution
- operational automation
- finance operations
- provider execution
- provider adapters

CIGO must not duplicate or seize ownership of these operational capabilities.

### CIGO
The intelligence, memory, decision-support, planning and controlled-orchestration layer. It owns:
- business intelligence
- cross-domain analysis
- business memory
- growth intelligence
- recommendation generation
- decision support
- planning and goals
- strategic insights
- controlled orchestration
- outcome learning

CIGO is not another CRM, booking system, messaging platform, accounting ledger or generic chatbot.

---

## Core operating loop

CIGO follows:

**Observe → Structure → Understand → Recommend → Obtain Authority → Act → Record Evidence → Learn**

The system must preserve provenance and evidence throughout this loop.

---

## Business truth model

CIGO explicitly distinguishes:

- FACT
- ASSUMPTION
- ANALYSIS
- PREDICTION
- RECOMMENDATION
- DECISION
- ACTION

AI assumptions must never silently become business truth.

Facts require evidence/provenance. Analysis, predictions and recommendations must remain grounded in evidence or lineage. Decisions and actions must preserve authority evidence.

---

## Sensitive action rule

The default path for sensitive actions is:

**AI Proposal → Policy Check → Human Approval → Authorized Action → Audit Evidence**

Low-risk autonomy may exist only when separately authorized by policy.

The system must never self-approve sensitive actions simply because an AI/system actor generated them.

---

## Multi-tenant rule

Every client receives a dedicated workspace.

Strict separation is required for:
- data
- knowledge
- prompts
- tools
- conversations
- memory
- automations
- recommendations
- decisions
- action evidence

Cross-workspace evidence, lineage or operational references must be rejected.

---

## Provider-neutral architecture

Provider-specific services remain replaceable behind Codeedge-controlled interfaces.

Preferred pattern:

**Domain Service → Provider Interface → Provider Adapter**

No direct provider calls from core CIGO intelligence or generic automation logic.

This applies to providers such as:
- OpenAI
- Gemini
- Vapi
- Twilio
- Meta
- Stripe
- ERPNext
- Twenty
- Chatwoot
- Trigger.dev
- future providers

Provider SDK/API implementation must remain isolated behind adapters.

---

## Business OS integration rule

CIGO may read authorized projections, APIs, events, read models or provider-neutral contracts from Business OS.

It must not:
- mutate Business OS schema directly
- write into protected operational stores
- replace operational ownership
- bypass Business OS authority/policy rules
- duplicate CRM/bookings/communications/finance operations

Operational source records from Business OS/MVP remain externally owned operational truth.

---

## Permanent Demo / Sandbox requirement

CIGO must support permanent deterministic Demo/Sandbox operation using the same contracts as production.

Expected seeded demo contexts include service businesses such as:
- clinic
- trades / plumbing

Demo data may include:
- fake leads
- bookings
- invoices
- bank transactions
- reports
- automation simulations
- AI conversations
- fake/test provider adapters

Demo/Sandbox mode is a permanent product capability, not a temporary development hack.

---

## AI employee / client instance model

Codeedge commercial architecture treats AI roles as dedicated client-configured AI employees, such as:
- AI Receptionist
- AI Sales
- AI Support
- AI Accountant
- future specialist agents

Templates may be reused internally, but each client workspace must present and enforce a dedicated configuration and strict separation.

The AI Voice Agent / AI Receptionist integration point is mandatory and must remain reserved in architecture even when implementation is deferred.

---

## Strategy-source guidance

Verified Library strategy sources available to CIGO automation when file/library access is available:
- `Codeedge_Volume_III_Business_Strategy_Edition_300p.pdf`
- `Codeedge_Volume_III_English_Strategist_Edition_360p.pdf`
- `Codeedge_Volume_III_Urdu_Strategist_Edition_360p.pdf`

Search these exact Library filenames when strategy-book evidence is materially relevant to the current task. Do not require reading all 300/360 pages for every run; retrieve only the relevant sections.

Use the Codeedge strategy books when accessible, including:
- the 300-page Business Strategist / business-strategy material
- the 360-page advanced / ultra Strategist material
- English/Urdu variants when available

Do not rely on chat-memory alone. When the source books are accessible through files/library/connectors, inspect only the portions materially relevant to the current task.

Durable strategy principles already distilled from those materials:
- premium managed growth relationship, not commodity feature selling
- narrow/focused execution before uncontrolled expansion
- trust before speed/scale
- evidence before excitement
- owner control and understandable authority
- business journey:
  **Get Found → Get Contacted → Convert → Serve → Get Paid → Retain & Grow**
- marketing must connect to commercial outcomes
- finance awareness must be understandable to the owner
- use bounded measurable experiments
- prefer practical, reversible staged improvement
- expose provenance, confidence, assumptions and trade-offs
- quality/reputation over feature count
- recommendations should connect actions to measurable outcomes
- learning should capture what changed after an approved action

---

## Finance-suite reference rules

`sohail654312-gif/finance-suite` is read-only reference material for accounting-domain architecture, controls, audit, reconciliation, ledger thinking and human approval.

CIGO must not copy it wholesale or assume stack/licensing compatibility.

Critical finance safety principle:
**AI must never silently post or finalize sensitive finance actions.**
Use proposal → approval → authorized execution → audit evidence.

---

## Public journey / website reference

`sohail654312-gif/codeedge-website` is a read-only source for public positioning, service taxonomy, UX/SEO language and customer-journey framing.

It is never canonical operational truth.

The public journey language to preserve where useful is:
**Get Found → Get Contacted → Convert → Serve → Get Paid → Retain & Grow**

---

## Reference repository map

All references below are read-only:

### `sohail654312-gif/codeedge-business-os`
Primary source for:
- operational ownership boundaries
- workspace/tenant patterns
- CRM/comms/bookings/voice
- automation engine
- execution modes
- External Effect Policy
- provider-neutral adapters
- finance interfaces
- schema/migration discipline
- audit/remediation patterns
- demo/sandbox/production behavior

### `sohail654312-gif/codeedge`
Use for:
- auth/SSR
- RLS
- tenancy
- grounded AI
- MFA
- SQL/testing/CI patterns
- pilot safety

### `sohail654312-gif/codeedge-website`
Use for:
- public positioning
- customer journey
- service taxonomy
- UX/SEO language

### `sohail654312-gif/finance-suite`
Use for:
- accounting controls
- audit
- reconciliation
- ledger/finance architecture
- human-approval principles

### `sohail654312-gif/beautifypk-redesign`
Use only for task-specific clinic UX/SEO/source-verification patterns.

### `sohail654312-gif/Preflow.demo`
Optional/unclassified until concrete files prove relevance.

---

## Writable repository boundary

Only this repository is writable for CIGO:

`sohail654312-gif/codeedge-intelligent-growth-os`

All CIGO code, tests, docs, SQL/migrations, schemas, CI, evidence, branches and PRs belong here.

Never mutate protected/reference repositories.

---

## 10-part build programme

1. Foundation / Product Boundary / Business Truth Architecture
2. Data Access / Integration / Evidence Layer
3. Business Memory / Knowledge Model
4. Intelligence / Analysis Engine
5. Recommendation / Decision Support Engine
6. Planning / Goals / Growth Orchestration
7. AI Strategist / Copilot Experience
8. Controlled Action & Business OS Integration
9. Security / Tenancy / Reliability / Audit / Evaluation
10. Demo / Pilot / Deployment / Completion

Normally use 2–4 substantial blocks per major part. Avoid micro-task proliferation.

---

## Architecture invariants

The following are non-negotiable unless explicitly changed in product governance:
- tenant isolation
- provenance
- source-of-truth preservation
- provider neutrality
- server-derived authority
- sandbox/demo parity
- safe failure
- observability
- auditability
- explicit failure ownership
- outcome learning
- reversible staged rollout where practical
- no hidden cross-workspace memory
- no silent assumption promotion
- no silent sensitive financial/action execution

---

## Build standard

Architecture-first / evidence-first:

**objective → targeted reference inspection → architecture → boundary/risk check → implementation → tests → verification → evidence → completion**

A block is not complete merely because:
- a document exists
- interfaces exist
- a plan exists
- partial code exists

When implementation is required, completion needs:
- executable implementation
- required docs
- deterministic tests
- typecheck/build where relevant
- verification evidence
- exact changed files and commit SHAs

---

## Autonomous builder protocol

Three staggered builders currently operate at approximately:
- Builder A: :05
- Builder B: :25
- Builder C: :45

They are identical workers, not independent competing developers.

Each run must:
1. read STATE
2. read this charter
3. inspect committed reality
4. reconcile stale state
5. repair previous errors first
6. continue only remaining work
7. test/verify
8. record evidence
9. update STATE first
10. mirror HANDOFF second
11. advance when safe

Use a fresh lock to prevent conflicting builders. A fresh lock must not be overwritten.

---

## State authority

`ops/STATE.json` is the workflow authority.

`ops/HANDOFF.md` is mirror-only.

Repository evidence may prove STATE stale. When that happens:
- reconcile STATE to committed reality
- never erase committed reality to match stale state

STATE must always be updated before HANDOFF.

If STATE update fails:
- do not modify HANDOFF
- do not fabricate progress
- report the blocker

---

## Three-attempt rule

Each CURRENT_TASK_ID may receive a maximum of three real execution attempts.

- Attempt 1: diagnose/build/repair/test
- Attempt 2: continue from evidence and make an informed correction
- Attempt 3: final bounded informed attempt

Never perform a fourth blind retry.

After an unsuccessful third attempt:
- mark the task `DEFERRED_INCOMPLETE`
- create a factual deferred review under `ops/deferred/`
- record all three attempts and exact blocker
- add it to deferred backlog
- move only to the next independently workable substantial block

CIGO cannot be declared 100% complete while unresolved deferred items remain unless they are explicitly accepted out-of-scope or otherwise formally dispositioned with evidence.

---

## Infrastructure caveat

GitHub Actions has recently shown failures before runner assignment. Treat these as external CI infrastructure warnings unless a workflow actually reaches repository commands and reports a code/test failure.

Do not misclassify external runner/quota/platform failure as a CIGO code defect.

---

## Cost / external-service rule

Do not initiate paid external infrastructure, purchases, subscriptions or usage that creates material spend without explicit user authorization.

Prefer existing connected resources and provider-neutral architecture.

---

## Deployment/runtime constraints

The user cannot rely on a large local Docker installation for development workflows. Prefer hosted/cloud-compatible paths and lightweight deterministic testing where practical.

Do not weaken production-readiness requirements merely to avoid Docker.

---

## Completion philosophy

CIGO should become a durable business-intelligence operating layer that:
- remembers the business
- understands evidence
- produces grounded recommendations
- keeps the owner in control
- safely orchestrates approved actions
- records what happened
- learns from measurable outcomes

Speed is desirable, but never at the cost of tenancy, evidence, auditability, authority or correctness.
