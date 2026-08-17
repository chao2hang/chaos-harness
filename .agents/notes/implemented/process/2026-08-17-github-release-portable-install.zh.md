# Agent Note: 从 GitHub Releases 进行不依赖 registry 的安装

Status: implemented

[English](2026-08-17-github-release-portable-install.md) | 中文

## 问题

产品的主要安装命令会在安装时从 npmjs 解析完整的插件包图。这使产品可用性依赖 registry 访问，并让用户执行数百次包解析操作，尽管一个 Release 已经标识了经过测试的产品版本。仅安装 `@deepseek-ai/dsh` tarball 并不足够：运行时包通过 peer dependencies 组合 Cordis 与 dsh 插件图，部分依赖还会选择平台专属载荷。

## 决策

每个 `dsh-v*` Release 都为每组受支持的操作系统和 CPU 发布一个自包含归档。Release workflow 在匹配的原生 runner 上安装打包后的 dsh 与 vendored Cordis 包族，核对已安装 CLI 的版本，加入许可证与声明，并将归档和一份 `SHA256SUMS` 文件上传到 GitHub Release。

除非 `DSH_VERSION` 指定版本，否则 `scripts/install.mjs` 会选择最新发布的 `dsh-v*` Release；它把当前宿主映射到对应 Release 资产，在解压前校验 SHA-256，并以原子方式替换安装目录。脚本会在用户的可执行目录写入启动器。终端用户的安装过程只访问 GitHub API、raw 和 Release URL，不访问 npmjs。Node.js 仍是明确的前置条件，因为归档包含应用及其依赖图，不包含 Node runtime。

[npm 发布序列](2026-08-10-npm-release-sequences.md)继续作为包分发机制存在，但根 README 将 GitHub Releases 作为产品安装路径。便携归档使用现有 Release job 已验证的同一批 dsh 打包字节组装，因此包发布与 GitHub 安装不会静默携带不同的 dsh 源码载荷。

## 考虑过的替代方案

**直接从 GitHub 安装 dsh 包 tarball。** 单个包 tarball 不包含 peer dependencies 和外部运行时依赖，因此生成的 CLI 会在模块解析时失败，或重新访问 registry 补全安装。

**从仓库 checkout 安装。** 只有在完整 pnpm store 已经可用时，源码安装才不需要 npmjs；否则它仍会下载依赖，而且要求构建工具。它继续作为贡献者路径，而不是默认产品安装方式。

**在每个归档中捆绑 Node.js。** 这会消除 runtime 前置条件，但会大幅增加 Release 大小，并让项目承担 Node 安全更新责任。要求受支持的 Node.js 版本可让归档专注于产品本身。

## 后果

安装不依赖 npmjs 可用性，只执行一次经过校验的 Release 下载。归档比能够共享包缓存的 registry 安装更大，Release workflow 也必须在原生 runner 上构建每个受支持平台。新增受支持平台时，必须在同一改动中加入 runner、资产映射和安装器覆盖。GitHub 可用性仍是前置条件；固定版本的用户依赖对应 Release 资产保持不可变。
