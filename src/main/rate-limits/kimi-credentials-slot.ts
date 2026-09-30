import { join, win32 as pathWin32 } from 'node:path'
import { parseWslUncPath } from '../../shared/wsl-paths'

// Why: Kimi Code stores managed OAuth tokens through a file token store keyed by
// `oauth/<name>` → `<kimi home>/credentials/<name>.json`. The legacy/default slot
// is `oauth/kimi-code`, but newer CLIs scope the slot per (oauthHost, baseUrl)
// environment (`oauth/kimi-code-env-<hash>`, e.g. for auth.kimi.ai) and record the
// active key in config.toml under `[providers."managed:kimi-code".oauth]`. Once a
// user is on a scoped slot the CLI stops refreshing `kimi-code.json`, so reading
// only the default file shows a permanently expired session.
export const DEFAULT_KIMI_TOKEN_NAME = 'kimi-code'
const OAUTH_KEY_PREFIX = 'oauth/'
const MANAGED_PROVIDER_OAUTH_TABLE = 'providers.managed:kimi-code.oauth'

function joinKimiPath(kimiHome: string, ...segments: string[]): string {
  // WSL homes arrive as `\\wsl.localhost\<distro>\...`, which only win32 join keeps intact.
  return parseWslUncPath(kimiHome)
    ? pathWin32.join(kimiHome, ...segments)
    : join(kimiHome, ...segments)
}

export function getKimiConfigPath(kimiHome: string): string {
  return joinKimiPath(kimiHome, 'config.toml')
}

export function getKimiCredentialsPath(kimiHome: string, tokenName: string): string {
  return joinKimiPath(kimiHome, 'credentials', `${tokenName}.json`)
}

// Mirrors the CLI's token-name resolution: strip `oauth/`, and refuse anything
// that is not a plain file name so a hand-edited config can't point Orca outside
// the credentials directory.
export function kimiTokenNameFromOAuthKey(key: string): string | null {
  if (!key.startsWith(OAUTH_KEY_PREFIX)) {
    return null
  }
  const name = key.slice(OAUTH_KEY_PREFIX.length)
  if (name.length === 0 || name.startsWith('.') || /[\\/]/.test(name) || name.includes('\0')) {
    return null
  }
  return name
}

function normalizeTableHeader(header: string): string {
  // `[providers."managed:kimi-code".oauth]` and quoting/spacing variants → dotted path.
  return header
    .split('.')
    .map((part) => part.trim().replace(/^(["'])(.*)\1$/, '$2'))
    .join('.')
}

function parseTomlString(raw: string): string | null {
  const match = /^(?:"((?:[^"\\]|\\.)*)"|'([^']*)')\s*(?:#.*)?$/.exec(raw.trim())
  if (!match) {
    return null
  }
  return match[1] !== undefined ? match[1].replace(/\\(["\\])/g, '$1') : (match[2] ?? null)
}

/**
 * Read the managed Kimi Code OAuth key from config.toml without a TOML
 * dependency: only the `key` string inside the managed provider's oauth table
 * is needed, and both are single-line by construction (the CLI writes them).
 */
export function parseKimiManagedOAuthKey(configToml: string): string | null {
  let inManagedOAuthTable = false
  for (const rawLine of configToml.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('[')) {
      const header = /^\[([^[\]]+)\]\s*(?:#.*)?$/.exec(line)
      inManagedOAuthTable =
        header !== null && normalizeTableHeader(header[1]) === MANAGED_PROVIDER_OAUTH_TABLE
      continue
    }
    if (!inManagedOAuthTable) {
      continue
    }
    const pair = /^key\s*=\s*(.+)$/.exec(line)
    if (pair) {
      return parseTomlString(pair[1])
    }
  }
  return null
}

/** Token names to try, configured slot first, always falling back to the default slot. */
export function kimiCredentialTokenNames(configToml: string | null): string[] {
  const key = configToml ? parseKimiManagedOAuthKey(configToml) : null
  const configured = key ? kimiTokenNameFromOAuthKey(key) : null
  return configured && configured !== DEFAULT_KIMI_TOKEN_NAME
    ? [configured, DEFAULT_KIMI_TOKEN_NAME]
    : [DEFAULT_KIMI_TOKEN_NAME]
}
