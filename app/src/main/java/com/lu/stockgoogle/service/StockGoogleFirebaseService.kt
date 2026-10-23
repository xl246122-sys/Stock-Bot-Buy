package com.lu.stockgoogle.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.lu.stockgoogle.MainActivity
import com.lu.stockgoogle.R
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 专为三星 Galaxy S24+ (Android 16) 调优的 FCM 原生云端推送信令接收服务
 * 支持在 Android 16 Doze Mode 与深度睡眠下被 Google Play Services 毫秒级唤醒，
 * 触发高优先级浮动弹窗 (Heads-up Notification) 与定制触觉马达震动。
 */
class StockGoogleFirebaseService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "StockGoogleFCM"
        const val HIGH_PRIORITY_CHANNEL_ID = MainActivity.TRADING_ALERTS_CHANNEL_ID
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.i(TAG, ">> [FCM] Device token refreshed: ${token.take(16)}...")
        sendFcmTokenToServer(token)
    }

    private fun sendFcmTokenToServer(token: String) {
        Thread {
            try {
                val url = URL("http://43.163.192.120/api/v1/fcm/register")
                val conn = (url.openConnection() as HttpURLConnection).apply {
                    requestMethod = "POST"
                    connectTimeout = 5000
                    readTimeout = 5000
                    doOutput = true
                    setRequestProperty("Content-Type", "application/json; charset=UTF-8")
                }
                val json = JSONObject().apply {
                    put("token", token)
                    put("deviceInfo", "${Build.MANUFACTURER} ${Build.MODEL} (Token Refreshed)")
                }
                conn.outputStream.use { os ->
                    os.write(json.toString().toByteArray(Charsets.UTF_8))
                }
                val responseCode = conn.responseCode
                Log.i(TAG, ">> [FCM] 刷新 Token 上报东京服务器成功 HTTP $responseCode")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w(TAG, ">> [FCM] 刷新 Token 上报失败: ${e.message}")
            }
        }.start()
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, ">> [FCM Received] 收到来自云端量化引擎的推送: ${remoteMessage.data}")

        val symbol = remoteMessage.data["symbol"] ?: remoteMessage.notification?.title ?: "Stock-G 美股量化"
        val strategy = remoteMessage.data["strategy"] ?: "DIP_REBOUND"
        val price = remoteMessage.data["price"] ?: ""
        val messageBody = remoteMessage.data["body"]
            ?: remoteMessage.notification?.body
            ?: "标的现价 $price 触发 $strategy 策略信号！"

        // 1. 毫秒级唤醒马达
        triggerSamsungHaptic(strategy)

        // 2. 弹出系统高优先级浮动横幅 (Heads-up Notification)
        showHeadsUpNotification(symbol, strategy, messageBody)
    }

    private fun triggerSamsungHaptic(strategy: String) {
        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vibratorManager.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }

            val pattern = when (strategy) {
                "DIP_REBOUND", "PLUNGE_DIP" -> longArrayOf(0, 90, 70, 160) // 抄底双短震
                "BREAKOUT", "OPENING_BREAKOUT" -> longArrayOf(0, 100, 60, 200) // 爆发冲刺震
                "STOP_LOSS" -> longArrayOf(0, 500) // 止损长警示
                else -> longArrayOf(0, 150)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, -1)
            }
        } catch (e: Exception) {
            Log.w(TAG, "震动驱动异常: ${e.message}")
        }
    }

    private fun showHeadsUpNotification(symbol: String, strategy: String, body: String) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        // 创建高优先级声音与震动通道
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                HIGH_PRIORITY_CHANNEL_ID,
                "Stock-G 量化交易即时预警",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Stock-G 专属高优先级浮动弹窗与清脆提示音通道"
                enableLights(true)
                enableVibration(true)
                vibrationPattern = longArrayOf(0, 90, 70, 160)
                setSound(
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                    AudioAttributes.Builder()
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .build()
                )
            }
            notificationManager.createNotificationChannel(channel)
        }

        val tapIntent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("NAVIGATE_TO", "ALERTS")
            putExtra("ALERT_SYMBOL", symbol)
            putExtra("OPEN_SYMBOL", symbol)
            putExtra("STRATEGY", strategy)
        }
        val pendingIntent = PendingIntent.getActivity(
            this,
            System.currentTimeMillis().toInt(),
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, HIGH_PRIORITY_CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_tab_alerts)
            .setContentTitle(if (strategy == "TEST") "Stock-G 测试通知（非买入信号）"
                else "观察：$symbol · $strategy")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify((System.currentTimeMillis() % 100000).toInt(), notification)
    }
}
