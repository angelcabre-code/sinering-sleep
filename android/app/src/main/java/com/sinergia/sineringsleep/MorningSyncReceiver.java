package com.sinergia.sineringsleep;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

public class MorningSyncReceiver extends BroadcastReceiver {
    private static final String TAG = "MorningSync";
    public static final String ACTION_AUTO_SYNC = "com.sinergia.sineringsleep.ACTION_AUTO_SYNC";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent != null ? intent.getAction() : null;
        Log.d(TAG, "onReceive action: " + action);

        SharedPreferences prefs = context.getSharedPreferences(SleepWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        boolean enabled = prefs.getBoolean("auto_morning_sync_enabled", true);
        if (!enabled) {
            Log.d(TAG, "Sincronización matutina desactivada por el usuario.");
            return;
        }

        String strategy = prefs.getString("auto_morning_sync_strategy", "1h"); // "immediate", "30m", "1h", "fixed"
        String todayStr = new SimpleDateFormat("yyyy-MM-dd", Locale.getDefault()).format(new Date());
        String lastSyncedDate = prefs.getString("last_synced_sleep_date", "");

        if (todayStr.equals(lastSyncedDate)) {
            Log.d(TAG, "El sueño de hoy ya fue sincronizado: " + todayStr);
            return;
        }

        Calendar now = Calendar.getInstance();
        int hour = now.get(Calendar.HOUR_OF_DAY);

        // 1. Caso: El usuario desbloquea la pantalla por la mañana (USER_PRESENT)
        if (Intent.ACTION_USER_PRESENT.equals(action)) {
            // Solo actuar en la ventana matutina fisiológica (06:00 a 12:00)
            if (hour >= 6 && hour <= 12) {
                String unlockDate = prefs.getString("today_first_unlock_date", "");
                if (!todayStr.equals(unlockDate)) {
                    prefs.edit()
                        .putString("today_first_unlock_date", todayStr)
                        .putLong("today_first_unlock_time", System.currentTimeMillis())
                        .apply();

                    Log.d(TAG, "Primer desbloqueo matutino detectado (" + hour + ":" + now.get(Calendar.MINUTE) + ") con estrategia: " + strategy);

                    if ("immediate".equals(strategy)) {
                        triggerSyncToActivity(context);
                    } else if ("30m".equals(strategy)) {
                        scheduleDelayedSync(context, 30 * 60 * 1000L);
                    } else if ("1h".equals(strategy)) {
                        scheduleDelayedSync(context, 60 * 60 * 1000L);
                    }
                }
            }
        }
        // 2. Caso: Alarma de sincronización disparada
        else if (ACTION_AUTO_SYNC.equals(action)) {
            Log.d(TAG, "Alarma matutina activada. Disparando sincronización silenciosa.");
            triggerSyncToActivity(context);
            if ("fixed".equals(strategy)) {
                scheduleFixedAlarm(context);
            }
        }
        // 3. Caso: Reinicio del teléfono
        else if (Intent.ACTION_BOOT_COMPLETED.equals(action)) {
            Log.d(TAG, "Dispositivo reiniciado. Restaurando alarmas de sincronización si aplica.");
            if ("fixed".equals(strategy)) {
                scheduleFixedAlarm(context);
            }
        }
    }

    private void triggerSyncToActivity(Context context) {
        SleepWidgetPlugin.setPendingAutoSync(true);

        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = null;
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "sinering:MorningSyncWakeLock");
            wakeLock.acquire(15000); // 15 segundos máx para iniciar
        }

        try {
            Intent syncIntent = new Intent(context, MainActivity.class);
            syncIntent.setAction(ACTION_AUTO_SYNC);
            syncIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            context.startActivity(syncIntent);
        } catch (Exception e) {
            Log.e(TAG, "Error iniciando actividad para sincronización: " + e.getMessage());
        } finally {
            if (wakeLock != null && wakeLock.isHeld()) {
                try { wakeLock.release(); } catch (Exception ignored) {}
            }
        }
    }

    public static void scheduleDelayedSync(Context context, long delayMillis) {
        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, MorningSyncReceiver.class);
        intent.setAction(ACTION_AUTO_SYNC);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, 1001, intent, flags);

        long triggerAt = System.currentTimeMillis() + delayMillis;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, triggerAt, pi);
        }
        Log.d(TAG, "Sincronización matutina programada en " + (delayMillis / 60000) + " minutos.");
    }

    public static void scheduleFixedAlarm(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(SleepWidgetPlugin.PREFS_NAME, Context.MODE_PRIVATE);
        int targetHour = prefs.getInt("auto_sync_fixed_hour", 8);
        int targetMinute = prefs.getInt("auto_sync_fixed_minute", 30);

        AlarmManager am = (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;

        Intent intent = new Intent(context, MorningSyncReceiver.class);
        intent.setAction(ACTION_AUTO_SYNC);

        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pi = PendingIntent.getBroadcast(context, 1002, intent, flags);

        Calendar cal = Calendar.getInstance();
        cal.set(Calendar.HOUR_OF_DAY, targetHour);
        cal.set(Calendar.MINUTE, targetMinute);
        cal.set(Calendar.SECOND, 0);
        cal.set(Calendar.MILLISECOND, 0);

        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(Calendar.DAY_OF_YEAR, 1);
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        } else {
            am.setExact(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(), pi);
        }
        Log.d(TAG, "Alarma fija programada para: " + cal.getTime());
    }
}
