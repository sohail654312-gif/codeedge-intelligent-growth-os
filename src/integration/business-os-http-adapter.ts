import type { WorkspaceId } from "../domain/truth/types.js";
import { validateOperationalRecord } from "../evidence/validation.js";
import type { OperationalRecord } from "./contracts.js";
import {
  BusinessOsReadModelReader,
  type BusinessOsReadModelPort,
  type TrustedReadAuthorization,
} from "./business-os-read-model.js";

const CONTRACT_VERSION = "codeedge-business-os-read-model:v1";
const SOURCE_SYSTEM = "BUSINESS_OS";
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_RETRIES = 1;
const responseEncoder = new TextEncoder();
const allowedResourceKinds = new Set([
  "business_profile",
  "service",
  "lead",
  "customer",
  "crm_activity",
  "booking",
  "inbox_summary",
  "finance_summary",
]);

type FetchLike = typeof fetch;
type Sleep = (milliseconds: number) => Promise<void>;

function runtimeEnvironment(): Record<string, string | undefined> {
  const runtime = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return runtime.process?.env ?? {};
}

type ServerReaderConfig = Readonly<{
  baseUrl: string;
  keyId: string;
  secret: string;
  resourceKinds: readonly string[];
  timeoutMs: number;
  retries: number;
}>;

type BusinessOsEnvelope = Readonly<{
  contractVersion: string;
  sourceSystem: string;
  workspaceId: string;
  resourceKind: string;
  observedAt: string;
  records: readonly OperationalRecord[];
  pagination: Readonly<{ nextCursor?: string }>;
  completeness: "COMPLETE" | "PARTIAL";
  errors: readonly Readonly<{ code: string; message: string; retryable: boolean }>[];
}>;

export type BusinessOsHttpAdapterDependencies = Readonly<{
  fetch?: FetchLike;
  sleep?: Sleep;
}>;

function genericError(): never {
  throw new Error("BUSINESS_OS_READ_UNAVAILABLE");
}

function exactIso(value: unknown): value is string {
  return typeof value === "string"
    && Number.isFinite(Date.parse(value))
    && new Date(value).toISOString() === value;
}

function safeBaseUrl(value: unknown) {
  if (typeof value !== "string" || !value || value.length > 2048) genericError();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return genericError();
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || !["", "/"].includes(url.pathname)
    || (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  ) genericError();
  return url.origin;
}

function boundedInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
) {
  const chosen = value === undefined ? fallback : value;
  if (!Number.isSafeInteger(chosen) || Number(chosen) < minimum || Number(chosen) > maximum) {
    genericError();
  }
  return Number(chosen);
}

function parseServerConfig(
  workspaceId: WorkspaceId,
  raw: string | undefined,
): ServerReaderConfig {
  if (!raw || !workspaceId) genericError();
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return genericError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) genericError();
  const entry = (parsed as Record<string, unknown>)[workspaceId];
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) genericError();
  const config = entry as Record<string, unknown>;
  if (
    typeof config.keyId !== "string"
    || !/^[A-Za-z0-9_-]{1,64}$/.test(config.keyId)
    || typeof config.secret !== "string"
    || config.secret.length < 32
    || !Array.isArray(config.resourceKinds)
    || config.resourceKinds.length < 1
    || config.resourceKinds.length > allowedResourceKinds.size
    || !config.resourceKinds.every((kind) => (
      typeof kind === "string" && allowedResourceKinds.has(kind)
    ))
    || new Set(config.resourceKinds).size !== config.resourceKinds.length
  ) genericError();

  return Object.freeze({
    baseUrl: safeBaseUrl(config.baseUrl),
    keyId: config.keyId,
    secret: config.secret,
    resourceKinds: Object.freeze([...config.resourceKinds] as string[]),
    timeoutMs: boundedInteger(config.timeoutMs, DEFAULT_TIMEOUT_MS, 250, 10_000),
    retries: boundedInteger(config.retries, DEFAULT_RETRIES, 0, 2),
  });
}

