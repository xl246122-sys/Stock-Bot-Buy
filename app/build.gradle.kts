import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    id("com.google.gms.google-services") apply false
}
if (!providers.gradleProperty("radarAssets").isPresent || providers.gradleProperty("personalApp").isPresent) {
    apply(plugin = "com.google.gms.google-services")
}

// 1. 动态加载版本配置文件 (每次升级增加 0.01)
val versionPropsFile = rootProject.file("version.properties")
val versionProps = Properties().apply {
    if (versionPropsFile.exists()) {
        FileInputStream(versionPropsFile).use { load(it) }
    }
}

val appVersionName = versionProps.getProperty("VERSION_NAME", "1.01")
val appVersionCode = versionProps.getProperty("VERSION_CODE", "101").toInt()
val releaseOutputDir = rootProject.file("release").apply {
    if (!exists()) mkdirs()
}

android {
    namespace = "com.lu.stockgoogle"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.lu.stockgoogle"
        minSdk = 26
        targetSdk = 35
        versionCode = appVersionCode
        versionName = appVersionName

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
        debug {
            isDebuggable = true
            signingConfig = signingConfigs.getByName("debug")
        }
        create("radarTest") {
            initWith(getByName("debug"))
            applicationIdSuffix = ".radartest"
            versionNameSuffix = "-radar-test"
            matchingFallbacks += listOf("debug")
            buildConfigField("boolean", "RADAR_TEST", "true")
        }
        create("personal") {
            initWith(getByName("debug"))
            versionNameSuffix = "-personal"
            matchingFallbacks += listOf("debug")
        }
    }
    defaultConfig {
        buildConfigField("boolean", "RADAR_TEST", "false")
    }
    if (providers.gradleProperty("radarAssets").isPresent) {
        sourceSets.getByName("main").assets.setSrcDirs(
            listOf(rootProject.file(providers.gradleProperty("radarAssets").get()))
        )
    }

    lint {
        checkReleaseBuilds = false
        abortOnError = false
    }

    // 2. APK 默认输出路径为: D:\Stock-Google\release，命名规范为: Stock-G v1.01.apk
    applicationVariants.all {
        val variant = this
        val apkFileName = "Stock-G v${variant.versionName}.apk"

        variant.outputs.all {
            val output = this as? com.android.build.gradle.internal.api.BaseVariantOutputImpl
            output?.outputFileName = apkFileName
        }

        // 打包完成后自动将 APK 归档拷贝至 D:\Stock-Google\release
        val copyTask = tasks.register("copy${variant.name.replaceFirstChar { it.uppercase() }}ApkToRelease", Copy::class.java) {
            group = "publishing"
            description = "Copies the APK to D:\\Stock-Google\\release as $apkFileName"
            from(variant.outputs.map { it.outputFile })
            into(releaseOutputDir)
            rename { apkFileName }
        }

        variant.assembleProvider.configure {
            finalizedBy(copyTask)
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    buildFeatures {
        buildConfig = true
        viewBinding = true
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.google.material)

    // Firebase Cloud Messaging 强提醒推送通道
    implementation(platform(libs.firebase.bom))
    implementation(libs.firebase.messaging)

    // 2s 高频抓取与协程通信
    implementation(libs.okhttp)
    implementation(libs.coroutines.android)
}

// 3. 每次升级自动增加 0.01 的 Gradle Task
tasks.register("incrementVersion") {
    group = "versioning"
    description = "Increments the version by 0.01 (e.g. 1.01 -> 1.02)"
    doLast {
        val currentName = versionProps.getProperty("VERSION_NAME", "1.01")
        val currentCode = versionProps.getProperty("VERSION_CODE", "101").toInt()
        val parts = currentName.split(".")
        val major = parts[0].toInt()
        val minor = if (parts.size > 1) parts[1].toInt() else 1
        val newMinor = minor + 1
        val newName = String.format("%d.%02d", major, newMinor)
        val newCode = currentCode + 1

        versionProps.setProperty("VERSION_NAME", newName)
        versionProps.setProperty("VERSION_CODE", newCode.toString())
        FileOutputStream(versionPropsFile).use {
            versionProps.store(it, "Stock-G Version Configuration - Updated by incrementVersion")
        }
        println("✅ Stock-G 版本已成功递增: v$currentName -> v$newName (Code: $newCode)")
        println("📁 对应输出目标: D:\\Stock-Google\\release\\Stock-G v$newName.apk")
    }
}
