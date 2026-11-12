package lab.nishat.bccrashlab;

import android.app.Activity;
import android.app.Dialog;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * দুটি WebView:
 *  - panel : লোকাল UI (index.html + renderer.js) — টুলবার, ডেটা, অ্যাডভাইজার
 *  - game  : আসল bc.game পেজ — panel-এর #wv ঘরের ঠিক ওপরে বসে
 * Electron-এর <webview>.executeJavaScript ইত্যাদি এখানে Bridge দিয়ে চলে।
 */
public class MainActivity extends Activity {
    private static final int REQ_SAVE = 101;
    private static final int REQ_OPEN = 102;

    private final Handler ui = new Handler(Looper.getMainLooper());
    private FrameLayout root;
    private WebView panel;
    private WebView game;
    private WebViewAssetLoader loader;
    private float density = 1f;
    private float zoom = 1f;
    private int lastX = -1, lastY = -1, lastW = -1, lastH = -1;
    private String pendingName, pendingContent;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        density = getResources().getDisplayMetrics().density;

        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        loader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        root = new FrameLayout(this);
        panel = new WebView(this);
        game = new WebView(this);
        root.addView(panel, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        FrameLayout.LayoutParams gp = new FrameLayout.LayoutParams(1, 1);
        root.addView(game, gp);
        game.setVisibility(View.INVISIBLE);
        setContentView(root);

        setupPanel();
        setupGame();

        panel.loadUrl("https://appassets.androidplatform.net/assets/www/index.html");
        game.loadUrl("https://bc.game");

        // সাইট মাঝে মাঝে viewport meta বদলে দেয় — জুম ঠিক রাখতে পুনরায় বসাই
        ui.postDelayed(new Runnable() {
            @Override
            public void run() {
                applyViewport();
                ui.postDelayed(this, 3000);
            }
        }, 3000);
    }

