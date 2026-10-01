import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { workspaceId, canonicalId, requiredOwnership, validateTruthRecord } from "../dist/src/domain/truth/index.js";
import { InMemorySourceReader, validateReadRequest } from "../dist/src/integration/index.js";
import { validateOperationalRecord } from "../dist/src/evidence/validation.js";
import { fingerprintOperationalRecord } from "../dist/src/evidence/fingerprint.js";
import { normalizeOperationalRecord, stableSerialize } from "../dist/src/evidence/normalize.js";

const A = workspaceId("workspace:a");
const B = workspaceId("workspace:b");
const NOW = "2026-10-01T00:00:00.000Z";
const context = (workspace = A) => ({ workspaceId: workspace, actorId: "human:owner", authorizedAt: NOW });
const request = (overrides = {}) => ({ context: context(), sourceSystem: "BUSINESS_OS", resourceKind: "lead", ...overrides });
const record = (overrides = {}) => ({
  workspaceId: A,
  reference: { sourceSystem: "BUSINESS_OS", externalReference: "lead:1", version: "1" },
  resourceKind: "lead",
  value: { status: "new", metrics: { z: 2, a: 1 } },
  observedAt: NOW,
  ...overrides,
});
const reader = (rows, workspace = A, source = "BUSINESS_OS") =>
  new InMemorySourceReader(source, workspace, rows, () => NOW);
const codes = (result) => result.errors.map((error) => error.code);

test("request validation rejects missing server workspace, actor, timestamp, source and kind", () => {
  const invalid = validateReadRequest({ context: { workspaceId: "", actorId: "", authorizedAt: "" }, sourceSystem: "", resourceKind: "", limit: 0 });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors.length, 6);
});

test("reader fails closed for missing context and wrong source or workspace", async () => {
  const source = reader([record()]);
  const missing = await source.read(request({ context: undefined }));
  assert.equal(missing.completeness, "PARTIAL");
  assert.deepEqual(missing.records, []);
  assert.ok(codes(missing).includes("INVALID_READ_REQUEST"));
  for (const invalidRequest of [request({ context: context(B) }), request({ sourceSystem: "MVP" })]) {
    const result = await source.read(invalidRequest);
    assert.equal(result.completeness, "PARTIAL");
    assert.equal(result.records.length, 0);
    assert.ok(codes(result).some((code) => code.endsWith("SCOPE_MISMATCH")));
  }
});

test("record validation rejects absent provenance and foreign tenant", () => {
  const missing = validateOperationalRecord(record({ reference: { sourceSystem: "", externalReference: " " } }), context());
  assert.deepEqual(missing.errors, ["SOURCE_SYSTEM_REQUIRED", "EXTERNAL_REFERENCE_REQUIRED"]);
  assert.ok(validateOperationalRecord(record({ workspaceId: B }), context()).errors.includes("CROSS_WORKSPACE_RECORD"));
  assert.ok(validateOperationalRecord(record({ observedAt: "" }), context()).errors.includes("OBSERVED_AT_REQUIRED"));
});

test("invalid, foreign and incorrectly sourced seeds are quarantined as PARTIAL, without values leaking", async () => {
  const foreign = record({ workspaceId: B, value: { secret: "never-return" } });
  const invalid = record({ reference: { sourceSystem: "BUSINESS_OS", externalReference: "  " } });
  const wrongSource = record({ reference: { sourceSystem: "MVP", externalReference: "lead:3" } });
  const result = await reader([record(), foreign, invalid, wrongSource]).read(request());
  assert.equal(result.completeness, "PARTIAL");
  assert.equal(result.records.length, 1);
  assert.ok(codes(result).includes("CROSS_WORKSPACE_RECORD"));
  assert.ok(codes(result).includes("EXTERNAL_REFERENCE_REQUIRED"));
  assert.ok(codes(result).includes("SOURCE_SCOPE_MISMATCH"));
  assert.ok(result.errors.every((error) => !JSON.stringify(error).includes("never-return")));
  assert.ok(!JSON.stringify(result).includes("never-return"));
  assert.equal(result.fetchedAt, NOW);
});