function parseCursorKeyring(env: Record<string, string | undefined>) {
  if (!env.CIGO_BUSINESS_OS_CURSOR_KEYS_JSON || !env.CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID) {
    genericError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(env.CIGO_BUSINESS_OS_CURSOR_KEYS_JSON);
  } catch {
    return genericError();
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) genericError();
  const keys = new Map<string, Uint8Array>();
  for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id) || typeof value !== "string") genericError();
    const key = Buffer.from(value, "base64url");
    if (key.length !== 32 || key.toString("base64url") !== value) genericError();
    keys.set(id, key);
  }
  if (!keys.size || !keys.has(env.CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID)) genericError();
  return {
    keys,
    activeKeyId: env.CIGO_BUSINESS_OS_CURSOR_ACTIVE_KEY_ID,
  };
}

function parseEnvelope(
  value: unknown,
  workspaceId: WorkspaceId,
  resourceKind: string,
  limit: number,
): BusinessOsEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) genericError();
  const envelope = value as Record<string, unknown>;
  if (
    envelope.contractVersion !== CONTRACT_VERSION
    || envelope.sourceSystem !== SOURCE_SYSTEM
    || envelope.workspaceId !== workspaceId
    || envelope.resourceKind !== resourceKind
    || !exactIso(envelope.observedAt)
    || !Array.isArray(envelope.records)
    || envelope.records.length > limit
    || !envelope.pagination
    || typeof envelope.pagination !== "object"
    || Array.isArray(envelope.pagination)
    || !["COMPLETE", "PARTIAL"].includes(String(envelope.completeness))
    || !Array.isArray(envelope.errors)
  ) genericError();

  const pagination = envelope.pagination as Record<string, unknown>;
  const nextCursor = pagination.nextCursor;
  if (
    nextCursor !== undefined
    && (typeof nextCursor !== "string" || !nextCursor || nextCursor.length > 4096)
  ) genericError();

  const completeness = envelope.completeness as "COMPLETE" | "PARTIAL";
  if (
    (completeness === "COMPLETE" && envelope.errors.length !== 0)
    || (completeness === "PARTIAL" && nextCursor !== undefined)
  ) genericError();

  for (const error of envelope.errors) {
    if (!error || typeof error !== "object" || Array.isArray(error)) genericError();
    const item = error as Record<string, unknown>;
    if (
      typeof item.code !== "string"
      || !item.code
      || item.code.length > 120
      || typeof item.message !== "string"
      || !item.message
      || item.message.length > 500
      || typeof item.retryable !== "boolean"
    ) genericError();
  }

  const context = {
    workspaceId,
    actorId: "business-os-http-adapter",
    authorizedAt: envelope.observedAt as string,
  };
  for (const record of envelope.records as OperationalRecord[]) {
    if (
      !validateOperationalRecord(record, context).ok
      || record.reference.sourceSystem !== SOURCE_SYSTEM
      || record.resourceKind !== resourceKind
      || typeof record.reference.version !== "string"
      || !record.reference.version
      || record.reference.version.length > 128
      || record.reference.externalReference.length > 255
    ) genericError();
  }

  return structuredClone(value) as BusinessOsEnvelope;
}

function retryableStatus(status: number) {
  return [429, 502, 503, 504].includes(status);
}

