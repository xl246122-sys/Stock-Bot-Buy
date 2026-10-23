package com.lu.stockgoogle

import android.app.Activity
import android.app.AlertDialog
import android.widget.EditText
import android.widget.Toast
import com.google.firebase.messaging.FirebaseMessaging
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

class PersonalActivation(private val activity: Activity) {
    private val preferences = activity.getSharedPreferences("personal_activation", 0)
    private val client = OkHttpClient.Builder().callTimeout(20, TimeUnit.SECONDS).build()

    fun show() = activity.runOnUiThread {
        val input = EditText(activity).apply {
            hint = "输入个人设备激活码"
            isSingleLine = true
            inputType = 129
        }
        AlertDialog.Builder(activity).setTitle("激活个人设备")
            .setMessage("无需注册账号。激活后可发送一条明确标注的测试通知。")
            .setView(input).setNegativeButton("取消", null)
            .setPositiveButton("激活") { _, _ -> submit(input.text.toString().trim(), false) }.show()
    }

    fun test() {
        val code = preferences.getString("code", "") ?: ""
        if (code.isEmpty()) { show(); return }
        submit(code, true)
    }

    private fun message(text: String) = activity.runOnUiThread {
        Toast.makeText(activity, text, Toast.LENGTH_LONG).show()
    }

    private fun submit(code: String, test: Boolean) {
        if (code.length < 16) { message("激活码不完整"); return }
        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
            if (!task.isSuccessful) {
                message("无法取得推送标识，请检查网络和 Google Play 服务")
                return@addOnCompleteListener
            }
            Thread {
                try {
                    val body = JSONObject().put("code", code).put("token", task.result).toString()
                    val request = Request.Builder()
                        .url("http://43.163.192.120/api/v2/device/" + if (test) "test" else "activate")
                        .post(body.toRequestBody("application/json".toMediaType())).build()
                    client.newCall(request).execute().use { response ->
                        if (response.isSuccessful) {
                            preferences.edit().putString("code", code).apply()
                            message(if (test) "测试请求已被推送服务接受，请确认手机通知栏" else "设备已激活，可发送测试通知；AI 买入推送仍待接通")
                        } else {
                            message(when(response.code) {
                                401 -> "激活码不正确"
                                409 -> "激活码已绑定其他设备"
                                429 -> "请等待一分钟再测试"
                                else -> "连接失败（${response.code}），请稍后重试"
                            })
                        }
                    }
                } catch (_: Exception) { message("无法连接服务器，请检查网络") }
            }.start()
        }
    }
}
