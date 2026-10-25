# quark-cli

夸克网盘的命令行，**主要给 agent 用**：agent 在终端里浏览、整理、上传下载和分享你的网盘文件，你只负责扫码登录和批准有风险的操作。

夸克没有公开的命令行工具，`quark` 通过夸克网盘网页版的接口工作：用你自己登录的本机 Chrome 发请求，不经过任何第三方服务器。

## 能做什么

- **账号**：`login`（只有二维码的小窗，用夸克 APP 扫码）、`whoami`、`logout`。
- **浏览**：`ls`、`search`、`info`。
- **整理**：`mkdir`、`mv`、`rename`、`rm`（进回收站，不加 `--yes` 不会删）。
- **传输**：`upload`（文件和文件夹）、`download`（单个文件）。
- **分享**：`share`、`shares`、`unshare`、`save`。

几条贯穿所有命令的约定：

- **每个命令只做一件事。** 不自动建目录，不自动跳过、覆盖或合并同名项，不弹出提问；需要几步就用几条命令，用 `--raw` 串起来。
- **输出默认是 YAML**，字段精简；另有 `--json`、`--markdown`、`--raw`，`--full` 输出全部字段。
- **失败时 stderr 有 `error`、`code`、`exit`、`next`**，`next` 告诉调用方下一步做什么；退出码固定：0 成功，1 其他错误，2 用法不对，3 需要登录，4 找不到，5 夸克拒绝。
- **`quark --help`** 和 **`quark <命令> --help`** 讲清楚怎么用，包括会不会改动网盘、能不能撤销。

每个功能的行为、默认值和失败情况都写在 [FEATURES.md](FEATURES.md)。

## 安装

需要 Node 20 以上，和本机的 Google Chrome。

```
git clone <本仓库>
cd quark-cli
npm install
npm link
```

让 Claude Code 学会用它，把仓库里的 skill 链接过去：

```
ln -s "$(pwd)/skills/quark-cli" ~/.claude/skills/quark-cli
```

## 第一次用

```
quark login          # 弹出小窗，用夸克 APP 扫码
quark whoami
quark ls /
quark search 简历
```

登录态保存在 `~/.quark-cli/profile`。设置环境变量 `QUARK_PROFILE` 可以换位置。登录态等于账号密码，不要提交到 git，也不要拷给别人。

## 已知限制

- 只能用 Google Chrome，不支持 Edge 和 Firefox。
- 每条命令都会启动一次 Chrome，要几秒；连续发很多条命令会慢。
- `download` 只能下载单个文件，没有断点续传；`upload` 也没有断点续传。
- `save`（转存别人的分享）还没有成功转存过的测试。
- 靠夸克网页版的接口工作，夸克改版后可能要跟着改。
- 这个工具不绕过夸克的限速、风控或封禁。

还没解决的事见 [TODO.md](TODO.md)。

## 文档

- [FEATURES.md](FEATURES.md)：每个功能做什么、做不到什么、不会做什么
- [CLI.md](CLI.md)：每条命令的写法、参数、输出字段和错误码的查阅表
- [TODO.md](TODO.md)：还没验证的和还没解决的
- [CHANGELOG.md](CHANGELOG.md)
- [skills/quark-cli/SKILL.md](skills/quark-cli/SKILL.md)：教 agent 使用 `quark` 的 skill

## 许可

MIT
