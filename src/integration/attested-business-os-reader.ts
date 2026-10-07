import type { WorkspaceId } from "../domain/truth/types.js";
import type { OperationalRecord, ReadResult } from "./contracts.js";
import type { SourceReader } from "./source-reader.js";
import type { PgPool } from "../evidence/postgres-evidence-store.js";
import type { SourceAttestation, TrustedSourceAuthority } from "../evidence/source-attestation.js";
import { requireAttestedObservation } from "../evidence/source-attestation.js";
import { fingerprintOperationalRecord } from "../evidence/fingerprint.js";
import { fingerprintReadPage } from "../evidence/read-page-fingerprint.js";
import { stableSerialize } from "../evidence/normalize.js";
import { createBusinessOsHttpReaderFromEnvironment } from "./business-os-http-adapter.js";

const ADAPTER_ID = "business-os-http-read-model:v1";
const fail = (): never => { throw Error("UNTRUSTED_SOURCE_PROVENANCE"); };

/** Server composition only. No caller registration API, incoming authority flag or supplied reader.
 * The pool must be a server-selected tenant/issuer pool with reviewed receipt RLS and grants.
 * Separate verifier processes may use createPostgresSourceAuthority with SELECT-only access. */
export function createAttestedBusinessOsHttpReader(input:
  Parameters<typeof createBusinessOsHttpReaderFromEnvironment>[0] & Readonly<{
    receiptPool: PgPool;
    receiptNow?: () => number;
    receiptTtlMs?: number;
  }>,
) {
  const { receiptPool, receiptNow = Date.now, receiptTtlMs = 900_000, ...readerInput } = input;
  if (!receiptPool || !Number.isSafeInteger(receiptTtlMs) || receiptTtlMs < 1000 || receiptTtlMs > 86_400_000) fail();
  const source = createBusinessOsHttpReaderFromEnvironment(readerInput);
  const authority = createPostgresSourceAuthority(receiptPool, input.workspaceId, receiptNow);
  // Object capabilities issued only by this instance's authenticated/validated HTTP read.
  const issuedPages = new WeakMap<ReadResult, readonly SourceAttestation[]>();
  const reader: SourceReader = {
    sourceSystem: "BUSINESS_OS",
    async read(request) {
      const page = await source.read(request);
      if (page.completeness !== "COMPLETE" || page.errors.length || !page.records.length) return page;
      const snapshot = structuredClone(page);
      try {
        const fingerprints = await Promise.all(snapshot.records.map(fingerprintOperationalRecord));
        const pageFingerprint = await fingerprintReadPage(snapshot);
        const expiresAt = new Date(receiptNow() + receiptTtlMs).toISOString();
        const receipts: SourceAttestation[] = snapshot.records.map((record, i) => ({
          workspaceId: record.workspaceId, sourceSystem: record.reference.sourceSystem,
          externalReference: record.reference.externalReference, fingerprint: fingerprints[i],
          fetchedAt: snapshot.fetchedAt, adapterId: ADAPTER_ID, receiptId: crypto.randomUUID(),
          pageFingerprint, expiresAt,
        }));
        // Validate every member and reject duplicates/conflicts before touching durable state.
        const identities = new Set<string>();
        for (const record of snapshot.records) {
          const identity = stableSerialize([record.reference.sourceSystem, record.reference.externalReference,
            record.resourceKind, record.reference.version]);
          if (identities.has(identity)) fail();
          identities.add(identity);
        }
        const client = await receiptPool.connect();
        try {
          await client.query("BEGIN");
          await client.query("SET LOCAL statement_timeout='4000ms'");
          await client.query("SET LOCAL lock_timeout='2000ms'");
          for (let i = 0; i < receipts.length; i++) {
            const record = snapshot.records[i], receipt = receipts[i];
            const scope = [input.workspaceId, ADAPTER_ID, record.reference.sourceSystem,
              record.reference.externalReference, record.resourceKind, record.reference.version];
            await client.query(`INSERT INTO cigo.source_observation_identities
              (workspace_id,adapter_id,source_system,external_reference,resource_kind,source_version,fingerprint)
              VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`, [...scope, receipt.fingerprint]);
            const identity = await client.query<{ fingerprint: string }>(`SELECT fingerprint FROM cigo.source_observation_identities
              WHERE workspace_id=$1 AND adapter_id=$2 AND source_system=$3 AND external_reference=$4
              AND resource_kind=$5 AND source_version=$6`, scope);
            if (identity.rows.length !== 1 || identity.rows[0].fingerprint !== receipt.fingerprint) fail();
            await client.query(`INSERT INTO cigo.source_receipts
              (workspace_id,receipt_id,attestation,expires_at) VALUES ($1,$2,$3::jsonb,$4)`,
              [input.workspaceId, receipt.receiptId, JSON.stringify(receipt), receipt.expiresAt]);
          }
          await client.query("COMMIT");
        } catch {
          try { await client.query("ROLLBACK"); } catch { /* no receipt escapes an ambiguous commit */ }
          fail();
        } finally { client.release(); }
        issuedPages.set(page, receipts);
        return page;
      } catch {
        return { records: [], fetchedAt: page.fetchedAt, completeness: "PARTIAL", errors: [{
          code: "SOURCE_ATTESTATION_UNAVAILABLE", message: "Trusted source receipt unavailable", retryable: false,
        }] };
      }
    },
  };
  return Object.freeze({
    reader, authority,
    /** Returns the server-created receipt only for an exact page issued by this reader. */
    async attestationFor(page: ReadResult, record: OperationalRecord): Promise<SourceAttestation> {
      const receipts = issuedPages.get(page);
      if (!receipts) return fail();
      const fingerprint = await fingerprintOperationalRecord(structuredClone(record));
      const receipt = receipts.find(item => item.fingerprint === fingerprint);
      if (!receipt) return fail();
      return requireAttestedObservation(record, page, receipt, authority);
    },
  });
}

/** No registration method: verification re-reads exact durable state and append-only revocations.
 * Repeated verification is idempotent; a receipt has no action/approval authority. */
export function createPostgresSourceAuthority(pool: PgPool, workspaceId: WorkspaceId,
  now: () => number = Date.now): TrustedSourceAuthority {
  return Object.freeze({
    async verifyReceipt(attestation: SourceAttestation): Promise<boolean> {
      let client;
      try {
        const receipt = structuredClone(attestation);
        if (receipt.workspaceId !== workspaceId || receipt.sourceSystem !== "BUSINESS_OS" ||
          receipt.adapterId !== ADAPTER_ID || !receipt.pageFingerprint || !receipt.expiresAt ||
          !Number.isFinite(Date.parse(receipt.expiresAt)) || Date.parse(receipt.expiresAt) <= now()) return false;
        client = await pool.connect();
        const result = await client.query<{ attestation: unknown }>(`SELECT r.attestation FROM cigo.source_receipts r
          WHERE r.workspace_id=$1 AND r.receipt_id=$2 AND r.expires_at > clock_timestamp()
          AND NOT EXISTS (SELECT 1 FROM cigo.source_receipt_revocations v
            WHERE v.workspace_id=r.workspace_id AND v.receipt_id=r.receipt_id)`, [workspaceId, receipt.receiptId]);
        return result.rows.length === 1 && stableSerialize(result.rows[0].attestation) === stableSerialize(receipt);
      } catch { return false; } finally { client?.release(); }
    },
  });
}
