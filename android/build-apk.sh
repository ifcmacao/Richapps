#!/usr/bin/env bash
#
# 用 Android SDK 构建“我成功了”APK。
# 前置：本机已安装 Android SDK（build-tools;34.0.0 + platforms;android-34），
#       默认位于 E:/RichAPP/android-sdk。
# 用法：bash android/build-apk.sh
# 产物：android/build/app-release.apk
#
set -e

ANDROID_HOME="/e/RichAPP/android-sdk"
BUILD_TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34"

# 原生可执行文件（Windows 下带扩展名）
AAPT2="$BUILD_TOOLS/aapt2.exe"
ZIPALIGN="$BUILD_TOOLS/zipalign.exe"
D8_BAT="$BUILD_TOOLS/d8.bat"
ANDROID_JAR="$PLATFORM/android.jar"
JARSIGNER="/c/Program Files/Java/jdk-21/bin/jarsigner.exe"
KEYTOOL="/c/Program Files/Java/jdk-21/bin/keytool.exe"

# 确保 cmd 子进程也能找到 java
export PATH="/c/Program Files/Java/jdk-21/bin:$PATH"

# 工程路径
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$SCRIPT_DIR/app"
OUT="$SCRIPT_DIR/build"
GEN="$OUT/gen"; OBJ="$OUT/obj"; DEXDIR="$OUT/dex"; APKDIR="$OUT/apk"
KEYSTORE_DIR="$SCRIPT_DIR/keystore"
KEYSTORE="$KEYSTORE_DIR/release.keystore"

rm -rf "$OUT"
mkdir -p "$GEN" "$OBJ" "$DEXDIR" "$APKDIR" "$KEYSTORE_DIR"

echo "[1/7] 编译资源 (aapt2 compile)"
"$AAPT2" compile -o "$OBJ/res.flata" --dir "$ROOT/res"

echo "[2/7] 链接资源与清单 (aapt2 link) -> 未签名 APK + R.java"
"$AAPT2" link -o "$APKDIR/unaligned.apk" \
  -I "$ANDROID_JAR" \
  --java "$GEN" \
  --manifest "$ROOT/AndroidManifest.xml" \
  "$OBJ/res.flata" \
  --min-sdk-version 21 --target-sdk-version 34

echo "[3/7] 编译 Java (javac, 目标 Java 8 字节码以兼容 d8)"
javac -encoding UTF-8 --release 8 -classpath "$ANDROID_JAR" -d "$DEXDIR" \
  "$ROOT/src/com/richapps/success/MainActivity.java" \
  "$GEN/com/richapps/success/R.java"

echo "[4/7] 转 DEX (d8)"
CLASSFILES=$(find "$DEXDIR" -name '*.class' | tr '\n' ' ')
java -cp "$BUILD_TOOLS/lib/d8.jar" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --output "$DEXDIR" $CLASSFILES

echo "[5/7] 把 classes.dex 打进 APK"
(cd "$DEXDIR" && cp "$APKDIR/unaligned.apk" "$APKDIR/with-dex.apk" && jar u0f "$APKDIR/with-dex.apk" classes.dex)

echo "[6/7] 对齐 (zipalign)"
"$ZIPALIGN" -p 4 "$APKDIR/with-dex.apk" "$APKDIR/aligned.apk"

echo "[7/7] 签名 (jarsigner)"
if [ ! -f "$KEYSTORE" ]; then
  "$KEYTOOL" -genkeypair -v -keystore "$KEYSTORE" -alias richapps \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=Richapps, OU=Dev, O=Richapps, C=CN"
fi
"$JARSIGNER" -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$KEYSTORE" -storepass android -keypass android \
  "$APKDIR/aligned.apk" richapps

cp "$APKDIR/aligned.apk" "$OUT/app-release.apk"
echo "BUILD OK -> $OUT/app-release.apk"