    /* ---------------- panel (লোকাল UI) ---------------- */
    private void setupPanel() {
        WebSettings s = panel.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        panel.setBackgroundColor(0xFF0F1419);
        panel.setWebChromeClient(new WebChromeClient());
        panel.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return loader.shouldInterceptRequest(request.getUrl());
            }
        });
        panel.addJavascriptInterface(new Bridge(), "Android");
    }

    /* ---------------- game (bc.game) ---------------- */
    private void configureBrowser(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        // "wv" ও "Version/x.y" বাদ — সাধারণ Chrome-এর মতো UA
        String ua = s.getUserAgentString();
        if (ua != null) {
            ua = ua.replace("; wv", "").replaceAll(" Version/\\d+\\.\\d+", "");
            s.setUserAgentString(ua);
        }
        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(w, true);
    }

    private void setupGame() {
        configureBrowser(game);
        game.setBackgroundColor(0xFF0F1419);
        game.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                emit("did-start-loading", url);
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                applyViewport();
                emit("dom-ready", url);
                emit("did-finish-load", url);
                emit("did-stop-loading", url);
                emit("did-navigate", url);
            }

            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                emit("did-navigate-in-page", url);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String scheme = request.getUrl().getScheme();
                // http/https ছাড়া (intent:, market: ইত্যাদি) ব্লক
                return !("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme));
            }
        });
        game.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onCreateWindow(WebView view, boolean isDialog, boolean isUserGesture, Message resultMsg) {
                // Google সাইন-ইন / পেমেন্ট পপআপ — আলাদা ডায়ালগে, একই কুকি সেশনে
                final WebView popup = new WebView(MainActivity.this);
                configureBrowser(popup);
                final Dialog d = new Dialog(MainActivity.this, android.R.style.Theme_DeviceDefault_NoActionBar);
                popup.setWebViewClient(new WebViewClient());
                popup.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public void onCloseWindow(WebView window) {
                        d.dismiss();
                    }
                });
                d.setContentView(popup);
                d.setOnDismissListener(new android.content.DialogInterface.OnDismissListener() {
                    @Override
                    public void onDismiss(android.content.DialogInterface dialog) {
                        popup.destroy();
                    }
                });
                d.show();
                if (d.getWindow() != null) {
                    d.getWindow().setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
                }
                WebView.WebViewTransport t = (WebView.WebViewTransport) resultMsg.obj;
                t.setWebView(popup);
                resultMsg.sendToTarget();
                return true;
            }
        });
    }

    /** জুম অনুযায়ী layout-viewport বদলে "ফুল ভিউ" (ডেস্কটপ-চওড়া লেআউট) তৈরি */
    private void applyViewport() {
        if (game == null || game.getWidth() <= 0) return;
        float cssW = game.getWidth() / density;
        String content;
        if (Math.abs(zoom - 1f) < 0.02f) {
            content = "width=device-width, initial-scale=1";
        } else {
            int w = Math.round(cssW / zoom);
            content = "width=" + w + ", initial-scale=" + zoom + ", minimum-scale=0.1, maximum-scale=5";
        }
        String js = "(function(c){var m=document.querySelector('meta[name=viewport]');"
                + "if(!m){m=document.createElement('meta');m.name='viewport';"
                + "(document.head||document.documentElement).appendChild(m);}"
                + "if(m.getAttribute('content')!==c)m.setAttribute('content',c);})("
                + JSONObject.quote(content) + ")";
        game.evaluateJavascript(js, null);
    }

    /** panel-এ ইভেন্ট পাঠানো (dom-ready, did-navigate ...) */
    private void emit(String name, String url) {
        String js = "window.__wvEvent&&window.__wvEvent(" + JSONObject.quote(name) + ","
                + JSONObject.quote(url == null ? "" : url) + ")";
        panel.evaluateJavascript(js, null);
    }

    private void sendResult(String id, String json) {
        String js = "window.__wvRes&&window.__wvRes(" + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")";
        panel.evaluateJavascript(js, null);
    }

    private void pollResult(final String id, final long deadline) {
        String js = "(function(){var k='__bc_" + id + "',r=window[k];if(!r||!r.d)return null;"
                + "delete window[k];return JSON.stringify(r)})()";
        game.evaluateJavascript(js, new android.webkit.ValueCallback<String>() {
            @Override
            public void onReceiveValue(String value) {
                if (value != null && !"null".equals(value)) {
                    String raw = value;
                    try {
                        Object o = new JSONTokener(value).nextValue();
                        if (o instanceof String) raw = (String) o;
                    } catch (Exception ignored) { }
                    sendResult(id, raw);
                } else if (System.currentTimeMillis() > deadline) {
                    sendResult(id, "{\"d\":1,\"e\":\"dom-ready timeout\"}");
                } else {
                    ui.postDelayed(new Runnable() {
                        @Override
                        public void run() {
                            pollResult(id, deadline);
                        }
                    }, 60);
                }
            }
        });
    }

    /* ---------------- JS ↔ Java ব্রিজ (শুধু লোকাল panel-এ) ---------------- */
    private class Bridge {
        @JavascriptInterface
        public void exec(final String id, final String code) {
            if (id == null || !id.matches("[A-Za-z0-9]+")) return;
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String js = "(function(){var k='__bc_" + id + "';window[k]={d:0};"
                            + "try{Promise.resolve((function(){return (" + code + "\n);})())"
                            + ".then(function(v){window[k]={d:1,v:JSON.stringify(v===undefined?null:v)}},"
                            + "function(e){window[k]={d:1,e:String(e&&e.message||e)}});}"
                            + "catch(e){window[k]={d:1,e:String(e&&e.message||e)}}})();";
                    game.evaluateJavascript(js, null);
                    pollResult(id, System.currentTimeMillis() + 10000);
                }
            });
        }

        @JavascriptInterface
        public void insertCSS(final String css) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    String js = "(function(c){var s=document.getElementById('__bc_css');"
                            + "if(!s){s=document.createElement('style');s.id='__bc_css';"
                            + "(document.head||document.documentElement).appendChild(s);}"
                            + "s.textContent=c;})(" + JSONObject.quote(css) + ")";
                    game.evaluateJavascript(js, null);
                }
            });
        }

        @JavascriptInterface
        public void loadUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (url != null && (url.startsWith("https://") || url.startsWith("http://"))) {
                        game.loadUrl(url);
                    }
                }
            });
        }

        @JavascriptInterface
        public void goBack() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (game.canGoBack()) game.goBack();
                }
            });
        }

        @JavascriptInterface
        public void goForward() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (game.canGoForward()) game.goForward();
                }
            });
        }

        @JavascriptInterface
        public void reload() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    game.reload();
                }
            });
        }

        @JavascriptInterface
        public void setZoom(final double z) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    float nz = (float) Math.max(0.25, Math.min(3.0, z));
                    if (Math.abs(nz - zoom) > 0.001f) {
                        zoom = nz;
                        applyViewport();
                    }
                }
            });
        }

        /** panel-এর #wv ঘরের মাপ (CSS px) — game WebView ঠিক ওখানে বসে */
        @JavascriptInterface
        public void setRect(final double x, final double y, final double w, final double h, final boolean visible) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (!visible || w < 10 || h < 10) {
                        game.setVisibility(View.INVISIBLE);
                        return;
                    }
                    int nx = Math.round((float) (x * density));
                    int ny = Math.round((float) (y * density));
                    int nw = Math.round((float) (w * density));
                    int nh = Math.round((float) (h * density));
                    if (nx != lastX || ny != lastY || nw != lastW || nh != lastH) {
                        boolean widthChanged = nw != lastW;
                        lastX = nx; lastY = ny; lastW = nw; lastH = nh;
                        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) game.getLayoutParams();
                        lp.leftMargin = nx;
                        lp.topMargin = ny;
                        lp.width = nw;
                        lp.height = nh;
                        game.setLayoutParams(lp);
                        if (widthChanged) ui.postDelayed(new Runnable() {
                            @Override
                            public void run() {
                                applyViewport();
                            }
                        }, 120);
                    }
                    game.setVisibility(View.VISIBLE);
                }
            });
        }

        @JavascriptInterface
        public void saveFile(final String name, final String content) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    pendingName = name;
                    pendingContent = content;
                    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("text/csv");
                    i.putExtra(Intent.EXTRA_TITLE, name);
                    try {
                        startActivityForResult(i, REQ_SAVE);
                    } catch (Exception e) {
                        fileDone(false);
                    }
                }
            });
        }

        @JavascriptInterface
        public void openFile() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    i.setType("*/*");
                    try {
                        startActivityForResult(i, REQ_OPEN);
                    } catch (Exception e) {
                        panel.evaluateJavascript("window.__fileOpened&&window.__fileOpened(null)", null);
                    }
                }
            });
        }
    }

    private void fileDone(boolean ok) {
        panel.evaluateJavascript("window.__fileDone&&window.__fileDone(" + ok + ")", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_SAVE) {
            boolean ok = false;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingContent != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    if (os != null) {
                        os.write(pendingContent.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                } catch (Exception ignored) { }
            }
            pendingContent = null;
            fileDone(ok);
        } else if (requestCode == REQ_OPEN) {
            String text = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri uri = data.getData();
                try (InputStream is = getContentResolver().openInputStream(uri)) {
                    if (is != null) {
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        byte[] buf = new byte[8192];
                        int n;
                        while ((n = is.read(buf)) > 0) bos.write(buf, 0, n);
                        text = new String(bos.toByteArray(), StandardCharsets.UTF_8);
                    }
                } catch (Exception ignored) { }
            }
            String arg = text == null ? "null" : JSONObject.quote(text);
            panel.evaluateJavascript("window.__fileOpened&&window.__fileOpened(" + arg + ")", null);
        }
    }

    @Override
    public void onBackPressed() {
        if (game != null && game.canGoBack()) game.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        ui.removeCallbacksAndMessages(null);
        if (game != null) game.destroy();
        if (panel != null) panel.destroy();
        super.onDestroy();
    }
}
