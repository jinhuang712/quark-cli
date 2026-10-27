# Changelog

## 0.1.1 — 2026-10-27

更快，下载更完整。细节见 [FEATURES.md](FEATURES.md)。

- 不再为每条命令启动 Chrome：读命令（`ls`、`search`、`info`、`whoami`、`shares`）带着登录时存下的 cookie 直接调接口，约 0.4 秒；写命令也走 HTTP，并等到结果能被读到才返回。只有 `login`、cookie 过期后的续期、上传的网页回退才启动 Chrome
- HTTP 层：连接超时 3 秒，只重试没连上或只读的请求，网络错误统一报 `network`；`mkdir`、`rename` 以夸克的“名称已存在”为准，`mv` 确认文件最终的名字
- `download`：8MB 以上的文件分 4 段并行下载（24MB 实测 12.3 秒 → 4.8 秒）
- `download`：能下载文件夹，空文件夹也建；本地已有同名文件夹时合并，大小相同的文件跳过
- `download`：断点续传，中断后留下 `.part` 和 `.part.json`，再运行同样的命令继续
- `download --share-big`：夸克网页版不让下载的大文件（约 60MB 起）改为建一条 7 天、带提取码的分享链接
- `download --as-desktop`：以夸克桌面客户端的身份再取一次下载链接，实测 70MB 能下；模仿客户端标识，可能违反夸克的使用条款，默认关
- 文档按代码重新核对了一遍

已知缺口：上传仍没有断点续传；断点续传只在本机的 Range 服务器上验证过，没有在真实网盘上断过网；并行写入没验证过；`save` 没有成功转存过的测试。

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
