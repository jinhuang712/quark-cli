# 安装

## 前置条件

- Node 20 或更新版本，和 npm。
- 本机的 Google Chrome（只支持 Chrome，不支持 Edge 和 Firefox）。
- 只在 macOS 上测过。

## 一行安装

```bash
curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash
```

它会：

- 把代码装到 `~/.local/share/quark-cli`，依赖装在里面。
- 在 `~/.local/bin/quark` 放一个指向它的命令，装完直接敲 `quark --help`。
- 把 Claude Code skill 装到 `~/.claude/skills/quark-cli`。

它不会：

- 不用 sudo。
- 不改 `.zshrc`、`.bashrc` 等配置文件。如果 `~/.local/bin` 不在 PATH 里，脚本会告诉你怎么加。
- 不替你装 Node 和 Chrome，缺了只提示。

再运行一次同样的命令就是升级。依赖装好才会替换旧版本，装失败不会留下装了一半的版本。

装完第一件事：

```bash
quark login    # 弹出小窗，用夸克 APP 扫码
quark whoami
```

## 参数

参数写在 `bash -s --` 后面：

```bash
# 只装命令行，不装 skill
curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash -s -- --no-skill

# 装指定版本
curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash -s -- --version v0.1.0

# 卸载
curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash -s -- --uninstall
```

| 参数              | 作用                                  |
| ----------------- | ------------------------------------- |
| `--version <tag>` | 装指定版本，默认装 `main`（最新代码） |
| `--no-skill`      | 只装命令行，不装 skill                |
| `--uninstall`     | 卸载（见下）                          |

| 环境变量            | 作用                                      |
| ------------------- | ----------------------------------------- |
| `QUARK_INSTALL_DIR` | 安装目录，默认 `~/.local/share/quark-cli` |
| `QUARK_BIN_DIR`     | `quark` 命令所在目录，默认 `~/.local/bin` |
| `CLAUDE_SKILLS_DIR` | skill 目录，默认 `~/.claude/skills`       |
| `QUARK_CHROME_PATH` | Chrome 在非标准位置时，指向它的可执行文件 |
| `QUARK_PROFILE`     | 登录态的位置，默认 `~/.quark-cli/profile` |

## 卸载

用上面的 `--uninstall`。它删除安装目录、`quark` 命令和 skill，**不删登录态**。登录态等于你的账号密码，想清掉它：先运行 `quark logout`，或者 `rm -rf ~/.quark-cli`。

## 手动安装

```bash
git clone https://github.com/jinhuang712/quark-cli.git
cd quark-cli
npm install
npm link                                   # 得到全局的 quark 命令
ln -s "$(pwd)/skills/quark-cli" ~/.claude/skills/quark-cli
```
