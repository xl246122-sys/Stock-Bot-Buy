package com.lu.stockgoogle.receiver

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.lu.stockgoogle.service.ForegroundScannerService

/**
 * 专为三星 S24+ 开机与系统重启设计的广播守护接收器
 * 当手机开机 (BOOT_COMPLETED) 或应用更新后，自动拉起 2s 前台量化扫描常驻服务
 */
class BootCompletedReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action
        Log.i("BootCompletedReceiver", ">> [System Event] 收到系统广播: $action")

        if (Intent.ACTION_BOOT_COMPLETED == action ||
            Intent.ACTION_MY_PACKAGE_REPLACED == action ||
            "android.intent.action.QUICKBOOT_POWERON" == action) {

            val serviceIntent = Intent(context, ForegroundScannerService::class.java).apply {
                putExtra("STARTED_BY_BOOT", true)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent)
            } else {
                context.startService(serviceIntent)
            }
            Log.i("BootCompletedReceiver", ">> [Auto Start] 已自动启动 ForegroundScannerService 前台保活服务")
        }
    }
}
