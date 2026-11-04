package com.richapps.success;

import android.app.Activity;
import android.os.Bundle;

/**
 * 极简示例 Activity：打开应用即全屏居中显示「我成功了」。
 * 仅用于打通“开发 → 打包 APK → GitHub 发布”的通道。
 */
public class MainActivity extends Activity {
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
    }
}