test("pagination is bounded, deterministic and never bypasses tenant validation", async () => {
  const source = reader([record(), record({ reference: { sourceSystem: "BUSINESS_OS", externalReference: "lead:2" } })]);
  const first = await source.read(request({ limit: 1 }));
  assert.equal(first.completeness, "COMPLETE");
  assert.equal(first.records.length, 1);
  assert.equal(first.nextCursor, "1");
  const second = await source.read(request({ cursor: first.nextCursor, limit: 1 }));
  assert.equal(second.records[0].reference.externalReference, "lead:2");
  assert.equal(second.nextCursor, undefined);
  for (const invalid of [{ limit: 101 }, { cursor: "../../other" }, { cursor: "999" }]) {
    const result = await source.read(request(invalid));
    assert.equal(result.completeness, "PARTIAL");
    assert.equal(result.records.length, 0);
  }
  assert.deepEqual((await source.read(request({ context: context(B), cursor: "1" }))).records, []);
});

test("seed and returned-record mutation cannot change the in-memory projection", async () => {
  const seed = record();
  const source = reader([seed]);
  seed.value.status = "modified";
  const a = await source.read(request());
  a.records[0].value.status = "tampered";
  const b = await source.read(request());
  assert.equal(b.records[0].value.status, "new");
});

test("canonical fingerprints are stable across key order, but change for version/value/context/time", async () => {
  const initial = record();
  const reordered = record({ value: { metrics: { a: 1, z: 2 }, status: "new" } });
  const original = await fingerprintOperationalRecord(initial);
  assert.match(original, /^cigo:observation:v1:[a-f0-9]{64}$/);
  assert.equal(await fingerprintOperationalRecord(reordered), original);
  assert.equal(stableSerialize(normalizeOperationalRecord(reordered)), stableSerialize(normalizeOperationalRecord(initial)));
  for (const changed of [
    record({ reference: { sourceSystem: "BUSINESS_OS", externalReference: "lead:1", version: "2" } }),
    record({ value: { status: "qualified", metrics: { z: 2, a: 1 } } }),
    record({ workspaceId: B }),
    record({ observedAt: "2026-10-01T00:01:00.000Z" }),
  ]) assert.notEqual(await fingerprintOperationalRecord(changed), original);
  assert.equal(initial.value.status, "new");
});

test("demo contract matches a live-shaped read-only SourceReader response", async () => {
  const seed = record();
  const liveShapedReader = { sourceSystem: "BUSINESS_OS", async read(input) {
    assert.equal(input.context.workspaceId, A);
    return { records: [structuredClone(seed)], fetchedAt: NOW, completeness: "COMPLETE", errors: [] };
  } };
  const demoReader = reader([seed]);
  for (const source of [demoReader, liveShapedReader]) {
    const result = await source.read(request());
    assert.equal(result.completeness, "COMPLETE");
    assert.equal(validateOperationalRecord(result.records[0], context()).ok, true);
    assert.equal(await fingerprintOperationalRecord(result.records[0]), await fingerprintOperationalRecord(seed));
  }
});

test("ingestion does not transfer Business OS ownership or grant action approval", () => {
  assert.equal(requiredOwnership("BUSINESS_OS"), "EXTERNAL_OPERATIONAL");
  const base = {
    id: canonicalId("record:ingested"), workspaceId: A, truthClass: "FACT", sourceSystem: "BUSINESS_OS",
    ownership: "CIGO_OWNED", subjectRef: "lead:1", value: {}, evidence: [], lineage: [], createdAt: NOW,
  };
  assert.ok(validateTruthRecord(base).errors.includes("INVALID_SOURCE_OWNERSHIP"));
  const unauthorized = { ...base, truthClass: "ACTION", sourceSystem: "CIGO", ownership: "CIGO_OWNED",
    authority: { actorId: "ai:agent", actorType: "SYSTEM", approved: true, evidenceReference: "proposal:1" } };
  assert.ok(validateTruthRecord(unauthorized).errors.includes("SYSTEM_CANNOT_SELF_APPROVE"));
});

test("integration/evidence kernel contains no direct external provider imports", () => {
  for (const directory of ["src/integration", "src/evidence"]) {
    for (const filename of fs.readdirSync(directory).filter((name) => name.endsWith(".ts"))) {
      const source = fs.readFileSync(path.join(directory, filename), "utf8");
      assert.ok(!/\bfrom\s+["'](?:@(?:twilio|stripe|openai)\/|(?:twilio|stripe|openai|vapi|erpnext))/.test(source), filename);
    }
  }
});
