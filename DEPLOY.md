# 部署到公开网站

这个项目是**纯静态站点**：没有后端、没有数据库、不需要任何环境变量（除非你要启用可选的 Google Places）。
`npm run build` 出来的 `dist/` 直接扔到任何静态托管上就能跑。

## 部署前必读

1. **必须用 https**。浏览器只在 https 或 localhost 下提供定位权限。上面这些平台默认都是 https，不用额外配置。
2. **不需要配任何 Key**。地图瓦片用 OSM，地点搜索用 Nominatim，都是免 Key 的公共服务。
3. **想启用 Google Places 才需要环境变量**：在托管平台的项目设置里加 `VITE_GOOGLE_MAPS_API_KEY`，
   然后**重新部署**（Vite 的变量是构建时注入的，改完必须重新构建）。
   同时记得去 Google Cloud 给这个 Key 加 **HTTP referrer 限制**，填你部署后的域名（例如 `https://xxx.vercel.app/*`）。
4. **子路径部署也没问题**：`vite.config.ts` 里设了 `base: './'`，产物全是相对路径，
   放在 `用户名.github.io/仓库名/` 这种二级路径下也能正常加载（已实测）。

---

## 方案 0：先临时分享出去看看（不需要账号）

```bash
./share.sh
```

脚本会构建生产版本、起本地静态服务器，然后用 Cloudflare 的临时隧道给你一个
`https://xxxx.trycloudflare.com` 的公开地址。**因为是 https，定位功能是真能用的**，
可以直接发给朋友在手机上试。

限制（Cloudflare 官方说明，无账号隧道不提供可用性保证）：

- 关掉终端 / 电脑睡眠后地址立即失效
- 每次运行地址都会变，不能当正式域名用
- 不适合对外长期发布

要长期稳定的地址，继续看下面的方案 A~D，都需要你本人登录一次账号
（创建账号、授权登录这类操作必须你自己完成，我无法代劳）。

---

## 方案 A：Vercel（最省事，推荐）

已经放了 `vercel.json`（构建命令、输出目录、缓存头都配好了）。

**A1. 命令行部署**

```bash
cd sg-toilet-finder
npx vercel            # 首次会让你登录并确认项目设置，一路回车即可
npx vercel --prod     # 部署到正式环境，会给你一个 https://xxx.vercel.app 域名
```

**A2. Git 导入**

1. 把项目推到 GitHub
2. vercel.com → Add New → Project → 选这个仓库
3. Framework 会自动识别成 Vite，直接 Deploy

> 之后每次 `git push` 都会自动重新部署。

## 方案 B：Netlify

已经放了 `netlify.toml`。两种方式：

```bash
# 命令行
npx netlify-cli deploy --prod --dir=dist

# 或者：直接打开 app.netlify.com/drop，把 dist 文件夹拖进去
```

拖拽方式最快，适合只是想先给朋友看。

## 方案 C：Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → 连接 Git 仓库
2. 构建命令 `npm run build`，输出目录 `dist`
3. 免费、自带 CDN，国内访问通常比 Vercel/Netlify 稳一些

## 方案 D：GitHub Pages

仓库里已经放好 `.github/workflows/deploy-pages.yml`：

1. 把项目推到 GitHub（默认分支 `main`）
2. 仓库 Settings → Pages → Source 选 **GitHub Actions**
3. push 之后 Actions 会自动构建并发布到 `https://用户名.github.io/仓库名/`

工作流里已经做了两件必要的事：`touch dist/.nojekyll`（避免 Jekyll 忽略目录）、
用 `base: './'` 的相对路径产物（适配 `/仓库名/` 子路径）。

## 方案 E：国内访问的实际情况

- Vercel / Netlify 的默认域名（`*.vercel.app`）在中国大陆**访问经常不稳定甚至打不开**，Cloudflare Pages 好一些但也不保证。
- 如果主要给国内用户用，比较稳的做法是：**腾讯云 COS / 阿里云 OSS 静态网站托管 + CDN**。
  把 `dist/` 整个上传上去，开启静态网站托管，再把自定义域名接上 CDN。
- 注意：用国内服务器/CDN 绑定自定义域名需要 **ICP 备案**；用平台自带的域名（`*.vercel.app` 等）不需要备案，但访问质量看运气。
- 如果只是自己和小范围朋友用，Vercel 的免费域名通常够用；要发给新加坡当地用户用，Vercel/Cloudflare 都很快。

---

## 部署后检查清单

- [ ] 手机浏览器打开，出现定位授权弹窗 → 允许 → 顶部显示「离你最近的厕所」和真实距离
- [ ] 点「开始步行导航」能跳转到 Google Maps（iOS 上应优先弹 Apple 地图）
- [ ] 底部面板往上拖，点「数据说明」能看到点位总数
- [ ] Safari/Chrome 菜单里能「添加到主屏幕」，打开后是全屏无地址栏（PWA 生效）
- [ ] 断网后重新打开还能看到地图和列表（Service Worker 离线缓存生效）

## 更新数据后要重新部署

内置点位数据是构建时抓的快照，更新流程：

```bash
npm run fetch:data    # 重新抓 OSM（有缓存，只补缺的部分）
npm run build         # 或直接 git push 让平台重新构建
```

如果只是想让线上数据变新，也可以不重新部署：应用内「数据说明」→「从 OpenStreetMap 在线更新点位」，
它会直接请求 Overpass API 刷新实测厕所图层（用户端即时生效，但不会持久化）。

## 常见问题

**白屏 / 改了代码线上没变化**
Service Worker 缓存造成的。本项目已经做了正确的策略（HTML 走 network-first、只有带哈希的
`/assets/*` 才长缓存），正常不会白屏。如果你手动改过 `sw.js` 逻辑导致卡住，
可以在浏览器 DevTools → Application → Service Workers 里 Unregister，然后硬刷新。

**`sw.js` 被 CDN 长效缓存，导致版本更新推不下去**
`vercel.json` 和 `netlify.toml` 里都已经给 `/sw.js` 设了 `no-cache`。用其他托管时请照抄这条。

**部署后定位不可用**
检查是不是 http 访问（比如自己用 Nginx 起的静态站点没配证书）。必须是 https。

**子路径部署后图标/清单 404**
`index.html` 里的 manifest、icon 路径都必须是相对路径（本项目已经改成 `./xxx`）。
如果你又改回了 `/xxx`，放在 `/仓库名/` 下就会 404。
