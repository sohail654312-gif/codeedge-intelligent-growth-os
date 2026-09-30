# Canonical Domain Model

## Boundary
CIGO is the intelligence layer above operational systems. Business OS remains authoritative for leads, customers, conversations, bookings, voice, finance operations, operational automations and provider execution. CIGO references those records and does not acquire operational ownership.

## Identity, tenancy and ownership
Every canonical record has an immutable ID and workspace ID. Workspace is the isolation boundary. Evidence and lineage must match it. BUSINESS_OS and MVP sources require EXTERNAL_OPERATIONAL ownership; CIGO intelligence uses CIGO_OWNED. External identifiers remain references rather than CIGO operational keys.

## Truth classes
FACT is a verified observation backed by provenance. ASSUMPTION is unconfirmed and AI output stays here until evidence confirms it. ANALYSIS interprets evidence. PREDICTION forecasts with lineage/confidence. RECOMMENDATION proposes a course. DECISION is an authorized choice. ACTION records authorized execution; AI generation alone is never approval.

## Provenance, lineage and supersession
Evidence records source, external reference, observed/recorded timestamps and verification. Derived intelligence retains evidence or lineage. Corrections create a new canonical ID with supersedes pointing to the prior ID; destructive overwrite is not canonical.

## Read/write authority and failure semantics
CIGO may read permitted operational projections and write CIGO intelligence. Operational effects must later flow through contracts/adapters and controlled authorization, never direct protected-store mutation. Validation explicitly rejects missing tenancy, cross-workspace evidence/lineage, invalid source ownership, unsupported facts, ungrounded derived intelligence and unauthorized decisions/actions.

## Customer journey examples
Get Found: verified search visibility is FACT while an explanation is ANALYSIS. Get Contacted: a Business OS lead stays externally owned. Convert: likelihood is PREDICTION. Serve: an improvement idea is RECOMMENDATION. Get Paid: an invoice stays Business OS-owned. Retain & Grow: a retention plan becomes DECISION only with authority evidence.

## Reference patterns used
Borrowed conceptually from Business OS: workspace-scoped operational ownership, provider-neutral boundaries, controlled execution/evidence and separation of domain intent from provider adapters. Borrowed conceptually from MVP: strict tenant isolation and testable cross-tenant rejection. Deliberately not copied: CRM, booking, conversation, finance, automation, provider adapters, database schema, UI and deployment modules. No other reference repo is needed for this truth-boundary block.
