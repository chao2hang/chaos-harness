# Agent Note: Registry-independent installation from GitHub Releases

Status: implemented

English | [中文](2026-08-17-github-release-portable-install.zh.md)

## Problem

The product's primary installation command resolved the complete plugin package graph from npmjs at installation time. This coupled product availability to registry access and exposed users to hundreds of package-resolution operations even though a release identifies one tested product version. Installing only the `@deepseek-ai/dsh` tarball is not sufficient: runtime packages use peer dependencies to compose the Cordis and dsh plugin graph, and some dependencies select platform-specific payloads.

## Decision

Each `dsh-v*` release publishes one self-contained archive for every supported operating-system and CPU pair. The release workflow installs the packed dsh and vendored Cordis families on the matching native runner, verifies the installed CLI version, includes licenses and notices, and uploads the archive with one `SHA256SUMS` file to the GitHub Release.

`scripts/install.mjs` selects the latest published `dsh-v*` release unless `DSH_VERSION` names one, maps the current host to its release asset, verifies SHA-256 before extraction, and atomically replaces the installation directory. The script writes a launcher into the user's executable directory. End-user installation reads only GitHub API, raw, and release URLs; npmjs is not part of that path. Node.js remains an explicit prerequisite because the archives contain the application and dependency graph, not a Node runtime.

The [npm publication sequences](2026-08-10-npm-release-sequences.md) remain available as package-distribution mechanisms, but the root README presents GitHub Releases as the product installation path. The portable archive is assembled from the same packed dsh bytes verified by the existing release job so package publication and GitHub installation cannot silently carry different dsh source payloads.

## Alternatives considered

**Install the dsh package tarball directly from GitHub.** A single package tarball omits peer dependencies and external runtime dependencies, so the resulting CLI fails during module resolution or returns to a registry to complete installation.

**Install from a repository checkout.** Source installation avoids npmjs only when the complete pnpm store is already available; it otherwise downloads dependencies and requires build tooling. It remains a contributor path rather than the default product installation.

**Bundle Node.js into each archive.** This would remove the runtime prerequisite but substantially increase release size and add Node security-update ownership. Requiring a supported Node.js version keeps the archive focused on the product.

## Consequences

Installation is independent of npmjs availability and performs one verified release download. Archives are larger than a registry install that shares a package cache, and the release workflow must build every supported platform on its native runner. A newly supported platform requires a runner, an asset mapping, and installer coverage in the same change. GitHub availability remains a prerequisite, and users who pin a version rely on the corresponding Release assets remaining immutable.
