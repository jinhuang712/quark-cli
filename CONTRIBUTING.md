# 参与开发

## 先读这些

- [FEATURES.md](FEATURES.md)：每个功能做什么、不做什么。新功能或改行为，先改它。
- [CLI.md](CLI.md)：命令、参数、输出字段、错误码的查阅表。
- 每条命令是 `src/commands/` 下的一个模块，格式见 `src/cli.js` 开头的注释。

## 约定

- **每个命令只做一件事**：不隐式建目录，不自动跳过、覆盖或合并，不弹出提问。
- **失败要给 agent 能照做的话**：`error`、`code`、`exit`、`next`。新增错误码要同步 `src/errors.js`、`FEATURES.md`、`CLI.md` 和 skill。
- 输出默认 YAML，另有 `--json`、`--markdown`、`--raw`、`--full`；新命令要全部支持。

## 开发

```bash
npm install
npm test               # 单元测试，离线
npm run lint           # oxlint
npm run format         # oxfmt；提交前跑一次，CI 里是 format:check
```

## 测试

| 命令                    | 需要什么                     | 在 CI 里 |
| ----------------------- | ---------------------------- | -------- |
| `npm test`              | 什么都不要                   | 是       |
| `npm run test:e2e`      | 已经 `quark login` 过的账号  | 否       |
| `npm run test:failures` | 同上，外加没装 Chrome 等模拟 | 否       |

端到端和失败路径测试要真实的夸克账号和网盘，所以 CI 跑不了，**发布前由维护者在本机跑**。它们用登录态的副本（不碰原件），网盘上的写操作只在带时间戳的 `quark-cli-test-*` 文件夹里，测完自动删，并且删除前会检查前缀。

没法自动测的（需要第二个账号的分享链接等）见 [TODO.md](TODO.md)。

## 提交

小步提交，一次提交一件事。提交信息写清楚改了什么、为什么。
