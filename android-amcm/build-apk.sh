#!/usr/bin/env bash
#
# 构建 AMCM 指引通（WebView 壳）APK。
# 前置：本机已安装 Android SDK（build-tools;34.0.0 + platforms;android-34），
#       默认位于 E:/RichAPP/android-sdk。
# 用法：bash android-amcm/build-apk.sh
# 产物：android-amcm/build/amcm-guideline.apk
#
set -e

ANDROID_HOME="/e/RichAPP/android-sdk"
BUILD_TOOLS="$ANDROID_HOME/build-tools/34.0.0"
PLATFORM="$ANDROID_HOME/platforms/android-34"

AAPT2="$BUILD_TOOLS/aapt2.exe"
ZIPALIGN="$BUILD_TOOLS/zipalign.exe"
ANDROID_JAR="$PLATFORM/android.jar"
KEYTOOL="/c/Program Files/Java/jdk-21/bin/keytool.exe"

export PATH="/c/Program Files/Java/jdk-21/bin:$PATH"

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

echo "[2/7] 链接资源与清单 (aapt2 link)"
"$AAPT2" link -o "$APKDIR/unaligned.apk" \
  -I "$ANDROID_JAR" \
  --java "$GEN" \
  --manifest "$ROOT/AndroidManifest.xml" \
  "$OBJ/res.flata" \
  --min-sdk-version 21 --target-sdk-version 34

echo "[3/7] 编译 Java (javac, 目标 Java 8 字节码)"
javac -encoding UTF-8 --release 8 -classpath "$ANDROID_JAR" -d "$DEXDIR" \
  "$ROOT/src/com/richapps/amcm/MainActivity.java" \
  "$GEN/com/richapps/amcm/R.java"

echo "[4/7] 转 DEX (d8)"
CLASSFILES=$(find "$DEXDIR" -name '*.class' | tr '\n' ' ')
java -cp "$BUILD_TOOLS/lib/d8.jar" com.android.tools.r8.D8 --lib "$ANDROID_JAR" --output "$DEXDIR" $CLASSFILES

echo "[5/7] 把 classes.dex 打进 APK"
(cd "$DEXDIR" && cp "$APKDIR/unaligned.apk" "$APKDIR/with-dex.apk" && jar u0f "$APKDIR/with-dex.apk" classes.dex)

echo "[6/7] 对齐 (zipalign)"
"$ZIPALIGN" -p 4 "$APKDIR/with-dex.apk" "$APKDIR/aligned.apk"

echo "[7/7] 签名 (apksigner, 启用 v1+v2+v3 签名方案)"
if [ ! -f "$KEYSTORE" ]; then
  "$KEYTOOL" -genkeypair -v -keystore "$KEYSTORE" -alias amcm \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass android -keypass android \
    -dname "CN=AMCM Guideline, OU=Dev, O=Richapps, C=CN"
fi
java -jar "$BUILD_TOOLS/lib/apksigner.jar" sign \
  --ks "$KEYSTORE" --ks-pass pass:android --key-pass pass:android \
  --ks-key-alias amcm \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$APKDIR/amcm-guideline.apk" \
  "$APKDIR/aligned.apk"

cp "$APKDIR/amcm-guideline.apk" "$OUT/amcm-guideline.apk"
echo "BUILD OK -> $OUT/amcm-guideline.apk"
