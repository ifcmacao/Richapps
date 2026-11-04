# Android 应用：「我成功了」

一个最小化的 Android 应用，打开即全屏居中显示 **「我成功了」**。
目的：打通“写代码 → 用 Android SDK 打包 APK → 在 GitHub 发布下载”的通道。

## 源码结构

```
app/
├── src/com/richapps/success/MainActivity.java   # 入口 Activity
├── res/layout/activity_main.xml                 # 布局：居中 TextView
├── res/values/strings.xml                       # 字符串资源（含“我成功了”）
└── AndroidManifest.xml                          # 清单：声明 Launcher Activity
```

## 构建前提

需要本机 Android SDK，且至少包含：

- `build-tools;34.0.0`（提供 `aapt2`、`d8`、`zipalign`）
- `platforms;android-34`（提供 `android.jar`）

本项目默认 SDK 路径为 `E:/RichAPP/android-sdk`（Windows）。
若你的路径不同，编辑 `build-apk.sh` 顶部的 `ANDROID_HOME` 即可。

> 安装 SDK 的命令示例（Windows PowerShell）：
> ```powershell
> $env:ANDROID_HOME = "E:\RichAPP\android-sdk"
> $env:JAVA_HOME   = "C:\Program Files\Java\jdk-21"
> & "$env:ANDROID_HOME\cmdline-tools\latest\bin\sdkmanager.bat" `
>     --sdk_root=$env:ANDROID_HOME "build-tools;34.0.0" "platforms;android-34"
> ```

## 构建

```bash
bash android/build-apk.sh
```

产物：`android/build/app-release.apk`

构建流程（脚本自动完成）：
1. `aapt2 compile` 编译 `res/` 资源
2. `aapt2 link` 链接资源 + 清单 → 未签名 APK 与 `R.java`
3. `javac` 编译 `MainActivity.java` 与 `R.java`
4. `d8` 把 `.class` 转成 `classes.dex`
5. 把 `classes.dex` 打进 APK
6. `zipalign` 对齐
7. `jarsigner` 用本地生成的 `keystore/release.keystore` 签名

## 安装到手机验证

把 `app-release.apk` 传到 Android 手机，允许“未知来源”安装后打开，
应看到深色背景上居中显示的白色「我成功了」。

> 说明：签名使用脚本自动生成的演示密钥库（口令 `android`）。正式发布到应用商店
> 前，请替换为自己的正式密钥库。