async function defaultSleep(milliseconds: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

/**
 * Real, server-configured Business OS v1 adapter. Endpoint and credential are selected
 * from server environment by the trusted workspace, never accepted from a read request.
 * HTTP authentication proves access to the source boundary; it does NOT create a FACT,
 * VERIFIED truth status, or independent source-attestation receipt.
 */
export class BusinessOsHttpReadModelPort implements BusinessOsReadModelPort {
  readonly version = "v1" as const;
  readonly adapterId = "business-os-http-read-model:v1" as const;

  private constructor(
    private readonly workspaceId: WorkspaceId,
    private readonly config: ServerReaderConfig,
    private readonly transport: FetchLike,
    private readonly sleep: Sleep,
  ) {}

  static fromEnvironment(
    workspaceId: WorkspaceId,
    env: Record<string, string | undefined> = runtimeEnvironment(),
    dependencies: BusinessOsHttpAdapterDependencies = {},
  ) {
    return new BusinessOsHttpReadModelPort(
      workspaceId,
      parseServerConfig(workspaceId, env.CIGO_BUSINESS_OS_READERS_JSON),
      dependencies.fetch ?? fetch,
      dependencies.sleep ?? defaultSleep,
    );
  }

  async readPage(input: Readonly<{
    workspaceId: WorkspaceId;
    resourceKind: string;
    limit: number;
    cursor?: string;
  }>) {
    if (
      input.workspaceId !== this.workspaceId
      || !this.config.resourceKinds.includes(input.resourceKind)
      || !allowedResourceKinds.has(input.resourceKind)
      || !Number.isSafeInteger(input.limit)
      || input.limit < 1
      || input.limit > 100
      || (input.cursor !== undefined && (!input.cursor || input.cursor.length > 4096))
    ) genericError();

    const endpoint = new URL("/api/internal/cigo/v1/read", this.config.baseUrl);
    endpoint.searchParams.set("workspaceId", this.workspaceId);
    endpoint.searchParams.set("resourceKind", input.resourceKind);
    endpoint.searchParams.set("limit", String(input.limit));
    if (input.cursor !== undefined) endpoint.searchParams.set("cursor", input.cursor);

    let response: Response | undefined;
    for (let attempt = 0; attempt <= this.config.retries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
      try {
        response = await this.transport(endpoint, {
          method: "GET",
          redirect: "error",
          signal: controller.signal,
          headers: {
            accept: "application/json",
            authorization: `Bearer ${this.config.secret}`,
            "x-codeedge-cigo-key-id": this.config.keyId,
          },
        });
      } catch {
        response = undefined;
      } finally {
        clearTimeout(timeout);
      }

      if (response && response.ok) break;
      if (
        attempt >= this.config.retries
        || (response && !retryableStatus(response.status))
      ) genericError();
      await this.sleep(Math.min(100 * 2 ** attempt, 500));
    }

    if (!response?.ok) genericError();
    const declared = response.headers.get("content-length");
    if (declared && Number(declared) > MAX_RESPONSE_BYTES) genericError();
    let text: string;
    try {
      text = await response.text();
    } catch {
      return genericError();
    }
    if (!text || responseEncoder.encode(text).byteLength > MAX_RESPONSE_BYTES) genericError();

    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      return genericError();
    }
    const envelope = parseEnvelope(
      payload,
      this.workspaceId,
      input.resourceKind,
      input.limit,
    );

    return {
      records: envelope.records.map((record) => structuredClone(record)),
      ...(envelope.pagination.nextCursor === undefined
        ? {}
        : { nextCursor: envelope.pagination.nextCursor }),
      ...(envelope.completeness === "PARTIAL" ? { partial: true } : {}),
    };
  }
}

/**
 * Trusted server composition root: binds the existing CIGO Reader to the real HTTP port
 * while retaining CIGO's existing authorization check and AEAD wrapper cursor.
 */
export function createBusinessOsHttpReaderFromEnvironment(input: Readonly<{
  workspaceId: WorkspaceId;
  authorization: TrustedReadAuthorization;
  env?: Record<string, string | undefined>;
  dependencies?: BusinessOsHttpAdapterDependencies;
  clock?: () => string;
  cursorNow?: () => number;
  cursorTtlMs?: number;
}>) {
  const env = input.env ?? runtimeEnvironment();
  const port = BusinessOsHttpReadModelPort.fromEnvironment(
    input.workspaceId,
    env,
    input.dependencies,
  );
  const cursor = parseCursorKeyring(env);
  return BusinessOsReadModelReader.create({
    workspaceId: input.workspaceId,
    port,
    authorization: input.authorization,
    cursorKeys: cursor.keys,
    activeKeyId: cursor.activeKeyId,
    ...(input.clock ? { clock: input.clock } : {}),
    ...(input.cursorNow ? { cursorNow: input.cursorNow } : {}),
    ...(input.cursorTtlMs ? { cursorTtlMs: input.cursorTtlMs } : {}),
  });
}
