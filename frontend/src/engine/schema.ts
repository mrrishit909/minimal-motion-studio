import Ajv2020 from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv";
import schema from "../../../schemas/request.schema.json" with { type: "json" };
import type { Request, Spec, ValidateResult } from "./types.ts";

// One Ajv instance in strict mode, compiled once from the shared contract.
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
const specValidator = ajv.getSchema(`${schema.$id}#/$defs/spec`);
const requestValidator = ajv.getSchema(schema.$id);
if (!specValidator || !requestValidator) throw new Error("request.schema.json did not compile");

/** The schema's own allowed-link pattern, reused by compose as a second check at output time. */
export const CTA_HREF_PATTERN = new RegExp(schema.$defs.spec.properties.brand.properties.cta_href.pattern, "u");

const RULE_BY_DEF: Record<string, string> = {
  line: "must be one line of text without control characters",
  required_line: "must be one line of visible text without control characters",
  paragraph: "must be text without control characters (line breaks are allowed)",
  hex: "must be a colour written as #rrggbb",
};

/** "/items/2/title" -> "items[2].title"; "" -> "the brief". */
function where(path: string): string {
  if (!path) return "the brief";
  return path
    .split("/")
    .slice(1)
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((acc, p) => (/^\d+$/.test(p) ? `${acc}[${p}]` : acc ? `${acc}.${p}` : p), "");
}

const safeName = (s: unknown) => (typeof s === "string" && /^[a-z_]{1,32}$/.test(s) ? `"${s}"` : "a field");

/** Plain words naming the path and the rule; never the submitted value. */
function describe(e: ErrorObject): string {
  const at = where(e.instancePath);
  const p = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case "additionalProperties":
      return `${at}: has ${safeName(p.additionalProperty)} that is not part of the brief`;
    case "required":
      return `${at}: is missing the required field "${String(p.missingProperty)}"`;
    case "type":
      return `${at}: must be ${p.type === "integer" ? "a whole number" : `of type ${String(p.type)}`}`;
    case "enum":
      return `${at}: must be one of ${(p.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}`;
    case "const":
      return `${at}: must be ${JSON.stringify(p.allowedValue)}`;
    case "maxLength":
      return `${at}: must be at most ${String(p.limit)} characters`;
    case "minLength":
      return `${at}: must not be empty`;
    case "maxItems":
      return `${at}: must have at most ${String(p.limit)} entries`;
    case "minimum":
      return `${at}: must be at least ${String(p.limit)}`;
    case "maximum":
      return `${at}: must be at most ${String(p.limit)}`;
    case "multipleOf":
      return `${at}: must be a multiple of ${String(p.multipleOf)}`;
    case "pattern": {
      if (e.schemaPath.includes("cta_href")) return `${at}: must be an https:// address, a mailto: address or a tel: number`;
      if (e.schemaPath.includes("candidate_sha256")) return `${at}: must be "sha256:" followed by 64 lower-case hex digits`;
      const def = /#\/\$defs\/([a-z_]+)\/pattern$/.exec(e.schemaPath)?.[1];
      return `${at}: ${(def && RULE_BY_DEF[def]) || "has a value in the wrong format"}`;
    }
    default:
      return `${at}: breaks the "${e.keyword}" rule`;
  }
}

function result<T>(validate: typeof specValidator, x: unknown): { ok: true; value: T } | { ok: false; errors: string[] } {
  if (validate!(x)) return { ok: true, value: x as T };
  const errors = [...new Set((validate!.errors ?? []).map(describe))];
  return { ok: false, errors };
}

export function validateSpec(x: unknown): ValidateResult {
  const r = result<Spec>(specValidator, x);
  return r.ok ? { ok: true, spec: r.value } : r;
}

export function validateRequest(x: unknown): { ok: true; request: Request } | { ok: false; errors: string[] } {
  const r = result<Request>(requestValidator, x);
  if (!r.ok) return r;
  // Provenance must agree with itself (the harness applies the same rule).
  const ai = r.value.origin === "ai-candidate";
  if (ai && !r.value.candidate_sha256) return { ok: false, errors: ["candidate_sha256: is required when origin is ai-candidate"] };
  if (!ai && r.value.candidate_sha256 !== undefined) return { ok: false, errors: ["candidate_sha256: is only allowed when origin is ai-candidate"] };
  return { ok: true, request: r.value };
}
