package com.smartfamilyframe.tv;

import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.os.Bundle;
import android.provider.Settings;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.Toast;

public final class MainActivity extends ComponentActivity implements FrameWebSession.Actions {
    private FrameLayout container;
    private boolean playbackActive;
    private boolean resumed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() { FrameWebSession.back(MainActivity.this); }
        });
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        container = new FrameLayout(this);
        setContentView(container);
        hideSystemUi();
    }
    @Override public void onResume() {
        super.onResume();
        resumed = true;
        hideSystemUi();
        if (!FrameWebSession.owns(this)) {
            playbackActive = false;
            FrameWebSession.attach(this, this, container, "app", this);
        }
        FrameWebSession.resume(this);
        updateScreenOn();
    }
    @Override public void onPause() {
        resumed = false;
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        FrameWebSession.pause(this);
        super.onPause();
    }
    @Override public void onStop() {
        FrameWebSession.release(this);
        super.onStop();
    }
    @Override public void onDestroy() { FrameWebSession.release(this); super.onDestroy(); }
    @Override public void openScreensaverSettings() {
        String[] actions = { Settings.ACTION_DREAM_SETTINGS, "com.google.android.tv.settings.ambient", Settings.ACTION_DISPLAY_SETTINGS, Settings.ACTION_SETTINGS };
        for (String action : actions) {
            try {
                startActivity(new Intent(action));
                if (!Settings.ACTION_DREAM_SETTINGS.equals(action)) Toast.makeText(this, R.string.settings_unavailable, Toast.LENGTH_LONG).show();
                return;
            } catch (ActivityNotFoundException unavailable) { /* Try the next supported TV settings screen. */ }
        }
        Toast.makeText(this, R.string.settings_unavailable, Toast.LENGTH_LONG).show();
    }
    @Override public void closeApp() { finish(); }
    @Override public void setPlaybackActive(boolean active) {
        playbackActive = active;
        updateScreenOn();
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        updateScreenOn();
    }
    private void updateScreenOn() {
        if (resumed && playbackActive && hasWindowFocus()) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }
    @SuppressWarnings("deprecation")
    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN
            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
    }
}
