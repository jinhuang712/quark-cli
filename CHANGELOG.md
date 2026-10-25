# Changelog

## Unreleased

还没有发布过版本。到现在为止做到的，详见 [FEATURES.md](FEATURES.md)。

- 账号：`login`（只有二维码的小窗）、`whoami`、`logout`
- 浏览：`ls`、`search`、`info`
- 整理：`mkdir`、`mv`、`rename`、`rm`（不加 `--yes` 不会删，只输出删除计划）
- 传输：`upload`、`download`
- 分享：`share`、`shares`、`unshare`、`save`
- 每个命令只做一件事：目录必须已存在，同名一律失败，不弹出提问
- 输出默认 YAML，另有 `--json`、`--markdown`、`--raw`、`--full`
- 失败时输出 `error`、`code`、`exit`、`next`，退出码固定：0 成功，1 其他错误，2 用法不对，3 需要登录，4 找不到，5 夸克拒绝
- `quark --help` 和 `quark <命令> --help`
- 随仓库附一份 agent skill：`skills/quark-cli/SKILL.md`
- 自动化测试：`npm test`（72 项单元测试）、`npm run test:e2e`（77 项，真实网盘）、`npm run test:failures`（13 项失败路径）
- 环境变量 `QUARK_CHROME_PATH`：Chrome 在非标准位置时指向它

已知缺口：没有断点续传，不能下载文件夹，`save` 没有成功转存过的测试。
