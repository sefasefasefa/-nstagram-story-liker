[app]

# Uygulama bilgileri
title = Instagram Follower Analyzer
package.name = instagramfollower
package.domain = org.kivy
source.dir = .
source.include_exts = py,png,jpg,kv,atlas,ttf
version = 1.0

# Android ayarları
requirements = python3,kivy,jnius,requests,android
android.permissions = INTERNET, ACCESS_NETWORK_STATE
android.api = 30
android.minapi = 21
android.ndk = 23b
android.sdk = 33
android.gradle_dependencies = 'com.android.tools.build:gradle:7.2.0'

# Derleme ayarları
orientation = portrait
fullscreen = 0
log_level = 2