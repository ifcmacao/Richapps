# Richapps

我用来学习和练习 AI 开发的自用工具空间。这个仓库同时承担两件事：

1. **网页发布通道**：一个静态站点，通过 Cloudflare Pages 自动部署。
2. **APK 发布通道**：一个最小的 Android 应用，打包后在 GitHub Release 提供下载。

首个里程碑：网页与 APK 都只做一件事——显示 **「我成功了」**，用来验证整条
“开发 → 构建 → 发布”的通道已经打通。

---

## 仓库结构

```
Richapps/
├── index.html                  # 网页内容（显示「我成功了」）
├── wrangler.toml               # Cloudflare Pages 项目配置
├── package.json                # 便捷脚本（本地预览 / 构建 APK）
├── .github/workflows/deploy.yml# 推送到 main 即自动部署到 Cloudflare Pages
├── android/
│   ├── app/                    # 最小 Android 应用源码
│   │   ├── src/.../MainActivity.java
│   │   ├── res/layout/activity_main.xml
│   │   ├── res/values/strings.xml
│   │   └── AndroidManifest.xml
│   ├── build-apk.sh            # 用 Android SDK 构建 app-release.apk
│   └── README.md               # APK 构建说明
└── README.md                   # 本文件
```

---

## 一、网页：本地预览与发布

### 本地预览
```bash
npx wrangler pages dev .
```
然后用浏览器打开提示的本地地址，应看到居中显示的「我成功了」。

### 发布到 Cloudflare Pages（两种通道，任选其一）

**通道 A（最简单，无需 Token）：Cloudflare 控制台 “Connect to Git”**
1. 打开 https://dash.cloudflare.com/pages ，点 “Create a project” → “Connect to Git”。
2. 授权 GitHub，选择本仓库 `Richapps`，构建命令留空、输出目录填 `.`。
3. 保存后，每次 `git push` 到 `main` 都会自动重新部署。

**通道 B（CI 自动部署，需要凭证）：GitHub Actions**
1. 在 Cloudflare 控制台获取：
   - **Account ID**（右侧账号下拉 → 账号首页可见）。
   - **API Token**：My Profile → API Tokens → Create Token，模板选
     “Cloudflare Pages: Edit” 或自定义勾选 `Account > Cloudflare Pages > Edit`。
2. 在本仓库 GitHub → Settings → Secrets and variables → Actions 中新增两个仓库密钥：
   - `CLOUDFLARE_API_TOKEN` = 上面的 Token
   - `CLOUDFLARE_ACCOUNT_ID` = 上面的 Account ID
3. 首次部署前，先用 Wrangler 创建 Pages 项目（只需一次）：
   ```bash
   npx wrangler pages project create richapps --production-branch=main
   ```
4. 之后任意 `git push` 到 `main`，`.github/workflows/deploy.yml` 会自动部署。

> 注：Cloudflare Pages 默认会分配一个 `*.pages.dev` 域名；如需自定义域名，在
> Cloudflare 控制台 Pages 项目里绑定即可。

---

## 二、APK：构建与发布

详见 [`android/README.md`](android/README.md)。摘要：

- 已用本机 Android SDK（`E:/RichAPP/android-sdk`，含 build-tools;34.0.0 与
  platforms;android-34）构建出 `android/build/app-release.apk`，安装打开即显示「我成功了」。
- 重新构建：`bash android/build-apk.sh`
- 发布下载：用 GitHub Release 把 `app-release.apk` 作为附件上传（见下方）。

---

## 三、一键发布 APK 到 GitHub Release

```bash
gh release create v1.0 \
  --title "Richapps v1.0（我成功了）" \
  --notes "首个里程碑：网页与 APK 均显示「我成功了」，验证发布通道打通。" \
  android/build/app-release.apk
```

发布后，仓库的 Releases 页面即提供 `app-release.apk` 下载。
