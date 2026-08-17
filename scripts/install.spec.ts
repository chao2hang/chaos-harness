import { describe, expect, it } from 'vitest'
import { expectedChecksum, selectRelease, targetSuffix } from './install.mjs'

describe('GitHub Release installer metadata', () => {
  it('maps every supported target and rejects unsupported targets', () => {
    expect(targetSuffix('linux', 'x64')).toBe('linux-x64')
    expect(targetSuffix('linux', 'arm64')).toBe('linux-arm64')
    expect(targetSuffix('darwin', 'x64')).toBe('darwin-x64')
    expect(targetSuffix('darwin', 'arm64')).toBe('darwin-arm64')
    expect(targetSuffix('win32', 'x64')).toBe('win32-x64')
    expect(() => targetSuffix('win32', 'arm64')).toThrow('do not support win32-arm64')
    expect(() => targetSuffix('freebsd', 'x64')).toThrow('do not support freebsd')
  })

  it('selects the newest published dsh release or an explicit version', () => {
    expect(selectRelease([
      { tag_name: 'vendor-v4', draft: false },
      { tag_name: 'dsh-v2.0.0', draft: true },
      { tag_name: 'dsh-v1.2.3', draft: false },
      { tag_name: 'dsh-v1.0.0', draft: false },
    ])).toEqual({ tag_name: 'dsh-v1.2.3', draft: false })
    expect(selectRelease([], '1.2.3')).toEqual({ tag_name: 'dsh-v1.2.3' })
    expect(selectRelease([], 'dsh-v1.2.3')).toEqual({ tag_name: 'dsh-v1.2.3' })
    expect(() => selectRelease([{ tag_name: 'vendor-v4', draft: false }])).toThrow('no published dsh-v* release')
  })

  it('reads exact asset checksums and rejects an absent entry', () => {
    const linux = 'a'.repeat(64)
    const windows = 'b'.repeat(64)
    const content = `${linux}  dsh-linux-x64.tar.gz\n${windows} *dsh-win32-x64.tar.gz\n`
    expect(expectedChecksum(content, 'dsh-linux-x64.tar.gz')).toBe(linux)
    expect(expectedChecksum(content, 'dsh-win32-x64.tar.gz')).toBe(windows)
    expect(() => expectedChecksum(content, 'dsh-darwin-arm64.tar.gz')).toThrow('has no entry')
  })
})
