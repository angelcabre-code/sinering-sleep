package com.sinergia.sineringsleep;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

@CapacitorPlugin(name = "SleepWidget")
public class SleepWidgetPlugin extends Plugin {
    public static final String PREFS_NAME = "SineRingSleepWidgetPrefs";

    private static boolean pendingAutoSync = false;

    public static void setPendingAutoSync(boolean pending) {
        pendingAutoSync = pending;
    }

    @PluginMethod
    public void checkPendingAutoSync(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("shouldSync", pendingAutoSync);
        pendingAutoSync = false;
        call.resolve(ret);
    }

    @PluginMethod
    public void configureMorningSync(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        String strategy = call.getString("strategy", "1h"); // "immediate", "30m", "1h", "fixed"
        int fixedHour = call.getInt("fixedHour", 8);
        int fixedMinute = call.getInt("fixedMinute", 30);

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putBoolean("auto_morning_sync_enabled", enabled)
            .putString("auto_morning_sync_strategy", strategy)
            .putInt("auto_sync_fixed_hour", fixedHour)
            .putInt("auto_sync_fixed_minute", fixedMinute)
            .apply();

        if (enabled && "fixed".equals(strategy)) {
            MorningSyncReceiver.scheduleFixedAlarm(context);
        }

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void getMorningSyncConfig(PluginCall call) {
        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        JSObject ret = new JSObject();
        ret.put("enabled", prefs.getBoolean("auto_morning_sync_enabled", true));
        ret.put("strategy", prefs.getString("auto_morning_sync_strategy", "1h"));
        ret.put("fixedHour", prefs.getInt("auto_sync_fixed_hour", 8));
        ret.put("fixedMinute", prefs.getInt("auto_sync_fixed_minute", 30));
        ret.put("lastSyncedDate", prefs.getString("last_synced_sleep_date", ""));
        call.resolve(ret);
    }

    @PluginMethod
    public void updateWidgetData(PluginCall call) {
        String score = call.getString("score", "--");
        String duration = call.getString("duration", "--h --m");
        String deep = call.getString("deep", "--");
        String rem = call.getString("rem", "--");
        String light = call.getString("light", "--");
        String awake = call.getString("awake", "--");
        String temp = call.getString("temp", "--.- °C");
        String quality = call.getString("quality", "Sin registros");
        String date = call.getString("date", "Última noche");
        if (date == null || date.contains("Invalid") || date.trim().isEmpty()) {
            date = "Última noche";
        }
        String hrAvg = call.getString("hrAvg", "--");
        String stageSegments = call.getString("stageSegments", "[]");

        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());

        Context context = getContext();
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
            .putString("score", score)
            .putString("duration", duration)
            .putString("deep", deep)
            .putString("rem", rem)
            .putString("light", light)
            .putString("awake", awake)
            .putString("temp", temp)
            .putString("quality", quality)
            .putString("date", date)
            .putString("hrAvg", hrAvg)
            .putString("stage_segments", stageSegments)
            .putString("last_synced_sleep_date", todayStr)
            .putLong("updated_at", System.currentTimeMillis())
            .apply();

        SleepWidgetProvider.updateAllWidgets(context);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
