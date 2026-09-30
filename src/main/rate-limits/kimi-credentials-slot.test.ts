import { describe, expect, it } from 'vitest'
import {
  kimiCredentialTokenNames,
  kimiTokenNameFromOAuthKey,
  parseKimiManagedOAuthKey
} from './kimi-credentials-slot'

// Shape written by Kimi Code 2.x after logging in against auth.kimi.ai.
const SCOPED_CONFIG = `
default_model = "kimi-code/kimi-for-coding"

[services.moonshot_search.oauth]
storage = "file"
key = "oauth/kimi-code-env-search000000000"

[providers."managed:kimi-code"]
type = "kimi"
api_key = ""
base_url = "https://api.kimi.ai/coding/v1"

[providers."managed:kimi-code".oauth]
storage = "file"
key = "oauth/kimi-code-env-0e4f99c69cc27850"
oauth_host = "https://auth.kimi.ai"

[models."kimi-code/kimi-for-coding"]
provider = "managed:kimi-code"
`

describe('parseKimiManagedOAuthKey', () => {
  it('reads the key from the managed provider oauth table only', () => {
    expect(parseKimiManagedOAuthKey(SCOPED_CONFIG)).toBe('oauth/kimi-code-env-0e4f99c69cc27850')
  })

  it('accepts single quotes, spacing and trailing comments', () => {
    const config = `[ providers . 'managed:kimi-code' . oauth ] # managed\nkey='oauth/kimi-code-env-abc' # slot\n`
    expect(parseKimiManagedOAuthKey(config)).toBe('oauth/kimi-code-env-abc')
  })

  it('returns null when the managed provider has no oauth table', () => {
    expect(parseKimiManagedOAuthKey('[providers."managed:kimi-code"]\ntype = "kimi"\n')).toBeNull()
  })

  it('does not leak a key from a later table', () => {
    const config = `[providers."managed:kimi-code".oauth]\nstorage = "file"\n\n[other]\nkey = "oauth/elsewhere"\n`
    expect(parseKimiManagedOAuthKey(config)).toBeNull()
  })
})

describe('kimiTokenNameFromOAuthKey', () => {
  it('strips the oauth/ prefix', () => {
    expect(kimiTokenNameFromOAuthKey('oauth/kimi-code-env-0e4f99c69cc27850')).toBe(
      'kimi-code-env-0e4f99c69cc27850'
    )
  })

  it.each(['kimi-code', 'oauth/', 'oauth/../secrets', 'oauth/a/b', 'oauth/a\\b', 'oauth/.hidden'])(
    'rejects %s',
    (key) => {
      expect(kimiTokenNameFromOAuthKey(key)).toBeNull()
    }
  )
})

describe('kimiCredentialTokenNames', () => {
  it('prefers the configured scoped slot and falls back to the default slot', () => {
    expect(kimiCredentialTokenNames(SCOPED_CONFIG)).toEqual([
      'kimi-code-env-0e4f99c69cc27850',
      'kimi-code'
    ])
  })

  it('uses only the default slot without a config or when it is the default key', () => {
    expect(kimiCredentialTokenNames(null)).toEqual(['kimi-code'])
    expect(
      kimiCredentialTokenNames('[providers."managed:kimi-code".oauth]\nkey = "oauth/kimi-code"\n')
    ).toEqual(['kimi-code'])
  })
})
