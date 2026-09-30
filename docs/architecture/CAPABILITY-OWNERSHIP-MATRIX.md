# CIGO Capability Ownership Matrix

**Purpose:** Define which Codeedge product owns each major capability and how CIGO may interact with it.

## 1. Core ownership rule

The Codeedge ecosystem contains three product layers:

**Codeedge MVP → Codeedge Business OS → CIGO**

Each layer has a different responsibility. Integration does not imply ownership transfer.

## 2. Product-layer responsibilities

### Codeedge MVP

The MVP is the protected permanent core and pilot foundation.

It owns or establishes protected patterns for:

- core authentication/session foundations;
- early workspace/tenant isolation;
- grounded AI communication patterns;
- protected owner/MFA patterns;
- foundational CRM/chat capability used by the pilot.

CIGO must not require destructive changes to the MVP.

### Codeedge Business OS

Business OS owns operational business workflows and system-of-record data, including:

- CRM, leads and customers;
- conversations/shared inbox;
- Website Chat;
- WhatsApp, Email and SMS operational communications;
- booking and appointments;
- AI Voice / AI Receptionist operational execution;
- operational automations;
- execution modes and external-effect policy;
- finance operations and finance-provider interfaces;
- provider adapters and execution;
- operational audit evidence.

### CIGO

CIGO owns:

- business evidence normalization;
- business memory;
- structured business knowledge;
- cross-domain intelligence;
- strategic analysis;
- predictions and confidence;
- recommendations;
- decision support;
- goals and planning;
- strategist/copilot experiences;
- controlled orchestration requests;
- learning from outcomes.

## 3. Capability matrix

| Capability | MVP | Business OS | CIGO | CIGO interaction rule |
|---|---|---|---|---|
| Authentication/session foundation | protected/reference | operational | no ownership | consume authorized identity/workspace context |
| Workspace/tenant boundary | protected pattern | operational authority | enforce internally | never trust arbitrary client tenant claims |
| Leads/customers/CRM | pilot/core | **owner** | intelligence only | read authorized projections/evidence; never become CRM system of record |
| Conversations/shared inbox | pilot/core | **owner** | analysis only | consume evidence/aggregates where authorized |
| Website Chat | pilot/core | **owner** | intelligence only | no direct visitor-session ownership |
| WhatsApp/Email/SMS execution | foundations | **owner** | no provider execution | request controlled effects through interfaces |
| Booking/appointments | no primary ownership | **owner** | analysis/recommendation | no direct booking-store mutation |
| AI Voice/Receptionist | reserved/partial | **owner** | strategic analysis/orchestration | provider-neutral controlled requests only |
| Operational automation | limited | **owner** | planning/orchestration | do not become the execution engine |
| Provider adapters | limited | **owner** | no direct provider ownership | use Business OS/provider interfaces |
| Finance operations | no primary ownership | **owner** | finance intelligence | consume authorized structured evidence |
| Accounting ledger | no | external/adapter-backed | no | never create shadow ledger unless later explicitly scoped |
| Business evidence/provenance | source evidence | source evidence | **owner of normalized intelligence evidence** | preserve origin and source authority |
| Business memory | limited | operational history | **owner** | store CIGO knowledge with provenance and tenancy |
| Cross-domain analysis | no | limited operational | **owner** | combine permitted evidence without moving operational ownership |
| Predictions | no | limited | **owner** | always explicit uncertainty/lineage |
| Recommendations | no | limited | **owner** | expose assumptions, confidence and trade-offs |
| Decisions | human/business process | operational effects | **decision record owner** | record authority; do not invent approval |
| Goals/plans | no | operational tasks may exist | **owner** | keep strategy separate from provider execution |
| Controlled action requests | no | **execution owner** | **orchestration intent owner** | CIGO proposes/authorizes request; Business OS executes |
| Outcome learning | limited | source outcomes | **owner** | link later evidence to recommendation/decision/action chain |
| Demo/Sandbox | protected demo patterns | **operational demo owner** | **intelligence demo parity** | same CIGO truth/authority rules with demo adapters |

## 4. Source-of-truth rule

Operational records remain authoritative in the system that owns them.

A CIGO reference to an external operational record must preserve:

- source system;
- external identifier/reference;
- workspace;
- observation timestamp;
- record timestamp;
- verification status;
- ownership classification.

CIGO may enrich, analyze or link the record, but it must not silently claim that the operational record became CIGO-owned.

## 5. Read authority

CIGO may read only data made available through an authorized boundary such as:

- API contract;
- provider-neutral adapter;
- event;
- read model;
- export/projection;
- approved integration interface.

The preferred pattern for operational systems is read-only or least-privilege access unless a later controlled-action contract explicitly requires otherwise.

## 6. Write authority

CIGO may directly write only CIGO-owned artifacts such as:

- evidence normalization metadata;
- memory/knowledge;
- analysis;
- predictions;
- recommendations;
- goals/plans;
- decision records;
- orchestration intents;
- outcome-learning records.

Operational effects belong behind controlled execution interfaces.

## 7. Controlled action boundary

For an effect that changes an operational system:

1. CIGO creates a proposal or orchestration intent.
2. Policy checks validate scope, tenant, safety and required approval.
3. Required human or policy authority is captured.
4. Business OS/provider execution performs the operational effect.
5. Result evidence returns to CIGO.
6. CIGO links the result to the originating proposal/decision/action.

CIGO never bypasses this chain by writing directly into protected operational stores.

## 8. Finance boundary

Business OS owns operational finance integration and AI Accountant execution contracts.

CIGO may reason over structured finance evidence to assess:

- revenue;
- cost;
- cash;
- margin;
- receivables/payables;
- capacity;
- trends;
- financial implications of growth decisions.

CIGO must not silently post accounting entries or build a duplicate accounting system.

## 9. Provider-neutral boundary

CIGO must not couple strategic domain logic directly to Twilio, Meta, Vapi, OpenAI, Stripe, ERPNext or any other replaceable provider.

Provider-specific code belongs behind replaceable interfaces/adapters in the appropriate execution layer.

## 10. Failure ownership

Every failed recommendation, integration read, approval request or action must make clear:

- which layer failed;
- whether operational truth was affected;
- whether CIGO state is partial or stale;
- whether retry is safe;
- what evidence exists.

A failure in CIGO intelligence must not be misrepresented as an operational system failure, and vice versa.

## 11. Change rule

This ownership matrix is frozen as a Part 1 architecture baseline.

Later parts may extend contracts and entities, but any change that moves capability ownership between MVP, Business OS and CIGO requires explicit architecture evidence and a deliberate update to this matrix.
