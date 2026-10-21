package com.h1ddenpr0cess20.tunneliv;

import android.app.Activity;
import android.os.Bundle;
import android.view.KeyEvent;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.webkit.WebViewAssetLoader;

// Hosts the built game (assets/www, from `npm run build`) in a full-screen
// WebView. Assets are served over https from a virtual host so ES modules
// and WebGL behave as they do on a real site. The remote's D-pad arrives in
// the page as arrow keys and Select as Enter; Back is sent as Escape (pause)
// instead of closing the app, and a few other buttons are mapped too.
public class MainActivity extends Activity {
    private static final String URL =
        "https://appassets.androidplatform.net/assets/www/index.html?tv=1";

    private WebView web;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        final WebViewAssetLoader loader = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
            .build();

        web = new WebView(this);
        web.setBackgroundColor(0xff000000);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
                return loader.shouldInterceptRequest(r.getUrl());
            }
        });
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setUserAgentString(s.getUserAgentString() + " FireTVApp");
        setContentView(web);
        web.requestFocus();
        web.loadUrl(URL);
    }

    private void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
    }

    @Override
    public void onWindowFocusChanged(boolean focus) {
        super.onWindowFocusChanged(focus);
        if (focus) hideSystemUi();
    }

    // Remote and gamepad buttons the page has no key for, as the keys it does:
    // Back/B pause (Escape), Select/A roll out and honk (Enter), Play/Pause
    // pauses (P), Menu toggles sound (M). The D-pad needs no mapping: it
    // reaches the page as arrow keys.
    private static int mapKey(int code) {
        switch (code) {
            case KeyEvent.KEYCODE_BACK:
            case KeyEvent.KEYCODE_BUTTON_B:
                return KeyEvent.KEYCODE_ESCAPE;
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_BUTTON_A:
                return KeyEvent.KEYCODE_ENTER;
            case KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE:
            case KeyEvent.KEYCODE_MEDIA_PLAY:
            case KeyEvent.KEYCODE_MEDIA_PAUSE:
            case KeyEvent.KEYCODE_BUTTON_START:
                return KeyEvent.KEYCODE_P;
            case KeyEvent.KEYCODE_MENU:
                return KeyEvent.KEYCODE_M;
            default:
                return 0;
        }
    }

    @Override
    public boolean dispatchKeyEvent(KeyEvent e) {
        int mapped = mapKey(e.getKeyCode());
        if (mapped == 0) return super.dispatchKeyEvent(e);
        // Back must never close the app; Home (the system's) does that.
        web.dispatchKeyEvent(new KeyEvent(e.getDownTime(), e.getEventTime(), e.getAction(),
            mapped, e.getRepeatCount()));
        return true;
    }

    @Override
    protected void onPause() { super.onPause(); web.onPause(); }

    @Override
    protected void onResume() { super.onResume(); web.onResume(); }
}
