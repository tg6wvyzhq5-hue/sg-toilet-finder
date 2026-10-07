#!/usr/bin/env bash
#
# 一键启动「找厕所 · 新加坡」
#
#   ./start.sh            # 开发模式（热更新），默认 http://localhost:5188
#   ./start.sh preview    # 生产模式：先 build，再用静态服务器跑 dist，端口 5199
#   ./start.sh install    # 只安装依赖
#
# 说明：这台机器的 PATH 里原本没有 node，所以脚本会自动去找可用的 Node。
# 必须是「官方 nodejs.org / nvm / homebrew 装的 Node」——某些带 macOS 硬化运行时
# 却没有 disable-library-validation 权限的 Node（例如 DSH 自带的那份）加载不了
# rollup 的原生模块，会报 ERR_DLOPEN_FAILED。
set -euo pipefail
cd "$(dirname "$0")"

DEV_PORT="${DEV_PORT:-5188}"
PREVIEW_PORT="${PREVIEW_PORT:-5199}"

find_node_dir() {
  # 1) PATH 里已有 node
  if command -v node >/dev/null 2>&1; then
    dirname "$(command -v node)"
    return 0
  fi
  # 2) 本机固定安装的官方 Node
  for candidate in \
    "$HOME/.local/node22/bin" \
    /opt/homebrew/bin \
    /usr/local/bin \
    "$HOME/.nvm/versions/node"/*/bin
  do
    if [ -x "$candidate/node" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

if ! NODE_DIR="$(find_node_dir)"; then
  cat <<'MSG' >&2
✗ 找不到可用的 Node。

请先安装官方 Node（18 以上，推荐 20/22 LTS）：
  · 官网安装包：https://nodejs.org
  · 或 Homebrew：brew install node

装完后重新运行 ./start.sh
MSG
  exit 1
fi

export PATH="$NODE_DIR:$PATH"
echo "▸ 使用 Node $(node -v) [${NODE_DIR}]"

install_deps() {
  if [ -d node_modules/vite ]; then
    return 0
  fi
  echo "▸ 安装依赖（首次运行需要一两分钟）…"
  if command -v pnpm >/dev/null 2>&1; then
    pnpm install
  else
    npm install --no-fund --no-audit
  fi
}

lan_ip() {
  ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
}

print_urls() {
  local port="$1"
  echo
  echo "──────────────────────────────────────────────"
  echo "  本机打开：   http://localhost:${port}"
  local ip
  ip="$(lan_ip)"
  if [ -n "$ip" ]; then
    echo "  手机打开：   http://${ip}:${port}   （需同一 Wi-Fi）"
    echo "  提示：手机通过局域网 IP 访问时浏览器不给定位权限，"
    echo "        可以点地图任意位置手动选点；部署到 https 后定位才正常。"
  fi
  echo "  停止服务：   Ctrl + C"
  echo "──────────────────────────────────────────────"
  echo
}

case "${1:-dev}" in
  install)
    install_deps
    echo "✓ 依赖已就绪"
    ;;

  preview)
    install_deps
    echo "▸ 构建生产版本…"
    npm run build
    echo "▸ 启动静态服务器（端口 ${PREVIEW_PORT}）…"
    print_urls "${PREVIEW_PORT}"
    exec node -e '
      const http = require("node:http");
      const fs = require("node:fs");
      const path = require("node:path");
      const root = path.resolve("dist");
      const port = Number(process.argv[1]);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".webmanifest": "application/manifest+json",
      };
      http
        .createServer((req, res) => {
          const url = decodeURIComponent(req.url.split("?")[0]);
          let file = path.join(root, url === "/" ? "index.html" : url);
          if (!file.startsWith(root)) {
            res.writeHead(403).end("forbidden");
            return;
          }
          if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            file = path.join(root, "index.html");
          }
          res.writeHead(200, {
            "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
          });
          fs.createReadStream(file).pipe(res);
        })
        .listen(port, () => console.log(`✓ 生产版本已就绪： http://localhost:${port}`));
    ' "$PREVIEW_PORT"
    ;;

  dev | *)
    install_deps
    echo "▸ 启动开发服务器（端口 ${DEV_PORT}，支持热更新）…"
    print_urls "${DEV_PORT}"
    exec npm run dev -- --host --port "$DEV_PORT"
    ;;
esac
