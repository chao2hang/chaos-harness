import { describe, expect, it } from 'vitest'
import { portableAssetName } from './portable.ts'

describe('portable release assets', () => {
  it('uses installer-compatible names for supported targets', () => {
    expect(portableAssetName('linux', 'x64')).toBe('dsh-linux-x64.tar.gz')
    expect(portableAssetName('linux', 'arm64')).toBe('dsh-linux-arm64.tar.gz')
    expect(portableAssetName('darwin', 'x64')).toBe('dsh-darwin-x64.tar.gz')
    expect(portableAssetName('darwin', 'arm64')).toBe('dsh-darwin-arm64.tar.gz')
    expect(portableAssetName('win32', 'x64')).toBe('dsh-win32-x64.tar.gz')
  })
})
