# Proguard rules for Stock-G
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}
-keep class com.lu.stockgoogle.** { *; }
