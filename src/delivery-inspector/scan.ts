// Credential-marker scanning. Privacy-critical.
//
// THE CONTRACT OF THIS MODULE: it takes text in and returns **rule names** out. It never returns the
// matched substring, the surrounding line, a line number, a character offset, a length, or a hash of
// the value. `RegExp.exec` results are examined for existence only and are never read, stored, or
// formatted into a message. A caller therefore cannot leak a suspected secret through this module's
// return value even by accident, and no downstream formatter has anything sensitive to format.
//
// Everything here is best-effort pattern matching on naming and shape. A match means "a human should
// look", not "a secret is present". False positives are expected and preferred over silence; false
// confidence is not acceptable.
//
// Reads are bounded by the caller (see `InspectionLimits.maxContentScanBytes`). Bytes are decoded in
// memory, scanned, and dropped when the function returns; nothing is retained anywhere.

/**
 * Credential-shaped patterns, each with a stable name that is safe to surface.
 * Names are the ONLY thing that escapes this module.
 */
export const CREDENTIAL_MARKER_RULES: readonly { name: string; pattern: RegExp }[] = [
  { name: "private_key_block", pattern: /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----/ },
  { name: "putty_private_key", pattern: /^PuTTY-User-Key-File-\d/m },
  { name: "aws_access_key_id", pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/ },
  { name: "github_token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "slack_token", pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "google_api_key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "openai_style_key", pattern: /\bsk-[A-Za-z0-9_-]{24,}\b/ },
  {
    name: "jwt_like_token",
    pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  },
  {
    // Matches `password = "..."`, `api_key: '...'`, and env-style `DATABASE_PASSWORD=...`. The key name
    // may carry a prefix or suffix (`DATABASE_PASSWORD`, `github_token_value`), which a plain `\b`
    // anchor would miss, and the value may be unquoted as it usually is in a `.env` file.
    name: "assigned_credential_literal",
    pattern:
      /(?:^|[^A-Za-z0-9])[A-Za-z0-9_.-]{0,40}(?:secret|token|password|passwd|api[_-]?key|access[_-]?key|client[_-]?secret)[A-Za-z0-9_.-]{0,40}["'\s]*[:=]\s*["']?[^\s"']{8,}["']?/i,
  },
];

/**
 * Return the names of credential-marker rules that matched, sorted and de-duplicated.
 *
 * Returns rule names only — never the matched text. This is the single privacy chokepoint for content
 * inspection, which is why the match object is deliberately discarded rather than destructured.
 */
export function scanTextForCredentialMarkers(text: string): string[] {
  const matched: string[] = [];
  for (const rule of CREDENTIAL_MARKER_RULES) {
    // `.test` returns a boolean and yields no capture groups, so there is nothing to leak.
    if (rule.pattern.test(text)) matched.push(rule.name);
  }
  return matched.sort();
}

/**
 * Heuristic binary detection: a NUL byte in the inspected prefix.
 * Used when git did not report a binary indication (for example, for untracked files).
 */
export function looksBinary(bytes: Uint8Array): boolean {
  const limit = Math.min(bytes.length, 8000);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0) return true;
  }
  return false;
}

/** One file's scan outcome. Carries no content. */
export interface ContentScanFinding {
  /** Repository-relative path. */
  path: string;
  /** Names of the rules that matched. Never values. */
  matchedRules: string[];
}
