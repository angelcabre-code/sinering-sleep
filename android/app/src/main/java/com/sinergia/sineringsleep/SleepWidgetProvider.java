package com.sinergia.sineringsleep;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;
import android.os.Build;
import android.widget.RemoteViews;
import org.json.JSONArray;
import org.json.JSONObject;

public class SleepWidgetProvider extends AppWidgetProvider {

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        SharedPreferences prefs = context.getSharedPreferences(SleepWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);

        String score = prefs.getString("score", "--");
        String duration = prefs.getString("duration", "--h --m");
        String deep = prefs.getString("deep", "--");
        String rem = prefs.getString("rem", "--");
        String light = prefs.getString("light", "--");
        String temp = prefs.getString("temp", "--.- °C");
        String quality = prefs.getString("quality", "Sin registros");
        String date = prefs.getString("date", "Última noche");
        if (date == null || date.contains("Invalid") || date.trim().isEmpty()) {
            date = "Última noche";
        }
        String hrAvg = prefs.getString("hrAvg", "--");
        String stageSegments = prefs.getString("stage_segments", "[]");

        Bitmap hypnoBitmap = createHypnogramBitmap(600, 60, stageSegments, score);

        for (int appWidgetId : appWidgetIds) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_sleep_summary);

            views.setTextViewText(R.id.widget_date, date);
            views.setTextViewText(R.id.widget_duration, duration);
            views.setTextViewText(R.id.widget_score, score);
            views.setTextViewText(R.id.widget_quality, quality);
            views.setTextViewText(R.id.widget_temp, temp);
            views.setTextViewText(R.id.widget_deep, deep);
            views.setTextViewText(R.id.widget_rem, rem);
            views.setTextViewText(R.id.widget_hr, hrAvg.contains("lpm") ? hrAvg : (hrAvg.equals("--") ? "--" : hrAvg + " lpm"));

            if (hypnoBitmap != null) {
                views.setImageViewBitmap(R.id.widget_sleep_chart, hypnoBitmap);
            }

            Intent intent = new Intent(context, MainActivity.class);
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }
            PendingIntent pendingIntent = PendingIntent.getActivity(context, 0, intent, flags);
            views.setOnClickPendingIntent(R.id.widget_root, pendingIntent);

            // Botón de sincronización rápida en el widget
            Intent syncIntent = new Intent(context, MainActivity.class);
            syncIntent.setAction(MorningSyncReceiver.ACTION_AUTO_SYNC);
            syncIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            PendingIntent syncPendingIntent = PendingIntent.getActivity(context, 1003, syncIntent, flags);
            views.setOnClickPendingIntent(R.id.widget_sync_btn, syncPendingIntent);

            appWidgetManager.updateAppWidget(appWidgetId, views);
        }
    }

    public static Bitmap createHypnogramBitmap(int width, int height, String stageDataJson, String score) {
        try {
            Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(bitmap);

            // Fondo sutil del contenedor del hipnograma
            Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            bgPaint.setColor(Color.parseColor("#38000000"));
            canvas.drawRoundRect(new RectF(0, 0, width, height), 10, 10, bgPaint);

            if ("--".equals(score)) {
                Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
                textPaint.setColor(Color.parseColor("#475569"));
                textPaint.setTextSize(18);
                textPaint.setTextAlign(Paint.Align.CENTER);
                canvas.drawText("Sincroniza el anillo para ver el hipnograma", width / 2.0f, (height / 2.0f) + 6, textPaint);
                return bitmap;
            }

            int colorDeep = Color.parseColor("#6366f1"); // Indigo (#6366f1)
            int colorRem = Color.parseColor("#ec4899");  // Rosa (#ec4899)
            int colorLight = Color.parseColor("#06b6d4"); // Cyan (#06b6d4)
            int colorAwake = Color.parseColor("#f59e0b"); // Ámbar (#f59e0b)

            Paint barPaint = new Paint(Paint.ANTI_ALIAS_FLAG);

            JSONArray array = new JSONArray(stageDataJson != null ? stageDataJson : "[]");
            if (array.length() > 0) {
                int totalMin = 0;
                for (int i = 0; i < array.length(); i++) {
                    JSONObject obj = array.getJSONObject(i);
                    totalMin += Math.max(1, obj.optInt("min", 1));
                }
                if (totalMin <= 0) totalMin = 1;

                float curX = 4;
                float availableWidth = width - 8;
                for (int i = 0; i < array.length(); i++) {
                    JSONObject obj = array.getJSONObject(i);
                    int stage = obj.optInt("stage", 2);
                    int minutes = Math.max(1, obj.optInt("min", 1));
                    float segWidth = (minutes / (float) totalMin) * availableWidth;
                    if (segWidth < 2) segWidth = 2;

                    int color = colorLight;
                    float topY = 22; // Nivel intermedio para ligero
                    if (stage == 3) { // Profundo
                        color = colorDeep;
                        topY = 38; // Bloque inferior
                    } else if (stage == 4) { // REM
                        color = colorRem;
                        topY = 22;
                    } else if (stage == 2) { // Ligero
                        color = colorLight;
                        topY = 12;
                    } else if (stage == 5 || stage == 1) { // Despierto
                        color = colorAwake;
                        topY = 4; // Bloque superior
                    }

                    barPaint.setColor(color);
                    RectF rect = new RectF(curX, topY, curX + segWidth - 1, height - 4);
                    canvas.drawRoundRect(rect, 3, 3, barPaint);

                    curX += segWidth;
                }
                return bitmap;
            }

            // Fallback sintético si hay puntuación pero no se han extraído segmentos detallados
            float curX = 4;
            float w = width - 8;
            float[] weights = { 0.05f, 0.22f, 0.45f, 0.23f, 0.05f };
            int[] colors = { colorAwake, colorDeep, colorLight, colorRem, colorAwake };
            float[] tops = { 6, 38, 14, 22, 6 };

            for (int i = 0; i < weights.length; i++) {
                float segW = weights[i] * w;
                barPaint.setColor(colors[i]);
                canvas.drawRoundRect(new RectF(curX, tops[i], curX + segW - 2, height - 4), 3, 3, barPaint);
                curX += segW;
            }

            return bitmap;
        } catch (Exception e) {
            e.printStackTrace();
            return null;
        }
    }

    public static void updateAllWidgets(Context context) {
        try {
            AppWidgetManager appWidgetManager = AppWidgetManager.getInstance(context);
            ComponentName thisWidget = new ComponentName(context, SleepWidgetProvider.class);
            int[] allWidgetIds = appWidgetManager.getAppWidgetIds(thisWidget);
            if (allWidgetIds != null && allWidgetIds.length > 0) {
                Intent intent = new Intent(context, SleepWidgetProvider.class);
                intent.setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
                intent.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, allWidgetIds);
                context.sendBroadcast(intent);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }
}
