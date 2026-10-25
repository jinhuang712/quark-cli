# Changelog

## 0.1.0 — 2026-10-26

第一版，18 个功能，详见 [FEATURES.md](FEATURES.md)。

- 账号：`login`（只有二维码的小窗）、`whoami`、`logout`
- 浏览：`ls`、`search`、`info`
- 整理：`mkdir`、`mv`、`rename`、`rm`
- 传输：`upload`、`download`
- 分享：`share`、`shares`、`unshare`、`save`
- 每个命令支持 `--json`，退出码固定：0 成功，1 其他错误，2 用法不对，3 需要登录，4 找不到，5 夸克拒绝

已知缺口：没有断点续传，不能下载文件夹，`save` 没有成功转存过的测试。
