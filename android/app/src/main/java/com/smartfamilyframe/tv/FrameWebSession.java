package com.smartfamilyframe.tv;

import android.annotation.SuppressLint;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import androidx.webkit.WebViewAssetLoader;
import java.lang.ref.WeakReference;

/** A single active renderer, shared HTTPS origin and default profile for both entry points.
 * Destroy the old renderer before takeover to avoid duplicate sync engines/device registrations.
 * Check ownership so a late activity onStop cannot destroy a newer screensaver renderer.
 */
final class FrameWebSession {
    static final String START_URL = "https://appassets.androidplatform.net/assets/web/index.html";
    private static WeakReference<Object> owner = new WeakReference<>(null);
    private static WeakReference<WebView> current = new WeakReference<>(null);

    interface Actions {
        void openScreensaverSettings();
        void closeApp();
        void setPlaybackActive(boolean active);
    }

    @SuppressLint({"SetJavaScriptEnabled", "JavascriptInterface"})
    static WebView attach(Object host, Context context, FrameLayout container, String mode, Actions actions) {
        dispose();
        owner = new WeakReference<>(host);
        WebView web = new WebView(context);
        current = new WeakReference<>(web);
        web.setBackgroundColor(0xff000000);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(context)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                if (response != null) {
                    java.util.Map<String, String> headers = new java.util.HashMap<>();
                    headers.put("Content-Security-Policy", "frame-src 'none'; object-src 'none'; base-uri 'self'");
                    response.setResponseHeaders(headers);
                }
                return response;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !isLocalDocument(request.getUrl());
            }
            @Override public void onPageStarted(WebView view, String url, Bitmap icon) {
                if (!isLocalDocument(Uri.parse(url))) view.stopLoading();
            }
        });
        web.addJavascriptInterface(new Bridge(host, mode, actions), "SmartFrameAndroid");
        container.addView(web, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(START_URL);
        web.requestFocus();
        return web;
    }

    static boolean isLocalDocument(Uri uri) {
        return "https".equals(uri.getScheme()) && "appassets.androidplatform.net".equals(uri.getHost())
            && uri.getPort() == -1 && "/assets/web/index.html".equals(uri.getPath());
    }
    static boolean owns(Object host) { return owner.get() == host && current.get() != null; }
    static void back(Object host) {
        WebView web = current.get();
        if (owns(host) && web != null) web.evaluateJavascript("window.dispatchEvent(new Event('smartframe-back'))", null);
    }
    static void pause(Object host) { WebView web = current.get(); if (owns(host) && web != null) web.onPause(); }
    static void resume(Object host) { WebView web = current.get(); if (owns(host) && web != null) web.onResume(); }
    static void release(Object host) { if (owns(host)) dispose(); }

    private static void dispose() {
        WebView old = current.get();
        current.clear();
        owner.clear();
        if (old == null) return;
        old.stopLoading();
        old.onPause();
        old.removeJavascriptInterface("SmartFrameAndroid");
        if (old.getParent() instanceof ViewGroup) ((ViewGroup) old.getParent()).removeView(old);
        old.destroy();
    }

    public static final class Bridge {
        private final Object host;
        private final String mode;
        private final Actions actions;
        private final Handler main = new Handler(Looper.getMainLooper());
        Bridge(Object host, String mode, Actions actions) { this.host = host; this.mode = mode; this.actions = actions; }
        @JavascriptInterface public String getLaunchMode() { return mode; }
        @JavascriptInterface public void openScreensaverSettings() {
            if ("app".equals(mode)) main.post(() -> { if (owns(host)) actions.openScreensaverSettings(); });
        }
        @JavascriptInterface public void closeApp() {
            if ("app".equals(mode)) main.post(() -> { if (owns(host)) actions.closeApp(); });
        }
        @JavascriptInterface public void setPlaybackActive(boolean active) {
            if ("app".equals(mode)) main.post(() -> { if (owns(host)) actions.setPlaybackActive(active); });
        }
    }
}
