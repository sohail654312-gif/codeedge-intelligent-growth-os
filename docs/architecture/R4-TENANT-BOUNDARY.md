# R4L tenant-bound PostgreSQL boundary — disposable acceptance design

This is a scoped disposable PostgreSQL proof, **not production identity integration**.

1. A trusted server resolver authenticates the actor and reads authoritative, current membership. The caller supplies only a target workspace and records; it cannot supply the actor or membership proof. A synthetic identity fixture is opt-in and refuses production mode.
2. The server-only `TrustedTenantPoolResolver` maps an already-authorized workspace to a distinct **server-held database credential**. Never construct this mapping from caller-supplied connection strings or expose credentials to client code.
3. Each database login role is non-owner, non-superuser, NOBYPASSRLS, with no membership in other tenant roles. Owner-created RLS policies pin the role to a literal workspace. No GUC or caller-set SET ROLE can change that policy. The unprovisioned generic application role continues to fail closed.
4. `PostgresEvidenceStore` checks the bound workspace before acquiring a connection for reads, writes and reconciliation. The database independently enforces RLS on SELECT and INSERT, including FORCE RLS. Atomic intake and audit writes remain in SERIALIZABLE transactions. The application has no UPDATE/DELETE/TRUNCATE grants.
5. Disposable fixture SQL provisions two synthetic roles only. It is deliberately separate from the fail-closed reference migration; it is not a generic provisioning/migration strategy for production. Provisioning, credential rotation, role lifecycle, least-privilege operational administration and actual provider auth require independent review and owner-approved implementation.

Threats explicitly denied: caller-forged actor/membership, cross-tenant records, unauthorized workspace-to-pool resolution, direct SQL cross-tenant reads/inserts, pooled connection state bleed (role is fixed by credential rather than mutable session state), revoked membership on subsequent intake. Existing pooled connections are not a revocation mechanism: every new intake must recheck membership; an in-flight transaction after revocation is a separate production policy decision.

Remaining independent acceptance: concurrent revoke race, deterministic concurrency/recovery, restoration, actual deployment security, source authenticity, and independent G6 signoff. Do not interpret synthetic credentials or successful CI as production authorization.
