package com.lu.stockgoogle.service

import android.app.*
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.*
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.lu.stockgoogle.MainActivity
import com.lu.stockgoogle.R
import kotlinx.coroutines.*
import java.net.HttpURLConnection
import java.net.URL

/**
 * 专为三星 Galaxy S24+ (Android 16 API 36) 构建的 2s 极速常驻前台扫描服务
 * - 声明 Android 14/15/16 强制的 FOREGROUND_SERVICE_TYPE_DATA_SYNC
 * - 获取 PARTIAL_WAKE_LOCK 防止熄屏时挂起核心扫描协程
 * - Ongoing 常驻通知栏显示实时扫描状态
 */
class ForegroundScannerService : Service() {

    private val serviceJob = SupervisorJob()
    private val serviceScope = CoroutineScope(Dispatchers.IO + serviceJob)
    private var scanIntervalMs: Long = 2000L
    private var isRunning = false
    private var wakeLock: PowerManager.WakeLock? = null
    private var scannedCycles = 0

    companion object {
        const val OLD_CHANNEL_ID = "stock_g_scanner_channel"
        const val CHANNEL_ID = "stock_g_daemon_silent_v2"
        const val NOTIFICATION_ID = 1001
        const val ACTION_STOP_SCAN = "com.lu.stockgoogle.ACTION_STOP_SCAN"
    }

    override fun onCreate() {
        super.onCreate()
        acquireWakeLock()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            notificationManager?.cancel(NOTIFICATION_ID)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                notificationManager?.deleteNotificationChannel(CHANNEL_ID)
            }
        } catch (_: Exception) {}
        stopSelf()
        return START_NOT_STICKY
    }

    private fun acquireWakeLock() {
        if (wakeLock == null) {
            val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
            wakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK,
                "StockG::ForegroundScannerWakeLock"
            ).apply {
                setReferenceCounted(false)
                acquire(12 * 60 * 60 * 1000L)
            }
            Log.d("ForegroundService", ">> WakeLock 已激活 (防止三星 S24+ 熄屏休眠)")
        }
    }

    private fun startContinuousScanLoop() {
        serviceScope.launch {
            while (isActive && isRunning) {
                scannedCycles++
                try {
                    // 与后端服务器 43.163.192.120 (Nginx 反向代理端口 80) 同步巡检信号
                    val url = URL("http://43.163.192.120/api/v1/health")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        connectTimeout = 1500
                        readTimeout = 1500
                        requestMethod = "GET"
                    }
                    if (conn.responseCode == 200) {
                        conn.inputStream.bufferedReader().use { /* 保持通信心跳 */ }
                    }
                    conn.disconnect()
                } catch (_: Exception) {
                    // 本地自主扫描运作
                }

                // 移除重复更新通知栏的代码，彻底防止顶部状态栏与下拉通知栏跳动打扰
                delay(scanIntervalMs)
            }
        }
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            // 1. 彻底删除旧的显示在顶部状态栏的通道，清除历史遗留
            try {
                manager.deleteNotificationChannel(OLD_CHANNEL_ID)
            } catch (_: Exception) {}

            // 2. 创建全新的无干扰静默守护通道 (IMPORTANCE_MIN)
            // IMPORTANCE_MIN 规则：绝不在手机顶部状态栏显示任何图标，无弹窗、无声音、无震动
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Stock-G 后台守护进程 (静默运行)",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "保障后台 2 秒极速量化巡检 (静默无干扰，不占顶部状态栏)"
                setShowBadge(false)
                enableVibration(false)
                setSound(null, null)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildOngoingNotification(): Notification {
        val launchIntent = Intent(this, MainActivity::class.java)
        val pendingIntent = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Stock-G 守护中")
            .setContentText("后台量化引擎平稳运行中")
            .setSmallIcon(R.drawable.ic_quant_radar)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setSilent(true)
            .setContentIntent(pendingIntent)
            .build()
    }

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        serviceJob.cancel()
        try {
            if (wakeLock?.isHeld == true) {
                wakeLock?.release()
            }
        } catch (_: Exception) {}
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
