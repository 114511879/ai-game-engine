package com.aigameengine.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

@SuppressWarnings("deprecation")
public final class MainActivity extends Activity {
    private static final String APP_ASSET_PREFIX = "file:///android_asset/web/";
    private static final String APP_URL = APP_ASSET_PREFIX + "index.html";
    private static final String ERROR_HTML =
            "<!doctype html><html><head><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
            + "<style>body{margin:0;background:#111827;color:#f9fafb;font-family:sans-serif;display:grid;"
            + "place-items:center;min-height:100vh;text-align:center}main{padding:24px}button{border:0;border-radius:6px;"
            + "padding:12px 18px;background:#18a66a;color:white;font-size:16px}</style></head>"
            + "<body><main><h1>Page failed to load</h1><p>The packaged application could not be opened.</p>"
            + "<button onclick=\"location.href='" + APP_URL + "'\">Retry</button></main></body></html>";

    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(17, 24, 39));
        setContentView(webView, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return openExternalIfNeeded(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return openExternalIfNeeded(Uri.parse(url));
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error) {
                if (request.isForMainFrame()) {
                    showLoadError();
                }
            }
        });

        if (savedInstanceState == null || webView.restoreState(savedInstanceState) == null) {
            webView.loadUrl(APP_URL);
        }
    }

    private boolean openExternalIfNeeded(Uri uri) {
        String scheme = uri.getScheme();
        if ("file".equalsIgnoreCase(scheme)) {
            return !uri.toString().startsWith(APP_ASSET_PREFIX);
        }
        if (!"http".equalsIgnoreCase(scheme) && !"https".equalsIgnoreCase(scheme)) {
            return true;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (ActivityNotFoundException ignored) {
            // The WebView remains on the current trusted local page.
        }
        return true;
    }

    private void showLoadError() {
        webView.loadDataWithBaseURL(APP_URL, ERROR_HTML, "text/html", "UTF-8", APP_URL);
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        webView.saveState(outState);
        super.onSaveInstanceState(outState);
    }

    @Override
    protected void onPause() {
        webView.onPause();
        webView.pauseTimers();
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        webView.onResume();
        webView.resumeTimers();
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
