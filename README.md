# quark-cli

夸克网盘的命令行：在终端里登录、浏览、整理、上传下载和分享自己的网盘文件。

夸克没有公开的命令行工具，`quark` 通过夸克网盘网页版的接口工作：用你自己登录的本机 Chrome 发请求，不经过任何第三方服务器。

## 能做什么

- **账号**：`login` 弹出只有二维码的小窗，用夸克 APP 扫码；`whoami` 看账号、容量和会员；`logout`。
- **浏览**：`ls`、`search`、`info`。
- **整理**：`mkdir`、`mv`、`rename`、`rm`（进回收站，默认要确认）。
- **传输**：`upload`（文件和文件夹）、`download`（单个文件）。
- **分享**：`share`、`shares`、`unshare`、`save`。
- **给脚本用**：每个命令都有 `--json`，退出码固定。

每个功能的行为、默认值和失败情况都写在 [FEATURES.md](FEATURES.md)。

## 安装

需要 Node 20 以上，和本机的 Google Chrome。

```
git clone <本仓库>
cd quark-cli
npm install
npm link
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
- `download` 只能下载单个文件，没有断点续传；`upload` 也没有断点续传。
- `save`（转存别人的分享）还没有成功转存过的测试。
- 靠夸克网页版的接口工作，夸克改版后可能要跟着改。
- 这个工具不绕过夸克的限速、风控或封禁。

## 文档

- [FEATURES.md](FEATURES.md)：每个功能做什么、做不到什么、不会做什么
- [CHANGELOG.md](CHANGELOG.md)

## 许可

MIT
