#!/bin/bash
# 构建 Google Play 要求的 AAB（Android App Bundle），无 Gradle 环境
# 用法: bash build-aab.sh
set -e
ROOT="$(cd "$(dirname "$0")" && pwd)"
SDK=/e/RichAPP/android-sdk
BT="$SDK/build-tools/34.0.0"
ANDROID_JAR="$SDK/platforms/android-34/android.jar"
JDK="/c/Program Files/Java/jdk-21"
JAVA="$JDK/bin/java.exe"
OUT="$ROOT/build"
AABDIR="$OUT/aab"
APP_NAME=richapps-success
rm -rf "$AABDIR" && mkdir -p "$AABDIR/base" "$OUT/gen"

echo "[1/6] aapt2 compile 资源"
"$BT/aapt2.exe" compile --dir "$ROOT/app/res" -o "$AABDIR/res.zip"

echo "[2/6] aapt2 link --proto-format（生成 resources.pb + manifest proto）"
"$BT/aapt2.exe" link --proto-format -o "$AABDIR/base.zip" \
  -I "$ANDROID_JAR" \
  --manifest "$ROOT/app/AndroidManifest.xml" \
  --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 \
  --version-code 1 --version-name 1.0.0 \
  "$AABDIR/res.zip"

echo "[3/6] 解开 base.zip，装入 base 模块结构"
mkdir -p "$AABDIR/extract"
cd "$AABDIR/extract"
"$JDK/bin/jar.exe" -xf "$AABDIR/base.zip"
mkdir -p "$AABDIR/base/manifest" "$AABDIR/base/dex"
mv AndroidManifest.xml "$AABDIR/base/manifest/AndroidManifest.xml"
mv resources.pb "$AABDIR/base/resources.pb"
[ -d res ] && mv res "$AABDIR/base/res"

echo "[4/6] 编译 dex（Java 8 字节码）"
"$JDK/bin/javac.exe" -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$ANDROID_JAR" -classpath "$ANDROID_JAR" \
  -d "$AABDIR/classes" \
  "$ROOT/app/src/com/richapps/success/MainActivity.java" \
  "$OUT/gen/com/richapps/success/R.java"
"$JAVA" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 \
  --lib "$ANDROID_JAR" --release \
  --output "$AABDIR/base/dex" \
  $(find "$AABDIR/classes" -name '*.class')
mv "$AABDIR/base/dex/classes.dex" "$AABDIR/base/dex/classes.dex" 2>/dev/null || true

echo "[5/6] bundletool build-bundle 生成标准 AAB"
cd "$AABDIR"
rm -f "$OUT/$APP_NAME.aab" base-module.zip
python - "$AABDIR/base" "$AABDIR/base-module.zip" <<'EOF'
import zipfile, os, sys
src, out = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            full = os.path.join(root, f)
            z.write(full, os.path.relpath(full, src).replace("\\", "/"))
print("module zip ok")
EOF
"$JAVA" -jar /e/RichAPP/bundletool.jar build-bundle \
  --modules="$AABDIR/base-module.zip" --output="$OUT/$APP_NAME.aab"

echo "[6/6] 校验 AAB 结构"
unzip -l "$OUT/$APP_NAME.aab" | head -20
ls -la "$OUT/$APP_NAME.aab"
echo "AAB OK -> $OUT/$APP_NAME.aab"
