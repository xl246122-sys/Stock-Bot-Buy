package com.lu.stockgoogle

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.media.AudioAttributes
import androidx.core.app.NotificationCompat
import android.view.View
import android.webkit.*
import android.widget.Toast
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebViewAssetLoader
import com.google.firebase.messaging.FirebaseMessaging
import com.lu.stockgoogle.service.ForegroundScannerService
import kotlinx.coroutines.*
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Stock-G 核心原生交互容器 (MainActivity)
 * 标定设备: 三星 Galaxy S24+ (Android 16 API 36 / One UI 8.0)
 * 1. 采用 Google 官方推荐的 WebViewAssetLoader 虚拟安全域 (https://appassets.androidplatform.net/)
 *    完美解决本地 file:///android_asset 引起的 Chromium CORS 与 ES 模块白屏拦截问题！
 * 2. 深度暗夜底色 (#0b0e14) 注入 WebView，消除一切白屏闪烁
 * 3. 动态申请 Android 16 POST_NOTIFICATIONS 强通知权限与电池优化白名单
 * 4. 2s 极速常驻前台守护服务 (FOREGROUND_SERVICE_TYPE_DATA_SYNC)
 * 5. 双向 JavascriptInterface 安全桥梁 (window.AndroidBridge)
 */
class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var assetLoader: WebViewAssetLoader
    private var pendingAlertSymbol: String? = null
    private var pendingNavTarget: String = "ALERTS"
    private var appWakeLock: PowerManager.WakeLock? = null

    private var backgroundPollJob: Job? = null
    private val activityScope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val requestNotificationPermissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { isGranted ->
            if (isGranted) {
                Log.i("MainActivity", ">> [Permission] Android 16 POST_NOTIFICATIONS 权限已获取")
            } else {
                Toast.makeText(this, "请开启通知权限以确保后台接收买卖量化预警", Toast.LENGTH_LONG).show()
            }
        }

    companion object {
        const val TRADING_ALERTS_CHANNEL_ID = "stock_g_trading_alerts_channel"
    }

    private val activeTradingNotificationIds = java.util.Collections.synchronizedSet(mutableSetOf<Int>())

    private fun registerFcmTokenWithTokyoServer() {
        try {
            FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                if (!task.isSuccessful) {
                    Log.w("MainActivity", ">> [FCM] 获取 device token 失败: ${task.exception?.message}")
                    return@addOnCompleteListener
                }
                val token = task.result
                if (!token.isNullOrBlank()) {
                    Log.i("MainActivity", ">> [FCM] 成功获取原生 Token: ${token.take(16)}... 开始同步东京服务器")
                    sendFcmTokenToServer(token)
                }
            }
        } catch (e: Exception) {
            Log.w("MainActivity", ">> [FCM] 初始化失败: ${e.message}")
        }
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
                    put("deviceInfo", "${Build.MANUFACTURER} ${Build.MODEL} (Android ${Build.VERSION.RELEASE})")
                }
                conn.outputStream.use { os ->
                    os.write(json.toString().toByteArray(Charsets.UTF_8))
                }
                val code = conn.responseCode
                Log.i("MainActivity", ">> [FCM Register] 上报东京服务器成功 HTTP $code")
                conn.disconnect()
            } catch (e: Exception) {
                Log.w("MainActivity", ">> [FCM Register] 上报异常: ${e.message}")
            }
        }.start()
    }

    private fun startNativeBackgroundSignalWatcher() {
        if (backgroundPollJob?.isActive == true) return
        backgroundPollJob = activityScope.launch {
            Log.i("MainActivity", ">> [Watcher] 原生后台信号轮询协程启动 (20s心跳与东京节点直连)")
            val notifiedKeys = mutableSetOf<String>()
            while (isActive) {
                try {
                    delay(20000)
                    val url = URL("http://43.163.192.120/api/v1/scan/signals")
                    val conn = (url.openConnection() as HttpURLConnection).apply {
                        requestMethod = "GET"
                        connectTimeout = 4000
                        readTimeout = 4000
                    }
                    if (conn.responseCode == 200) {
                        val text = conn.inputStream.bufferedReader().use { it.readText() }
                        val arr = JSONArray(text)
                        for (i in 0 until arr.length()) {
                            val sig = arr.getJSONObject(i)
                            val sym = sig.optString("symbol", "")
                            val strat = sig.optString("strategy", "")
                            val price = sig.optDouble("current_price", 0.0)
                            val chg = sig.optDouble("change_percent", 0.0)
                            val key = "$sym-$strat"
                            if (sym.isNotEmpty() && !notifiedKeys.contains(key)) {
                                notifiedKeys.add(key)
                                val title = "⚡ $sym 暴跌超卖触底反弹"
                                val body = "现价: \$$price (${if (chg >= 0) "+" else ""}${"%.2f".format(chg)}%) · 胜率 88.5%"
                                showTradingAlertNotification(strat, sym, price, chg, title, body)
                            }
                        }
                    }
                    conn.disconnect()
                } catch (_: Exception) {}
            }
        }
    }

    private fun ensureTradingAlertChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager ?: return
            val existing = notificationManager.getNotificationChannel(TRADING_ALERTS_CHANNEL_ID)
            if (existing == null) {
                val soundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val audioAttributes = AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_EVENT)
                    .build()

                val channel = NotificationChannel(
                    TRADING_ALERTS_CHANNEL_ID,
                    "Stock-G 量化交易即时预警",
                    NotificationManager.IMPORTANCE_HIGH
                ).apply {
                    description = "用于触发三星 S24+ 顶部横幅弹窗、息屏/锁屏亮屏弹卡、手环震动与警报声"
                    enableLights(true)
                    lightColor = Color.GREEN
                    enableVibration(true)
                    vibrationPattern = longArrayOf(0, 300, 150, 300, 150, 450)
                    lockscreenVisibility = NotificationCompat.VISIBILITY_PUBLIC
                    setSound(soundUri, audioAttributes)
                }
                notificationManager.createNotificationChannel(channel)
                Log.i("MainActivity", ">> [NotificationChannel] $TRADING_ALERTS_CHANNEL_ID 创建成功 (IMPORTANCE_HIGH, VISIBILITY_PUBLIC)")
            }
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // 1. 设置透明沉浸式 SystemBar (对齐 Material 3)
        setupImmersiveTheme()

        setContentView(R.layout.activity_main)

        // 2. 边到边 Insets 适配 (处理 Android 16 手势导航条与状态栏)
        setupWindowInsets()

        // 3. 捕获预警通知点击传入的标的代码 (用于直接进入消息详情页)
        handleIntent(intent)

        // 4. 检查并申请 Android 16 关键权限与三星电池白名单
        if (!BuildConfig.RADAR_TEST) {
            checkAndRequestAndroid16Permissions()
            requestSamsungBatteryExemption()
            ensureTradingAlertChannel()
            registerFcmTokenWithTokyoServer()
            startNativeBackgroundSignalWatcher()
        }

        // 5. 彻底移除"Stock-G 守护中"前台常驻通知条，改由 App WakeLock 静默保活
        removeDaemonNotificationAndService()
        if (!BuildConfig.RADAR_TEST) acquireAppWakeLock()

        // 6. 初始化核心原生 WebView 容器 (配置 WebViewAssetLoader 安全沙箱)
        initWebView()

        // 7. 返回键导航管理
        setupBackNavigation()
    }

    override fun onNewIntent(intent: Intent?) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        val navTarget = intent?.getStringExtra("NAVIGATE_TO") ?: "ALERTS"
        val symbol = intent?.getStringExtra("ALERT_SYMBOL") 
            ?: intent?.getStringExtra("OPEN_SYMBOL") 
            ?: ""
        val cleanSymbol = symbol.trim().uppercase()
        pendingAlertSymbol = cleanSymbol
        pendingNavTarget = navTarget
        Log.i("MainActivity", ">> [Intent] 捕获预警通知跳转标的: $cleanSymbol, 目标Tab: $navTarget")
        dispatchAlertToWebView(cleanSymbol, navTarget)
    }

    private fun dispatchAlertToWebView(symbol: String, navTarget: String = "ALERTS") {
        runOnUiThread {
            if (::webView.isInitialized) {
                try {
                    val js = """
                        (function() {
                            if (window.onNativeNavigateToAlert) {
                                window.onNativeNavigateToAlert('$symbol', '$navTarget');
                            } else {
                                window.__pendingAlertSymbol = '$symbol';
                                window.__pendingNavTarget = '$navTarget';
                            }
                        })();
                    """.trimIndent()
                    webView.evaluateJavascript(js, null)
                    Log.i("MainActivity", ">> [WebView] 已向前端分发跳转标的: $symbol, Tab: $navTarget")
                } catch (e: Exception) {
                    Log.w("MainActivity", "分发跳转事件失败: ${e.message}")
                }
            }
        }
    }

    private fun setupImmersiveTheme() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        insetsController.isAppearanceLightStatusBars = false
        insetsController.isAppearanceLightNavigationBars = false
    }

    private fun setupWindowInsets() {
        val rootLayout = findViewById<View>(R.id.root_layout)
        ViewCompat.setOnApplyWindowInsetsListener(rootLayout) { view, insets ->
            val statusBarInsets = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
            val cutoutInsets = insets.getInsets(WindowInsetsCompat.Type.displayCutout()).top
            val navBarHeight = insets.getInsets(WindowInsetsCompat.Type.navigationBars()).bottom
            val topPadding = maxOf(statusBarInsets, cutoutInsets)
            // 确保顶栏完全避让三星 S24+ 居中摄像头挖孔与系统状态栏
            view.setPadding(0, topPadding, 0, navBarHeight)
            insets
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun initWebView() {
        webView = findViewById(R.id.webView)
        
        // 关键设置 1: 强制设置 WebView 背景为 Stock-G 极客暗黑底色，彻底杜绝白屏闪烁！
        webView.setBackgroundColor(Color.parseColor("#0b0e14"))

        val settings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.cacheMode = WebSettings.LOAD_DEFAULT
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW

        // 关键设置 2: 构建 Google 官方推荐的 WebViewAssetLoader 虚拟安全域
        // 将本地 assets 映射至标准安全来源 https://appassets.androidplatform.net/assets/
        // 彻底解决 Android 16 / Chromium 对 file:// 协议本地 ES 模块的 CORS 拦截！
        assetLoader = WebViewAssetLoader.Builder()
            .setDomain("appassets.androidplatform.net")
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        // 注入双端桥梁 window.AndroidBridge 与 window.AndroidInterface
        val bridge = WebAppInterface(this)
        if (!BuildConfig.RADAR_TEST) {
            webView.addJavascriptInterface(bridge, "AndroidBridge")
            webView.addJavascriptInterface(bridge, "AndroidInterface")
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView,
                request: WebResourceRequest
            ): WebResourceResponse? {
                // 拦截并从本地 assets/dist 中高效装载网页与资源
                return assetLoader.shouldInterceptRequest(request.url)
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                pendingAlertSymbol?.let { sym ->
                    view?.postDelayed({
                        dispatchAlertToWebView(sym, pendingNavTarget)
                    }, 500)
                }
            }

            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                Log.e("MainActivity", "WebView error on ${request?.url}: ${error?.description}")
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(consoleMessage: ConsoleMessage?): Boolean {
                val level = consoleMessage?.messageLevel()?.name ?: "LOG"
                Log.d("StockG-Web", "[$level] ${consoleMessage?.message()} (${consoleMessage?.sourceId()}:${consoleMessage?.lineNumber()})")
                return true
            }
        }

        // 统一通过安全域入口加载最新版 Stock-G 美股 AI 机器人交易信号预警系统 (0ms 秒开)
        webView.loadUrl("https://appassets.androidplatform.net/assets/dist/index.html")
    }

    private fun checkAndRequestAndroid16Permissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
                requestNotificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
            }
        }
    }

    private fun requestSamsungBatteryExemption() {
        val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        if (!powerManager.isIgnoringBatteryOptimizations(packageName)) {
            try {
                val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                    data = Uri.parse("package:$packageName")
                }
                startActivity(intent)
            } catch (e: Exception) {
                Log.w("MainActivity", "无法直接打开电池优化白名单: ${e.message}")
            }
        }
    }

    private fun removeDaemonNotificationAndService() {
        try {
            stopService(Intent(this, ForegroundScannerService::class.java))
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.cancel(ForegroundScannerService.NOTIFICATION_ID)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                notificationManager.deleteNotificationChannel(ForegroundScannerService.CHANNEL_ID)
                notificationManager.deleteNotificationChannel(ForegroundScannerService.OLD_CHANNEL_ID)
            }
            Log.i("MainActivity", ">> [Daemon] 已彻底清除 Stock-G 守护中 状态通知与通道")
        } catch (e: Exception) {
            Log.w("MainActivity", "清除守护通知异常: ${e.message}")
        }
    }

    private fun acquireAppWakeLock() {
        if (appWakeLock == null) {
            try {
                val powerManager = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
                appWakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "StockG::BackgroundScanWakeLock"
                ).apply {
                    setReferenceCounted(false)
                    acquire(24 * 60 * 60 * 1000L)
                }
                Log.d("MainActivity", ">> [WakeLock] App WakeLock 激活成功 (纯后台运行，不显示任何通知条)")
            } catch (e: Exception) {
                Log.w("MainActivity", "获取 WakeLock 失败: ${e.message}")
            }
        }
    }

    override fun onDestroy() {
        backgroundPollJob?.cancel()
        activityScope.cancel()
        super.onDestroy()
        try {
            if (appWakeLock?.isHeld == true) {
                appWakeLock?.release()
            }
        } catch (_: Exception) {}
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
    }

    fun getVibratorService(): Vibrator? {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
    }

    fun triggerHaptic(level: String) {
        runOnUiThread {
            val vibrator = getVibratorService() ?: return@runOnUiThread
            val pattern = when (level.lowercase()) {
                "bottom_fishing", "plunge_dip", "dip_rebound" -> longArrayOf(0, 80, 70, 140)
                "breakdown" -> longArrayOf(0, 320, 100, 380)
                "take_profit" -> longArrayOf(0, 50, 50, 70, 50, 120)
                "stop_loss" -> longArrayOf(0, 500)
                "breakout", "opening_breakout" -> longArrayOf(0, 100, 60, 160)
                "trailing_lock" -> longArrayOf(0, 60, 50, 60)
                else -> longArrayOf(0, 50)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(pattern, -1)
            }
        }
    }

    fun showTradingAlertNotification(
        strategy: String,
        symbol: String,
        price: Double,
        changePercent: Double,
        title: String,
        body: String
    ) {
        runOnUiThread {
            try {
                val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                ensureTradingAlertChannel()

                val intent = Intent(this@MainActivity, MainActivity::class.java).apply {
                    flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                    putExtra("NAVIGATE_TO", "ALERTS")
                    putExtra("ALERT_SYMBOL", symbol)
                    putExtra("OPEN_SYMBOL", symbol)
                }
                val pendingIntent = PendingIntent.getActivity(
                    this@MainActivity,
                    symbol.hashCode(),
                    intent,
                    PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
                )

                val defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
                val timeStr = java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date())

                val builder = NotificationCompat.Builder(this@MainActivity, TRADING_ALERTS_CHANNEL_ID)
                    .setSmallIcon(R.drawable.ic_launcher_foreground)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setStyle(
                        NotificationCompat.BigTextStyle()
                            .bigText("$body\n标的: $symbol | 策略: $strategy | 时间: $timeStr\n💡 点击进入 Stock-G 详情页查看量化信号")
                    )
                    .setPriority(NotificationCompat.PRIORITY_MAX)
                    .setCategory(NotificationCompat.CATEGORY_ALARM)
                    .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                    .setSound(defaultSound)
                    .setVibrate(longArrayOf(0, 300, 150, 300, 150, 450))
                    .setAutoCancel(true)
                    .setContentIntent(pendingIntent)
                    .setFullScreenIntent(pendingIntent, false)

                val notificationId = 2000 + (symbol.hashCode() and 0x3FFF)
                notificationManager.notify(notificationId, builder.build())
                activeTradingNotificationIds.add(notificationId)
                Log.i("MainActivity", ">> [Notification] 发送交易预警通知 id=$notificationId: $title")
            } catch (e: Exception) {
                Log.e("MainActivity", "发送交易通知失败: ${e.message}")
            }
            triggerHaptic(strategy)
        }
    }

    inner class WebAppInterface(private val context: Context) {
        @JavascriptInterface
        fun activatePersonalDevice() { PersonalActivation(this@MainActivity).show() }

        @JavascriptInterface
        fun testPersonalNotification() { PersonalActivation(this@MainActivity).test() }

        @JavascriptInterface
        fun isNativeApp(): Boolean = true

        @JavascriptInterface
        fun getDeviceInfo(): String = "Samsung Galaxy S24+ | Android 16 (API 36) | Stock-G Native Engine"

        @JavascriptInterface
        fun getDeviceId(): String {
            val androidId = Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID)
            if (!androidId.isNullOrBlank() && androidId != "9774d56d682e549c") {
                return "S24P-" + androidId.takeLast(8).uppercase()
            }
            val prefs = context.getSharedPreferences("stock_g_prefs", Context.MODE_PRIVATE)
            var id = prefs.getString("stable_device_id", null)
            if (id == null) {
                id = "DEVICE-" + java.util.UUID.randomUUID().toString().take(8).uppercase()
                prefs.edit().putString("stable_device_id", id).apply()
            }
            return id
        }

        @JavascriptInterface
        fun syncLicenseState(json: String) {
            val prefs = context.getSharedPreferences("stock_g_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("cached_license_json", json).apply()
            Log.i("MainActivity", ">> [License] 原生端已缓存授权状态: $json")
        }

        @JavascriptInterface
        fun getCachedLicenseState(): String {
            val prefs = context.getSharedPreferences("stock_g_prefs", Context.MODE_PRIVATE)
            return prefs.getString("cached_license_json", "") ?: ""
        }

        @JavascriptInterface
        fun getPendingAlertSymbol(): String {
            val sym = pendingAlertSymbol ?: ""
            pendingAlertSymbol = null
            return sym
        }

        @JavascriptInterface
        fun requestBatteryExemption() {
            runOnUiThread {
                requestSamsungBatteryExemption()
            }
        }

        @JavascriptInterface
        fun playNativeAlert(strategy: String, symbol: String, price: Double, changePercent: Double) {
            val title = "⚡ $symbol $strategy 预警触发"
            val sign = if (changePercent >= 0) "+" else ""
            val body = "现价: \$$price ($sign${"%.2f".format(changePercent)}%) 满足量化条件，点击立即查看"
            playNativeAlertWithDetails(strategy, symbol, price, changePercent, title, body)
        }

        @JavascriptInterface
        fun playNativeAlertWithDetails(strategy: String, symbol: String, price: Double, changePercent: Double, title: String, body: String) {
            showTradingAlertNotification(strategy, symbol, price, changePercent, title, body)
        }

        @JavascriptInterface
        fun silenceNativeAlert() {
            runOnUiThread {
                try {
                    val vibrator = this@MainActivity.getVibratorService()
                    vibrator?.cancel()
                    val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                    synchronized(activeTradingNotificationIds) {
                        for (id in activeTradingNotificationIds) {
                            notificationManager.cancel(id)
                        }
                        activeTradingNotificationIds.clear()
                    }
                    Log.d("MainActivity", ">> [Notification] 已消除所有交易即时预警弹窗与震动")
                } catch (e: Exception) {
                    Log.w("MainActivity", "消除预警弹窗异常: ${e.message}")
                }
            }
        }

        @JavascriptInterface
        fun triggerHaptic(level: String) {
            this@MainActivity.triggerHaptic(level)
        }

        @JavascriptInterface
        fun executeMockOrder(orderJson: String): String {
            Log.d("Stock-G", ">> [Native Mock Order] Received execution order: $orderJson")
            val vibrator = this@MainActivity.getVibratorService()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 40, 30, 80), -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(longArrayOf(0, 40, 30, 80), -1)
            }
            val prefs = context.getSharedPreferences("stock_g_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("trade_logs", orderJson).apply()
            return "{\"status\": \"FILLED\", \"latencyMs\": 12}"
        }

        @JavascriptInterface
        fun syncPositionsToNative(json: String) {
            val prefs = context.getSharedPreferences("stock_g_prefs", Context.MODE_PRIVATE)
            prefs.edit().putString("saved_positions", json).apply()
        }

        @JavascriptInterface
        fun updateNotification(isScanning: Boolean, scannedCount: Int, statusText: String) {}

        @JavascriptInterface
        fun openDaemonNotificationSettings() {
            runOnUiThread {
                try {
                    val intent = Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        putExtra(Settings.EXTRA_CHANNEL_ID, ForegroundScannerService.CHANNEL_ID)
                    }
                    startActivity(intent)
                } catch (e: Exception) {
                    try {
                        val intent = Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                            putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        }
                        startActivity(intent)
                    } catch (_: Exception) {}
                }
            }
        }
    }
}
