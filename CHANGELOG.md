# Changelog

## 0.2.0 — 2026-10-26

改成以 agent 为主要使用者，详见 [FEATURES.md](FEATURES.md)。

- 输出：默认 YAML，字段精简；新增 `--markdown`、`--raw`、`--full`，`--json` 内容与 YAML 一致；四种格式互斥。
- 错误：stderr 固定输出 `error`、`code`、`exit`、`next`，夸克的原话放在 `detail`；`rm` 的删除计划放在 `plan`。
- 帮助：新增 `quark --help` 和 `quark <命令> --help`，由各命令的说明自动生成；输出到 stdout，退出码 0。
- 每个命令只做一件事：
  - `login` 已登录时失败，不再有 `--force`；换账号先 `logout`。
  - `ls` 的路径是文件时失败，看单个文件用 `info`。
  - `rm` 不再提问；不加 `--yes` 什么都不删，返回 `confirmation_required` 和 `plan`。
  - `upload <本地路径> <网盘目录>`、`download <网盘路径> <本地目录>`、`save <链接> <网盘目录>`：两个参数必填，目录必须已存在，同名一律失败，不再自动建目录、跳过或合并。
  - `upload` 一次只传一个本地路径，去掉了 `--to`。
- 路径解析改用一次路径接口请求，深路径不再逐层列目录。
- 新增随仓库的 agent skill：`skills/quark-cli/SKILL.md`。

## 0.1.0 — 2026-10-26

第一版，18 个功能，详见 [FEATURES.md](FEATURES.md)。

- 账号：`login`（只有二维码的小窗）、`whoami`、`logout`
- 浏览：`ls`、`search`、`info`
- 整理：`mkdir`、`mv`、`rename`、`rm`
- 传输：`upload`、`download`
- 分享：`share`、`shares`、`unshare`、`save`
- 每个命令支持 `--json`，退出码固定：0 成功，1 其他错误，2 用法不对，3 需要登录，4 找不到，5 夸克拒绝

已知缺口：没有断点续传，不能下载文件夹，`save` 没有成功转存过的测试。
