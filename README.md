# DeepSeek Harness

English | [中文](README.zh.md)

DeepSeek Harness (`dsh`) is an open-source agent harness developed by [DeepSeek AI](https://deepseek.com).

It uses an architecture where **everything is a plugin**, and is powered by [Cordis](https://github.com/cordiverse/cordis), whose design is described in [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper).

## Developer preview

DeepSeek Harness is currently in _developer preview_ and is iterating rapidly. **THERE WILL BE COMPATIBILITY-BREAKING CHANGES.**

## Run

### Install from GitHub Releases

Install [Node.js 22.19 or newer](https://nodejs.org/), then download the latest self-contained release from GitHub:

```sh
curl -fsSL https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/scripts/install.mjs | node --input-type=module
dsh web
```

The installer verifies the archive against the release's `SHA256SUMS`, installs it under `~/.local/share/dsh`, and places the launcher in `~/.local/bin`. It never contacts npmjs. Set `DSH_VERSION` to install a specific version or `DSH_INSTALL_DIR` and `DSH_BIN_DIR` to choose other locations.

On Windows, run the equivalent command in PowerShell; the launcher is installed under `%LOCALAPPDATA%\DeepSeek Harness\bin`:

```powershell
irm https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/scripts/install.mjs | node --input-type=module
dsh web
```

`dsh web` starts the Web UI, served at `http://127.0.0.1:3080` by default. For a remote HTTPS deployment behind a reverse proxy, configure an access token and its public URL:

```sh
export DSH_WEB_TOKEN='replace-with-a-random-token'
dsh web --host 0.0.0.0 --auth required --public-url https://dsh.example.com
```

See the [Web UI guide](docs/user/guide/index.md) for TLS and deployment options.

### Run from source

To run from a repository checkout:

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## Community and support

- Feel free to submit feedback or bug reports through [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions).
- Add the [`dsh-plugin`](https://github.com/topics/dsh-plugin) topic to your plugin repository for discoverability.
- Join <a href="https://discord.gg/Ycq5dCaS4">DeepSeek Harness Discord community</a>.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Development

Start with the [development guide](docs/development.md) and [architecture documentation](docs/architecture.md).

For agents, follow [AGENTS.md](AGENTS.md).

## License

[MIT](LICENSE)

Third-party dependencies and their licenses are disclosed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
