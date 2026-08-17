#!/usr/bin/env node
/** Install dsh from a self-contained GitHub Release archive without using npmjs. */
import { createHash } from 'node:crypto'
import { access, chmod, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'

const REPOSITORY = 'deepseek-ai/deepseek-harness'
const RELEASES_API = `https://api.github.com/repos/${REPOSITORY}/releases?per_page=100`
const RELEASE_BASE = process.env.DSH_RELEASES_BASE ?? `https://github.com/${REPOSITORY}/releases/download`

/** Convert Node platform metadata to a published portable-asset suffix. */
export function targetSuffix(platform = process.platform, arch = process.arch) {
  if (!['linux', 'darwin', 'win32'].includes(platform)) {
    throw new Error(`dsh portable releases do not support ${platform}`)
  }
  if (!['x64', 'arm64'].includes(arch) || (platform === 'win32' && arch !== 'x64')) {
    throw new Error(`dsh portable releases do not support ${platform}-${arch}`)
  }
  return `${platform}-${arch}`
}

/** Select the newest published dsh release returned by GitHub. */
export function selectRelease(releases, requestedVersion = process.env.DSH_VERSION) {
  if (requestedVersion !== undefined && requestedVersion !== '') {
    const tag = requestedVersion.startsWith('dsh-v') ? requestedVersion : `dsh-v${requestedVersion}`
    return { tag_name: tag }
  }
  const release = releases.find(candidate =>
    candidate !== null
    && typeof candidate === 'object'
    && candidate.draft === false
    && typeof candidate.tag_name === 'string'
    && candidate.tag_name.startsWith('dsh-v'))
  if (release === undefined) throw new Error('GitHub has no published dsh-v* release')
  return release
}

/** Read one asset's expected SHA-256 from the release checksum file. */
export function expectedChecksum(content, assetName) {
  for (const line of content.split(/\r?\n/u)) {
    const match = /^([a-f0-9]{64})\s+\*?(.+)$/u.exec(line.trim())
    if (match?.[2] === assetName) return match[1]
  }
  throw new Error(`SHA256SUMS has no entry for ${assetName}`)
}

/** Run one child process and reject with its exit status. */
function run(command, args, options = {}) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun()
      else reject(new Error(`${command} failed (${signal ?? `exit ${String(code)}`})`))
    })
  })
}

/** Fetch one URL and fail with its response status. */
async function fetchOk(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'dsh-installer' }, redirect: 'follow' })
  if (!response.ok) throw new Error(`${url} returned HTTP ${String(response.status)}`)
  return response
}

/** Whether one filesystem path exists. */
async function pathExists(path) {
  try {
    await access(path)
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false
    throw error
  }
}

/** Shell-quote one path for the generated POSIX launcher. */
function shellQuote(value) {
  return `'${value.replaceAll("'", `'"'"'`)}'`
}

/** Install the selected GitHub Release and print the executable path. */
export async function install() {
  const suffix = targetSuffix()
  const assetName = `dsh-${suffix}.tar.gz`
  const requested = process.env.DSH_VERSION
  const releases = requested === undefined || requested === ''
    ? await (await fetchOk(RELEASES_API)).json()
    : []
  if (!Array.isArray(releases)) throw new Error('GitHub releases response is not an array')
  const release = selectRelease(releases, requested)
  const tag = release.tag_name
  const base = `${RELEASE_BASE}/${encodeURIComponent(tag)}`

  const temporary = await mkdtemp(join(tmpdir(), 'dsh-install-'))
  const archive = join(temporary, assetName)
  try {
    const [asset, checksums] = await Promise.all([
      fetchOk(`${base}/${assetName}`),
      fetchOk(`${base}/SHA256SUMS`),
    ])
    await writeFile(archive, new Uint8Array(await asset.arrayBuffer()))
    const expected = expectedChecksum(await checksums.text(), assetName)
    const actual = createHash('sha256').update(await readFile(archive)).digest('hex')
    if (actual !== expected) throw new Error(`checksum mismatch for ${assetName}`)

    await run('tar', ['-xzf', archive, '-C', temporary])
    const extracted = join(temporary, 'dsh')
    const home = homedir()
    const installRoot = resolve(process.env.DSH_INSTALL_DIR ?? (
      process.platform === 'win32'
        ? join(process.env.LOCALAPPDATA ?? home, 'DeepSeek Harness', 'runtime')
        : join(home, '.local', 'share', 'dsh')
    ))
    const binRoot = resolve(process.env.DSH_BIN_DIR ?? (
      process.platform === 'win32'
        ? join(process.env.LOCALAPPDATA ?? home, 'DeepSeek Harness', 'bin')
        : join(home, '.local', 'bin')
    ))

    if (await pathExists(installRoot) && !await pathExists(join(installRoot, '.dsh-portable-install'))) {
      throw new Error(`${installRoot} exists and is not a dsh portable installation`)
    }

    const installParent = dirname(installRoot)
    const pendingRoot = join(installParent, `.dsh-install-${String(process.pid)}`)
    const backupRoot = join(installParent, `.dsh-backup-${String(process.pid)}`)
    await mkdir(installParent, { recursive: true })
    await rm(pendingRoot, { recursive: true, force: true })
    await rm(backupRoot, { recursive: true, force: true })
    await cp(extracted, pendingRoot, { recursive: true })
    try {
      await rename(installRoot, backupRoot)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
    }
    try {
      await rename(pendingRoot, installRoot)
    } catch (error) {
      try {
        await rename(backupRoot, installRoot)
      } catch (restoreError) {
        if (!(restoreError instanceof Error && 'code' in restoreError && restoreError.code === 'ENOENT')) throw restoreError
      }
      throw error
    }
    await rm(backupRoot, { recursive: true, force: true })
    await mkdir(binRoot, { recursive: true })

    const entry = join(installRoot, 'app', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (process.platform === 'win32') {
      const launcher = join(binRoot, 'dsh.cmd')
      await writeFile(launcher, `@echo off\r\nnode "${entry}" %*\r\n`)
      console.log(`Installed dsh ${tag.slice('dsh-v'.length)} at ${launcher}`)
    } else {
      const launcher = join(binRoot, 'dsh')
      await writeFile(launcher, `#!/bin/sh\nexec node ${shellQuote(entry)} "$@"\n`)
      await chmod(launcher, 0o755)
      console.log(`Installed dsh ${tag.slice('dsh-v'.length)} at ${launcher}`)
    }

    const pathEntries = (process.env.PATH ?? '').split(process.platform === 'win32' ? ';' : ':')
      .map(entryPath => resolve(entryPath || '.'))
    if (!pathEntries.includes(binRoot)) {
      console.log(`Add ${binRoot} to PATH, then run: dsh web`)
    } else {
      console.log('Run: dsh web')
    }
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

const direct = process.argv[1] === undefined
  || import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (direct) {
  install().catch((error) => {
    console.error(`dsh install failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  })
}
