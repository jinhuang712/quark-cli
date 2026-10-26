#!/usr/bin/env bash
# quark-cli 一行安装脚本：安装命令行（全局 quark 命令）和 Claude Code skill。
#   curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash
# 不用 sudo，不改 shell 配置文件。再运行一次就是升级。
#
# 整个逻辑都在函数里，最后一行才调用 main：curl | bash 下载到一半时不会执行半截脚本。
set -euo pipefail

main() {
  local REPO="jinhuang712/quark-cli"

  local home_dir="${HOME:-}"
  local install_dir="${QUARK_INSTALL_DIR:-$home_dir/.local/share/quark-cli}"
  local bin_dir="${QUARK_BIN_DIR:-$home_dir/.local/bin}"
  local skills_dir="${CLAUDE_SKILLS_DIR:-$home_dir/.claude/skills}"
  local version="main"
  local want_skill=1
  local do_uninstall=0
  local print_url=0

  # 临时目录：退出时统一清理，失败不留半截
  TMP_PATHS=()
  cleanup() {
    local p
    # bash 3.2 下空数组配合 set -u 会报错，所以先判断长度
    if [ "${#TMP_PATHS[@]}" -gt 0 ]; then
      for p in "${TMP_PATHS[@]}"; do
        [ -n "$p" ] && rm -rf "$p"
      done
    fi
  }
  trap cleanup EXIT

  die() {
    printf '错误：%s\n' "$1" >&2
    if [ -n "${2:-}" ]; then printf '下一步：%s\n' "$2" >&2; fi
    exit 1
  }
  info() { printf '%s\n' "$*"; }

  usage() {
    cat <<'EOF'
quark-cli 安装脚本

用法：
  curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash
  curl -fsSL https://raw.githubusercontent.com/jinhuang712/quark-cli/main/install.sh | bash -s -- [参数]
  bash install.sh [参数]

参数：
  --version <版本>   安装指定的 tag（默认 main，即最新代码）
  --no-skill         只装命令行，不装 Claude Code skill
  --uninstall        卸载：删除安装目录、quark 命令和 skill
                     （不删登录态，命令结束时会告诉你位置）
  -h, --help         显示这段帮助

环境变量：
  QUARK_INSTALL_DIR  安装目录，默认 ~/.local/share/quark-cli
  QUARK_BIN_DIR      quark 命令所在目录，默认 ~/.local/bin
  CLAUDE_SKILLS_DIR  skill 目录，默认 ~/.claude/skills
  QUARK_ARCHIVE_URL  改从这个 tar.gz 地址下载（测试用）

需要 Node 20 以上和 npm。再运行一次同样的命令就是升级。不使用 sudo，不修改 .zshrc、.bashrc 等配置文件。
EOF
  }

  while [ "$#" -gt 0 ]; do
    case "$1" in
      --version)
        [ "$#" -ge 2 ] || die "--version 后面要跟版本号。" "例如 --version v0.1.0"
        version="$2"
        shift 2
        ;;
      --version=*) version="${1#--version=}"; shift ;;
      --no-skill) want_skill=0; shift ;;
      --uninstall) do_uninstall=1; shift ;;
      --print-url) print_url=1; shift ;;
      -h | --help) usage; return 0 ;;
      *) usage >&2; die "不认识的参数：$1" "看上面的用法，或加 --help。" ;;
    esac
  done

  [ -n "$home_dir" ] || [ -n "${QUARK_INSTALL_DIR:-}" ] || die "环境变量 HOME 没有设置。" "设置 HOME，或同时设置 QUARK_INSTALL_DIR、QUARK_BIN_DIR、CLAUDE_SKILLS_DIR。"

  case "$version" in
    "" | *[!A-Za-z0-9._-]*) die "版本号只能包含字母、数字、点、下划线和连字符：$version" ;;
  esac

  local archive_url
  if [ -n "${QUARK_ARCHIVE_URL:-}" ]; then
    archive_url="$QUARK_ARCHIVE_URL"
  elif [ "$version" = "main" ]; then
    archive_url="https://github.com/$REPO/archive/refs/heads/main.tar.gz"
  else
    archive_url="https://github.com/$REPO/archive/refs/tags/$version.tar.gz"
  fi
  if [ "$print_url" -eq 1 ]; then
    info "$archive_url"
    return 0
  fi

  local link="$bin_dir/quark"
  local skill_target="$skills_dir/quark-cli"

  # ---------- 卸载 ----------
  if [ "$do_uninstall" -eq 1 ]; then
    info "卸载 quark-cli ..."
    if [ -d "$install_dir" ]; then
      rm -rf "$install_dir"
      info "  已删除安装目录：$install_dir"
    else
      info "  安装目录不存在，跳过：$install_dir"
    fi
    if [ -L "$link" ]; then
      case "$(readlink "$link")" in
        "$install_dir"/*)
          rm -f "$link"
          info "  已删除命令：$link"
          ;;
        *) info "  $link 不是指向本脚本安装目录的，没有删除。" ;;
      esac
    elif [ -e "$link" ]; then
      info "  $link 不是本脚本生成的，没有删除。"
    else
      info "  命令不存在，跳过：$link"
    fi
    if [ -d "$skill_target" ]; then
      rm -rf "$skill_target"
      info "  已删除 skill：$skill_target"
    else
      info "  skill 不存在，跳过：$skill_target"
    fi
    info ""
    info "没有删除登录态（等于你的账号密码）："
    info "  ${QUARK_PROFILE:-$home_dir/.quark-cli/profile}"
    info "想清掉它：先运行 quark logout，或者 rm -rf '$home_dir/.quark-cli'"
    return 0
  fi

  # ---------- 前置检查 ----------
  command -v curl > /dev/null 2>&1 || die "没有找到 curl。" "先装好 curl。"
  command -v tar > /dev/null 2>&1 || die "没有找到 tar。" "先装好 tar。"
  command -v node > /dev/null 2>&1 || die "没有找到 node。" "先装 Node 20 或更新版本：https://nodejs.org"
  command -v npm > /dev/null 2>&1 || die "没有找到 npm。" "npm 随 Node 一起安装，重装 Node。"
  local node_major
  node_major="$(node -p 'process.versions.node.split(".")[0]')"
  [ "$node_major" -ge 20 ] 2> /dev/null || die "Node 版本太旧（$node_major），需要 20 或更新。" "升级 Node：https://nodejs.org"

  # ---------- 下载并解开 ----------
  local work
  work="$(mktemp -d "${TMPDIR:-/tmp}/quark-cli-install.XXXXXX")"
  TMP_PATHS+=("$work")
  info "下载 $archive_url ..."
  curl -fsSL "$archive_url" -o "$work/src.tar.gz" || die "下载失败：$archive_url" "检查网络，或确认版本 $version 存在。"
  mkdir "$work/src"
  tar -xzf "$work/src.tar.gz" -C "$work/src" --strip-components=1 || die "解压失败。" "重试一次。"
  [ -f "$work/src/bin/quark.js" ] || die "下载下来的不是 quark-cli。" "确认版本 $version 存在。"

  # ---------- 装依赖，成功才替换旧版本 ----------
  info "安装依赖 ..."
  (cd "$work/src" && npm ci --omit=dev --no-audit --no-fund --silent) || die "npm 安装依赖失败。" "看上面的 npm 输出，修好后重新运行。"

  mkdir -p "$(dirname "$install_dir")" "$bin_dir"
  rm -rf "$install_dir.old"
  [ -d "$install_dir" ] && mv "$install_dir" "$install_dir.old"
  if ! mv "$work/src" "$install_dir"; then
    [ -d "$install_dir.old" ] && mv "$install_dir.old" "$install_dir"
    die "替换安装目录失败，已还原旧版本。"
  fi
  rm -rf "$install_dir.old"

  chmod +x "$install_dir/bin/quark.js"
  ln -sf "$install_dir/bin/quark.js" "$link"
  info "已安装：$link"

  if [ "$want_skill" -eq 1 ]; then
    mkdir -p "$skills_dir"
    rm -rf "$skill_target"
    cp -R "$install_dir/skills/quark-cli" "$skill_target"
    info "已安装 skill：$skill_target"
  fi

  case ":$PATH:" in
    *":$bin_dir:"*) ;;
    *)
      info ""
      info "注意：$bin_dir 不在 PATH 里。把这一行加到你的 shell 配置里："
      info "  export PATH=\"$bin_dir:\$PATH\""
      ;;
  esac

  local chrome_ok=0
  if [ -d "/Applications/Google Chrome.app" ] || command -v google-chrome > /dev/null 2>&1 || [ -n "${QUARK_CHROME_PATH:-}" ]; then
    chrome_ok=1
  fi
  if [ "$chrome_ok" -eq 0 ]; then
    info ""
    info "注意：没有找到 Google Chrome。quark 需要它；装在非标准位置时设置 QUARK_CHROME_PATH。"
  fi

  info ""
  info "下一步：运行 quark login，用夸克 APP 扫码登录。"
}

main "$@"
