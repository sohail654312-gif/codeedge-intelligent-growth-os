import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  canonicalId,
  preservesHistory,
  promoteAssumption,
  validateTruthRecord,
  workspaceId,
} from "../dist/src/domain/truth/index.js";

const WS_A = workspaceId("workspace:a");
const WS_B = workspaceId("workspace:b");
const now = "2026-09-30T12:00:00.000Z";

function evidence(overrides = {}) {
  return {
    id: canonicalId("evidence:1"),
    workspaceId: WS_A,
    sourceSystem: "BUSINESS_OS",
    externalReference: "lead:123",
    observedAt: now,
    recordedAt: now,
    verification: "VERIFIED",
    ...overrides,
  };
}

function record(overrides = {}) {
  return {
    id: canonicalId("record:1"),
    workspaceId: WS_A,
    truthClass: "FACT",
    sourceSystem: "BUSINESS_OS",
    ownership: "EXTERNAL_OPERATIONAL",
    subjectRef: "lead:123",
    value: { status: "qualified" },
    evidence: [evidence()],
    lineage: [],
    createdAt: now,
    ...overrides,
  };
}

test("FACT requires provenance/evidence and verification", () => {
  const result = validateTruthRecord(record({ evidence: [] }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("FACT_EVIDENCE_REQUIRED"));
  assert.ok(result.errors.includes("FACT_VERIFICATION_REQUIRED"));
});

test("every canonical record requires workspace scope", () => {
  const result = validateTruthRecord(record({ workspaceId: "" }));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("WORKSPACE_REQUIRED"));
});

test("cross-workspace evidence and lineage are rejected", () => {
  const result = validateTruthRecord(
    record({
      truthClass: "ANALYSIS",
      sourceSystem: "CIGO",
      ownership: "CIGO_OWNED",
      evidence: [evidence({ workspaceId: WS_B })],
      lineage: [{ recordId: canonicalId("record:source"), workspaceId: WS_B }],
    }),
  );
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("CROSS_WORKSPACE_EVIDENCE"));
  assert.ok(result.errors.includes("CROSS_WORKSPACE_LINEAGE"));
});

test("Business OS and MVP records cannot be claimed as CIGO-owned", () => {
  for (const sourceSystem of ["BUSINESS_OS", "MVP"]) {
    const result = validateTruthRecord(
      record({ sourceSystem, ownership: "CIGO_OWNED" }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("INVALID_SOURCE_OWNERSHIP"));
  }
});

test("derived intelligence requires supporting evidence or lineage", () => {
  for (const truthClass of ["ANALYSIS", "PREDICTION", "RECOMMENDATION"]) {
    const result = validateTruthRecord(
      record({
        truthClass,
        sourceSystem: "CIGO",
        ownership: "CIGO_OWNED",
        evidence: [],
        lineage: [],
      }),
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("DERIVED_LINEAGE_REQUIRED"));
  }
});

test("decisions/actions require authority and system AI cannot self-approve", () => {
  for (const truthClass of ["DECISION", "ACTION"]) {
    const missing = validateTruthRecord(
      record({
        truthClass,
        sourceSystem: "CIGO",
        ownership: "CIGO_OWNED",
        evidence: [],
        authority: undefined,
      }),
    );
    assert.ok(missing.errors.includes("AUTHORITY_EVIDENCE_REQUIRED"));

    const selfApproved = validateTruthRecord(
      record({
        truthClass,
        sourceSystem: "CIGO",
        ownership: "CIGO_OWNED",
        evidence: [],
        authority: {
          actorId: "ai:strategist",
          actorType: "SYSTEM",
          approved: true,
          approvedAt: now,
          evidenceReference: "proposal:1",
        },
      }),
    );
    assert.ok(selfApproved.errors.includes("SYSTEM_CANNOT_SELF_APPROVE"));
  }
});

test("assumptions remain assumptions until verified evidence explicitly promotes them", () => {
  const assumption = record({
    truthClass: "ASSUMPTION",
    sourceSystem: "CIGO",
    ownership: "CIGO_OWNED",
    evidence: [],
  });

  assert.equal(validateTruthRecord(assumption).ok, true);
  assert.equal(assumption.truthClass, "ASSUMPTION");

  assert.throws(
    () =>
      promoteAssumption(assumption, [
        evidence({ verification: "UNVERIFIED" }),
      ]),
    /VERIFIED_EVIDENCE_REQUIRED/,
  );

  const promoted = promoteAssumption(assumption, [evidence()]);
  assert.equal(promoted.truthClass, "FACT");
  assert.equal(promoted.evidence[0].verification, "VERIFIED");
});

test("supersession preserves prior identity rather than destructively overwriting", () => {
  const previous = record({ id: canonicalId("record:old") });
  const next = record({
    id: canonicalId("record:new"),
    supersedes: previous.id,
  });

  assert.equal(preservesHistory(previous, next), true);
  assert.notEqual(previous.id, next.id);
});

test("domain kernel contains no direct provider implementations", () => {
  const root = path.resolve("src/domain/truth");
  const forbidden = ["Twilio", "Meta", "Vapi", "OpenAI", "Stripe", "ERPNext"];

  for (const file of fs.readdirSync(root).filter((name) => name.endsWith(".ts"))) {
    const source = fs.readFileSync(path.join(root, file), "utf8");
    for (const provider of forbidden) {
      assert.equal(
        source.includes(provider),
        false,
        `${file} directly references ${provider}`,
      );
    }
  }
});
