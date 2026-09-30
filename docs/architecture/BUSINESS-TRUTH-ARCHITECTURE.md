# Business Truth Architecture

## Purpose and lifecycle
CIGO separates what a business knows from what AI infers, recommends, decides or executes. The lifecycle is Observe → Structure → Understand → Recommend → Obtain Authority → Act → Record Evidence → Learn.

## Truth and provenance
Evidence includes source, external reference, timestamps, verification and workspace. FACT requires verified evidence. ASSUMPTION remains explicitly unverified. ANALYSIS, PREDICTION and RECOMMENDATION retain lineage/evidence and may carry confidence. Confidence never replaces verification. DECISION and ACTION require authority metadata.

## Tenant and source-of-truth boundaries
Workspace is mandatory on canonical records, evidence and lineage; cross-workspace links are invalid. Future APIs must derive workspace authority server-side. Operational truth remains in Business OS/MVP. CIGO owns intelligence and decision-support artifacts, not operational objects. Provider implementations stay outside this kernel.

## Human authority
AI may create analysis, predictions, recommendations and proposals. It cannot self-approve sensitive decisions/actions. Authority records actor, approval state/time and evidence reference. Separately authorized low-risk policies may be added later outside this kernel.

## History, failure and sandbox parity
Corrections append/supersede rather than destructively overwrite. Validation returns explicit error codes and never silently changes truth class or ownership. Demo and production use the same tenancy, provenance, lineage and authority rules.

## Journey example
A verified Business OS lead-status event is FACT and externally owned. CIGO derives ANALYSIS, produces a RECOMMENDATION, obtains a human DECISION and later records ACTION/evidence through a controlled integration layer. Every stage remains workspace-scoped and traceable.
