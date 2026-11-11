package com.sinergia.sineringsleep;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SleepWidget")
public class SleepWidgetPlugin extends Plugin {
    public static final String PREFS_NAME = "SineRingSleepWidgetPrefs";

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
            .putLong("updated_at", System.currentTimeMillis())
            .apply();

        SleepWidgetProvider.updateAllWidgets(context);

        JSObject ret = new JSObject();
        ret.put("success", true);
        call.resolve(ret);
    }
}
