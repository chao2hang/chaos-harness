/** Return the release asset suffix for one supported host. */
export function targetSuffix(platform?: string, arch?: string): string

/** Select an explicit version or the newest published dsh release. */
export function selectRelease(
  releases: readonly Record<string, unknown>[],
  requestedVersion?: string,
): Record<string, unknown>

/** Read one asset's SHA-256 digest from a checksum file. */
export function expectedChecksum(content: string, assetName: string): string

/** Install dsh from the selected GitHub Release. */
export function install(): Promise<void>
