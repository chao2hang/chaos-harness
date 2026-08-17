# DeepSeek Harness

[English](README.md) | 中文

DeepSeek Harness（`dsh`）是由 [DeepSeek AI](https://deepseek.com) 开发的开源 agent harness（智能体框架）。

它采用**一切皆插件**的架构，并由 [Cordis](https://github.com/cordiverse/cordis) 驱动，其设计参见论文 [_A Programming Paradigm for Spatiotemporal Composability_](https://github.com/cordiverse/paper)。

## 开发者预览

DeepSeek Harness 目前处于 _开发者预览_ 阶段，正在快速迭代。**未来将出现破坏兼容性的变更。**

## 运行

### 从 GitHub Releases 安装

安装 [Node.js 22.19 或更高版本](https://nodejs.org/)，然后从 GitHub 下载最新的自包含版本：

```sh
curl -fsSL https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/scripts/install.mjs | node --input-type=module
dsh web
```

安装器会使用 Release 中的 `SHA256SUMS` 校验归档，将程序安装到 `~/.local/share/dsh`，并把启动器放到 `~/.local/bin`；整个安装过程不会访问 npmjs。可通过 `DSH_VERSION` 安装指定版本，也可通过 `DSH_INSTALL_DIR` 和 `DSH_BIN_DIR` 指定其他目录。

Windows 用户可在 PowerShell 中运行等效命令；启动器将安装到 `%LOCALAPPDATA%\DeepSeek Harness\bin`：

```powershell
irm https://raw.githubusercontent.com/deepseek-ai/deepseek-harness/master/scripts/install.mjs | node --input-type=module
dsh web
```

`dsh web` 会启动 Web UI，默认地址为 `http://127.0.0.1:3080`。通过反向代理部署远程 HTTPS 时，请配置访问令牌和公网地址：

```sh
export DSH_WEB_TOKEN='replace-with-a-random-token'
dsh web --host 0.0.0.0 --auth required --public-url https://dsh.example.com
```

TLS 与部署参数详见 [Web UI 指南](docs/user/guide/index.md)。

### 从源码运行

如需从仓库源码运行：

```sh
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install
pnpm run build
pnpm dsh web
```

## 社区与支持

- 欢迎通过 [GitHub Discussions](https://github.com/deepseek-ai/deepseek-harness/discussions) 提交反馈或 bug 报告。
- 为你的插件仓库添加 [`dsh-plugin`](https://github.com/topics/dsh-plugin) 话题，便于被发现。
- 欢迎加入 DeepSeek Harness 企微群：扫码添加企微小助手并填写入群问卷，完成后小助手会邀请你入群。

<table>
  <thead>
    <tr>
      <th align="center">企微小助手</th>
      <th align="center">入群问卷</th>
      <th align="center">微信公众号</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td align="center"><img src="assets/community-wecom-assistant.png" alt="DeepSeek Harness 企微小助手二维码" width="180" height="180"></td>
      <td align="center"><a href="https://trtgsjkv6r.feishu.cn/share/base/form/shrcnIt5twSVdLGD52KJBckGCgg"><img src="assets/community-wecom-survey.png" alt="DeepSeek Harness 入群问卷二维码" width="180" height="180"></a></td>
      <td align="center"><img src="assets/community-wechat-official-account.png" alt="DeepSeek Harness 团队微信公众号二维码" width="180" height="180"></td>
    </tr>
  </tbody>
</table>

## 参与贡献

参见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 开发

请先阅读[开发指南](docs/development.md)与[架构文档](docs/architecture.md)。

面向 agent：请遵循 [AGENTS.md](AGENTS.md)。

## 许可证

[MIT](LICENSE)

第三方依赖及其许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
