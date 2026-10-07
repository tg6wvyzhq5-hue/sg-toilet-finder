#!/usr/bin/env bash
#
# 把本地的生产版本通过 Cloudflare 临时隧道分享成一个公开的 https 网址。
# 不需要任何账号，适合「先发给朋友看看」；缺点是地址是临时的：
#   · 关掉这个终端 / 电脑睡眠，地址就会失效
#   · 每次重启地址都会变
# 要长期稳定的地址，请按 DEPLOY.md 部署到 Vercel / Cloudflare Pages 等平台。
#
#   ./share.sh
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PREVIEW_PORT:-5199}"
CLOUDFLARED="${CLOUDFLARED:-$HOME/.local/bin/cloudflared}"

find_node_dir() {
  if command -v node >/dev/null 2>&1; then
    dirname "$(command -v node)"
    return 0
  fi
  for candidate in \
    "${HOME}/.local/node22/bin" \
    /opt/homebrew/bin \
    /usr/local/bin \
    "${HOME}/.nvm/versions/node"/*/bin
  do
    if [ -x "${candidate}/node" ]; then
      echo "${candidate}"
      return 0
    fi
  done
  return 1
}

if ! NODE_DIR="$(find_node_dir)"; then
  echo "✗ 找不到 Node，请先安装官方 Node（https://nodejs.org）" >&2
  exit 1
fi
export PATH="${NODE_DIR}:$PATH"

if [ ! -x "${CLOUDFLARED}" ]; then
  echo "▸ 下载 cloudflared…"
  mkdir -p "$(dirname "${CLOUDFLARED}")"
  tmp="$(mktemp -d)"
  curl -sSL -o "${tmp}/cf.tgz" \
    "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-arm64.tgz"
  tar xzf "${tmp}/cf.tgz" -C "${tmp}"
  mv "${tmp}/cloudflared" "${CLOUDFLARED}"
  chmod +x "${CLOUDFLARED}"
  rm -rf "${tmp}"
fi

# 1) 确保本地静态服务器在跑
if curl -s -m 3 -o /dev/null "http://127.0.0.1:${PORT}/"; then
  echo "▸ 本地服务器已在运行：http://localhost:${PORT}"
else
  echo "▸ 构建并启动本地服务器（端口 ${PORT}）…"
  if [ ! -d dist ]; then
    npm run build
  fi
  node -e '
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
        if (!file.startsWith(root)) return res.writeHead(403).end("forbidden");
        if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
          file = path.join(root, "index.html");
        }
        res.writeHead(200, {
          "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
        });
        fs.createReadStream(file).pipe(res);
      })
      .listen(port, () => console.log(`  ✓ http://localhost:${port}`));
  ' "${PORT}" &
  SERVER_PID=$!
  trap 'kill "${SERVER_PID}" 2>/dev/null || true' EXIT
  sleep 2
fi

# 2) 开隧道（前台运行，Ctrl+C 结束）
echo "▸ 正在申请公开的 https 地址…"
echo
exec "${CLOUDFLARED}" tunnel --url "http://localhost:${PORT}" --no-autoupdate
