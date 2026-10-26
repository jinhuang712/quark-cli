# Changelog

## 0.1.0 — 2026-10-26

第一个版本。每个功能的细节见 [FEATURES.md](FEATURES.md)。

- 账号：`login`（只有二维码的小窗）、`whoami`、`logout`
- 浏览：`ls`、`search`、`info`
- 整理：`mkdir`、`mv`、`rename`、`rm`（不加 `--yes` 不会删，只输出删除计划）
- 传输：`upload`（直接调夸克上传接口，3 个文件并行，出意外退回网页上传）、`download`
- 分享：`share`、`shares`、`unshare`、`save`
- 每个命令只做一件事：目录必须已存在，同名一律失败，不弹出提问
- 输出默认 YAML，另有 `--json`、`--markdown`、`--raw`、`--full`
- 失败时输出 `error`、`code`、`exit`、`next`，退出码固定：0 成功，1 其他错误，2 用法不对，3 需要登录，4 找不到，5 夸克拒绝
- `quark --help`、`quark <命令> --help` 和 `quark --version`
- 一行安装 `install.sh`（安装、升级、卸载），同时装 Claude Code skill
- 随仓库附一份 agent skill：`skills/quark-cli/SKILL.md`
- 被 Ctrl-C 打断时安静地以 130 退出
- 环境变量 `QUARK_CHROME_PATH`：Chrome 在非标准位置时指向它

已知缺口：没有断点续传，不能下载文件夹，`save` 没有成功转存过的测试。
