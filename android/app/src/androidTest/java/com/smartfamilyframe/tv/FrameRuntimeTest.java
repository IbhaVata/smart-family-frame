package com.smartfamilyframe.tv;

import android.net.Uri;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.rule.ActivityTestRule;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import static org.junit.Assert.*;

/** Runs the packaged React app in a real Android WebView, without replacing its storage layer. */
public class FrameRuntimeTest {
    @Rule public ActivityTestRule<MainActivity> activity = new ActivityTestRule<>(MainActivity.class);

    private WebView findWeb(View view) {
        if (view instanceof WebView) return (WebView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                WebView result = findWeb(group.getChildAt(i));
                if (result != null) return result;
            }
        }
        return null;
    }
    private String js(String expression) throws Exception {
        CountDownLatch latch = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            WebView web = findWeb(activity.getActivity().getWindow().getDecorView());
            if (web == null) { result.set("null"); latch.countDown(); return; }
            // Give each evaluation its own lexical scope; repeated asynchronous probes must not
            // collide on top-level const declarations in the same WebView document.
            String script = "(function(){try{return eval(" + JSONObject.quote(expression)
                + ");}catch(e){return {__runtimeTestError:String(e)}}})()";
            web.evaluateJavascript(script, value -> { result.set(value); latch.countDown(); });
        });
        assertTrue("WebView JavaScript callback", latch.await(5, TimeUnit.SECONDS));
        assertFalse("JavaScript probe failed: " + result.get(), result.get().contains("__runtimeTestError"));
        return result.get();
    }
    private void await(String condition) throws Exception {
        long deadline = System.currentTimeMillis() + 20000;
        do {
            if ("true".equals(js(condition))) return;
            Thread.sleep(100);
        } while (System.currentTimeMillis() < deadline);
        fail("Timed out waiting for " + condition + "; page: " + js("document.body.innerText"));
    }

    @Test public void packagedAppLoadsOfflineAndRemoteNavigates() throws Exception {
        await("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Start frame'))");
        assertEquals("\"app\"", js("SmartFrameAndroid.getLaunchMode()"));
        assertEquals("true", js("document.activeElement.textContent.includes('Start frame')"));
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_RIGHT);
        await("document.activeElement.textContent.includes('Connect phone')");
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_DPAD_CENTER);
        await("document.body.innerText.includes('Connect once')");
        InstrumentationRegistry.getInstrumentation().sendKeyDownUpSync(KeyEvent.KEYCODE_BACK);
        await("!!document.querySelector('.tv-actions')");
    }

    @Test public void modeTakeoverPreservesIndexedDbAndProtectsNewOwner() throws Exception {
        await("!!document.querySelector('.tv-actions')");
        // Persist settings through the real app before switching renderers.
        js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Display settings')).click()");
        await("!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Clock')");
        js("Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Clock').click()");
        await("Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Clock'&&b.getAttribute('aria-pressed')==='true')");
        // Store the same identity used by the frame, then verify the new context reads it.
        js("window.__identity=null;const q=indexedDB.open('smart-family-frame');q.onsuccess=()=>{const db=q.result;const t=db.transaction('frameIdentity');const r=t.objectStore('frameIdentity').get('device');r.onsuccess=()=>{window.__identity=r.result?.frameId||'unpaired';db.close()}};");
        await("typeof window.__identity==='string'");
        String identity = js("window.__identity");
        assertTrue("TV identity is persisted before cloud setup", identity.matches("\\\"FRAME-[A-Z2-9]{6}\\\""));
        Object saver = new Object();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            FrameLayout container = new FrameLayout(activity.getActivity());
            activity.getActivity().setContentView(container);
            FrameWebSession.attach(saver, activity.getActivity(), container, "screensaver", activity.getActivity());
            // Simulate the outgoing activity's late onStop: it must not destroy the dream.
            FrameWebSession.release(activity.getActivity());
            assertTrue(FrameWebSession.owns(saver));
        });
        try {
            // An existing schedule may legitimately override the default layout.
            await("!!document.querySelector('.tv-screensaver .frame-root')");
            assertEquals("0", js("document.querySelectorAll('button').length"));
            assertEquals("\"screensaver\"", js("SmartFrameAndroid.getLaunchMode()"));
            js("window.__identity=null;const q=indexedDB.open('smart-family-frame');q.onsuccess=()=>{const db=q.result;const r=db.transaction('frameIdentity').objectStore('frameIdentity').get('device');r.onsuccess=()=>{window.__identity=r.result?.frameId||'unpaired';db.close()}};");
            await("typeof window.__identity==='string'");
            assertEquals(identity, js("window.__identity"));
            js("window.__defaultMode=null;const q=indexedDB.open('smart-family-frame');q.onsuccess=()=>{const db=q.result;const r=db.transaction('settings').objectStore('settings').get('app');r.onsuccess=()=>{window.__defaultMode=r.result.value.defaultMode;db.close()}};");
            await("typeof window.__defaultMode==='string'");
            assertEquals("\"CLOCK\"", js("window.__defaultMode"));
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> FrameWebSession.release(saver));
        }
    }

    @Test public void nativeBridgeOnlyAllowsThePackagedDocument() {
        assertTrue(FrameWebSession.isLocalDocument(Uri.parse(FrameWebSession.START_URL)));
        assertFalse(FrameWebSession.isLocalDocument(Uri.parse("https://example.com/assets/web/index.html")));
        assertFalse(FrameWebSession.isLocalDocument(Uri.parse("file:///android_asset/web/index.html")));
        assertFalse(FrameWebSession.isLocalDocument(Uri.parse("https://appassets.androidplatform.net/other.html")));
        assertFalse(FrameWebSession.isLocalDocument(Uri.parse("http://appassets.androidplatform.net/assets/web/index.html")));
    }
}
