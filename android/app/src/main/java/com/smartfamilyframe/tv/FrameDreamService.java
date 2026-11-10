package com.smartfamilyframe.tv;

import android.service.dreams.DreamService;
import android.widget.FrameLayout;

public final class FrameDreamService extends DreamService implements FrameWebSession.Actions {
    private FrameLayout container;
    @Override public void onAttachedToWindow() {
        super.onAttachedToWindow();
        setInteractive(false);
        setFullscreen(true);
        setScreenBright(true);
        container = new FrameLayout(this);
        setContentView(container);
    }
    @Override public void onDreamingStarted() {
        super.onDreamingStarted();
        FrameWebSession.attach(this, this, container, "screensaver", this);
    }
    @Override public void onDreamingStopped() { FrameWebSession.release(this); super.onDreamingStopped(); }
    @Override public void onDetachedFromWindow() {
        FrameWebSession.release(this);
        container = null;
        super.onDetachedFromWindow();
    }
    @Override public void onDestroy() { FrameWebSession.release(this); super.onDestroy(); }
    @Override public void openScreensaverSettings() { /* No management UI in the screensaver. */ }
    @Override public void closeApp() { finish(); }
    @Override public void setPlaybackActive(boolean active) { /* System dream lifecycle owns display power. */ }
}
