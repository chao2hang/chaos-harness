#!/usr/bin/env node
/** Build a self-contained dsh archive whose installation never contacts a package registry. */
import {
  chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import { capture, isEntry, run } from './process.ts'
import { packedIdentity } from './tarball.ts'

/** Supported release-asset operating-system identifiers. */
export type PortablePlatform = 'linux' | 'darwin' | 'win32'
/** Supported release-asset CPU identifiers. */
export type PortableArch = 'x64' | 'arm64'

/** Return the deterministic archive filename for one dsh release target. */
export function portableAssetName(platform: PortablePlatform, arch: PortableArch): string {
  return `dsh-${platform}-${arch}.tar.gz`
}

/** Map every packed package name to its absolute tarball path. */
export function packedTarballs(directories: readonly string[]): Map<string, { path: string; version: string }> {
  const packed = new Map<string, { path: string; version: string }>()
  for (const directory of directories) {
    const files = readdirSync(directory).filter(name => name.endsWith('.tgz')).sort()
    if (files.length === 0) throw new Error(`${directory} holds no packed tarball`)
    for (const file of files) {
      const path = join(directory, file)
      const identity = packedIdentity(path)
      if (packed.has(identity.name)) throw new Error(`duplicate packed package ${identity.name}`)
      packed.set(identity.name, { path, version: identity.version })
    }
  }
  return packed
}

/** Assert and narrow a release target platform. */
function portablePlatform(value: string): PortablePlatform {
  if (value === 'linux' || value === 'darwin' || value === 'win32') return value
  throw new Error(`unsupported portable platform ${JSON.stringify(value)}`)
}

/** Assert and narrow a release target architecture. */
function portableArch(value: string): PortableArch {
  if (value === 'x64' || value === 'arm64') return value
  throw new Error(`unsupported portable architecture ${JSON.stringify(value)}`)
}

/** Environment for assembling and smoke-testing the portable consumer. */
function portableEnvironment(root: string): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  delete environment.NODE_OPTIONS
  delete environment.NODE_PATH
  environment.DSH_HOME = join(root, '.dsh')
  environment.DSH_AGENTS_HOME = join(root, '.agents')
  environment.DSH_TELEMETRY_DISABLED = '1'
  return environment
}

/** Build one registry-independent release archive for the current platform. */
function main(): void {
  const { values } = parseArgs({
    options: {
      from: { type: 'string', multiple: true },
      out: { type: 'string' },
      platform: { type: 'string', default: process.platform },
      arch: { type: 'string', default: process.arch },
    },
    allowPositionals: false,
  })
  if (values.from === undefined || values.from.length === 0 || values.out === undefined) {
    throw new Error('usage: portable.ts --from <packed directory> [--from ...] --out <asset directory>')
  }

  const platform = portablePlatform(values.platform)
  const arch = portableArch(values.arch)
  if (platform !== process.platform || arch !== process.arch) {
    throw new Error(`portable archive must be assembled on its target host; requested ${platform}-${arch}, running ${process.platform}-${process.arch}`)
  }

  const repositoryRoot = process.cwd()
  const packed = packedTarballs(values.from.map(directory => resolve(repositoryRoot, directory)))
  const dsh = packed.get('@deepseek-ai/dsh')
  if (dsh === undefined) throw new Error('@deepseek-ai/dsh is not among the packed tarballs')

  const stagingRoot = mkdtempSync(join(tmpdir(), 'dsh-portable-'))
  const archiveRoot = join(stagingRoot, 'dsh')
  const appRoot = join(archiveRoot, 'app')
  const binRoot = join(archiveRoot, 'bin')
  try {
    mkdirSync(appRoot, { recursive: true })
    mkdirSync(binRoot, { recursive: true })
    writeFileSync(join(archiveRoot, '.dsh-portable-install'), `${dsh.version}\n`)
    writeFileSync(join(appRoot, 'package.json'), `${JSON.stringify({
      name: 'dsh-portable-installation',
      version: dsh.version,
      private: true,
      dependencies: Object.fromEntries([...packed].map(([name, entry]) => [
        name, pathToFileURL(entry.path).href,
      ])),
    }, null, 2)}\n`)

    const environment = portableEnvironment(archiveRoot)
    run('npm', ['install', '--no-audit', '--no-fund', '--package-lock=false'], {
      cwd: appRoot,
      env: environment,
    })

    const dshBin = join(appRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
    if (!existsSync(dshBin)) throw new Error(`portable install did not produce ${dshBin}`)
    const version = capture(process.execPath, [dshBin, '--version'], { cwd: archiveRoot, env: environment })
    if (version !== dsh.version) {
      throw new Error(`portable dsh --version reported ${JSON.stringify(version)}, expected ${dsh.version}`)
    }

    const unixLauncher = '#!/bin/sh\nset -eu\nHERE=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)\nexec node "$HERE/../app/node_modules/@deepseek-ai/dsh/lib/bin.js" "$@"\n'
    writeFileSync(join(binRoot, 'dsh'), unixLauncher)
    chmodSync(join(binRoot, 'dsh'), 0o755)
    writeFileSync(join(binRoot, 'dsh.cmd'), '@echo off\r\nnode "%~dp0..\\app\\node_modules\\@deepseek-ai\\dsh\\lib\\bin.js" %*\r\n')

    for (const file of ['LICENSE', 'README.md', 'README.zh.md', 'THIRD_PARTY_NOTICES.md']) {
      cpSync(join(repositoryRoot, file), join(archiveRoot, file))
    }

    const out = resolve(repositoryRoot, values.out)
    mkdirSync(out, { recursive: true })
    const asset = join(out, portableAssetName(platform, arch))
    run('tar', ['-czf', asset, '-C', stagingRoot, basename(archiveRoot)], { cwd: repositoryRoot })
    console.log(`release portable: wrote ${asset}`)
  } finally {
    rmSync(stagingRoot, { recursive: true, force: true })
  }
}

if (isEntry(import.meta.url)) main()
