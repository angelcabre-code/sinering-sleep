package com.sinergia.sineringsleep

import android.content.Intent
import android.net.Uri
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.metadata.Metadata
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Instant
import java.time.ZoneOffset

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {

    private val permissions = setOf(
        HealthPermission.getWritePermission(SleepSessionRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class)
    )

    private fun getClient(): HealthConnectClient? {
        val ctx = context ?: return null
        return if (HealthConnectClient.getSdkStatus(ctx) == HealthConnectClient.SDK_AVAILABLE) {
            HealthConnectClient.getOrCreate(ctx)
        } else {
            null
        }
    }

    @PluginMethod
    fun checkAvailability(call: PluginCall) {
        val ctx = context
        if (ctx == null) {
            call.reject("Contexto no disponible")
            return
        }
        val status = HealthConnectClient.getSdkStatus(ctx)
        val ret = JSObject()
        when (status) {
            HealthConnectClient.SDK_AVAILABLE -> ret.put("status", "AVAILABLE")
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> ret.put("status", "UPDATE_REQUIRED")
            else -> ret.put("status", "UNAVAILABLE")
        }
        call.resolve(ret)
    }

    @PluginMethod
    fun getHealthPermissionsStatus(call: PluginCall) {
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("available", false)
            call.resolve(ret)
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val isAllGranted = granted.containsAll(permissions)
                val ret = JSObject()
                ret.put("granted", isAllGranted)
                ret.put("available", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("Error comprobando permisos de salud: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun requestHealthPermissions(call: PluginCall) {
        val act = activity
        if (act == null) {
            call.reject("Actividad no disponible")
            return
        }

        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(act, permissions)
            startActivityForResult(call, intent, "healthPermissionsCallback")
        } catch (e: Exception) {
            // Fallback a apertura de ajustes de Health Connect
            try {
                val intent = Intent("androidx.health.ACTION_HEALTH_CONNECT_SETTINGS")
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK
                context.startActivity(intent)
                call.resolve(JSObject().put("success", true).put("fallbackSettings", true))
            } catch (e2: Exception) {
                call.reject("No se pudo solicitar permisos de salud: ${e.message}")
            }
        }
    }

    @ActivityCallback
    private fun healthPermissionsCallback(call: PluginCall, result: ActivityResult) {
        val client = getClient()
        if (client == null) {
            val ret = JSObject()
            ret.put("granted", false)
            ret.put("available", false)
            call.resolve(ret)
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val granted = client.permissionController.getGrantedPermissions()
                val isAllGranted = granted.containsAll(permissions)
                val ret = JSObject()
                ret.put("granted", isAllGranted)
                ret.put("available", true)
                call.resolve(ret)
            } catch (e: Exception) {
                val ret = JSObject()
                ret.put("granted", false)
                ret.put("error", e.message)
                call.resolve(ret)
            }
        }
    }

    @PluginMethod
    fun writeSleepSession(call: PluginCall) {
        val client = getClient()
        if (client == null) {
            call.reject("Health Connect no está disponible en este dispositivo.")
            return
        }

        val startTimeStr = call.getString("startTime")
        val endTimeStr = call.getString("endTime")
        val title = call.getString("title", "Sueño SineRing (COLMI R09)")
        val notes = call.getString("notes", "Registrado por SineRing Sleep con anillo inteligente COLMI R09")
        val stagesJson = call.getArray("stages") ?: JSArray()

        if (startTimeStr == null || endTimeStr == null) {
            call.reject("startTime y endTime son obligatorios (formato ISO-8601)")
            return
        }

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val startInstant = Instant.parse(startTimeStr)
                val endInstant = Instant.parse(endTimeStr)
                val zoneOffset = ZoneOffset.systemDefault().rules.getOffset(startInstant)

                val stagesList = mutableListOf<SleepSessionRecord.Stage>()

                for (i in 0 until stagesJson.length()) {
                    val item = stagesJson.getJSONObject(i)
                    val sStart = Instant.parse(item.getString("startTime"))
                    val sEnd = Instant.parse(item.getString("endTime"))
                    val stageTypeStr = item.optString("stage", "light").lowercase()

                    val stageType = when (stageTypeStr) {
                        "deep" -> SleepSessionRecord.STAGE_TYPE_DEEP
                        "rem" -> SleepSessionRecord.STAGE_TYPE_REM
                        "awake" -> SleepSessionRecord.STAGE_TYPE_AWAKE
                        "out_of_bed" -> SleepSessionRecord.STAGE_TYPE_OUT_OF_BED
                        else -> SleepSessionRecord.STAGE_TYPE_LIGHT
                    }

                    stagesList.add(
                        SleepSessionRecord.Stage(
                            startTime = sStart,
                            endTime = sEnd,
                            stage = stageType
                        )
                    )
                }

                val sleepRecord = SleepSessionRecord(
                    startTime = startInstant,
                    startZoneOffset = zoneOffset,
                    endTime = endInstant,
                    endZoneOffset = zoneOffset,
                    title = title,
                    notes = notes,
                    stages = stagesList,
                    metadata = Metadata()
                )

                client.insertRecords(listOf(sleepRecord))

                val ret = JSObject()
                ret.put("success", true)
                ret.put("stagesCount", stagesList.size)
                call.resolve(ret)
            } catch (e: Exception) {
                e.printStackTrace()
                call.reject("Error al guardar registro en Health Connect: ${e.message}")
            }
        }
    }
}
