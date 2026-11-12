package com.sinergia.sineringsleep;

import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SleepWidgetPlugin.class);
        registerPlugin(HealthConnectPlugin.class);
        super.onCreate(savedInstanceState);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    private void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Log.d("MainActivity", "handleIntent action=" + action);
        if (MorningSyncReceiver.ACTION_AUTO_SYNC.equals(action)) {
            SleepWidgetPlugin.setPendingAutoSync(true);
            triggerJsAutoSync();
        }
    }

    public void triggerJsAutoSync() {
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().post(() -> {
                bridge.getWebView().evaluateJavascript(
                    "if (typeof onAutoMorningSync === 'function') { onAutoMorningSync(); }",
                    null
                );
            });
        }
    }
}
