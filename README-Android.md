# BC Crash Lab — Android সংস্করণ

Electron অ্যাপের Android পোর্ট। নেটিভ Android WebView-তে bc.game খোলে, নিচে/পাশে আগের মতোই ডেটা · হিস্টোরি · অ্যাডভাইজার প্যানেল (`index.html` + `renderer.js` প্রায় অপরিবর্তিত)।

## GitHub দিয়ে APK বানানোর ধাপ
1. GitHub-এ নতুন repository খুলুন।
2. এই zip এক্সট্রাক্ট করে **ভেতরের সব ফাইল/ফোল্ডার** (`.github`, `app`, `build.gradle`, `settings.gradle`, `gradle.properties` …) repository-র **রুটে** আপলোড/push করুন। `.github/workflows/android.yml` রুটে থাকা জরুরি।
3. Repository → **Actions** ট্যাব → "Build Android APK" → **Run workflow** (push করলেও নিজে চলবে)।
4. বিল্ড শেষ হলে রান পেজের নিচে **Artifacts → BC-Crash-Lab-debug-apk** ডাউনলোড করুন, ভেতরের `app-debug.apk` ফোনে ইনস্টল করুন (Unknown sources অনুমতি লাগবে)।

## মোবাইলে যেভাবে কাজ করে
- ওপরে টুলবার ও সিগন্যাল বার, মাঝে bc.game, নিচে প্যানেল। "📊 প্যানেল" বাটনে প্যানেল লুকিয়ে গেম বড় করা যায়।
- "🖥 ফুল ভিউ" চালু থাকলে সাইট ডেস্কটপ-চওড়া লেআউটে দেখায়; `−`/`+` দিয়ে জুম।
- অ্যাপ খোলা ও স্ক্রিন অন থাকলেই ক্যাপচার চলে (ব্যাকগ্রাউন্ডে Android WebView থামিয়ে দেয়)। স্ক্রিন চালু রাখার ফ্ল্যাগ দেওয়া আছে।
- CSV এক্সপোর্ট/ইম্পোর্ট Android-এর ফাইল পিকার দিয়ে।
- Google সাইন-ইন/পেমেন্ট পপআপ আলাদা ডায়ালগে খোলে। তবে Google অনেক সময় এম্বেডেড WebView-তে সাইন-ইন আটকায় — সেক্ষেত্রে ইমেইল/অন্য লগইন ব্যবহার করুন।

## Electron সংস্করণ থেকে পার্থক্য
- **অটো-বেট (আসল টাকা, নিজে থেকে "Bet" ক্লিক) এই সংস্করণে বাদ।** Amount ও Auto Cash Out ঘর অটোফিল থাকছে; Bet আপনি নিজে চাপবেন। (আগের README-তে "শুধু পেপার" লেখা থাকলেও Electron কোডে আসল ক্লিকের অপশন ছিল।)
- পেপার ট্রেডিং, সিগন্যাল, ব্যাকটেস্ট, থ্রিল স্টেজ, ডেটা সংরক্ষণ আগের মতোই।

## ফাইল কাঠামো
- `app/src/main/java/.../MainActivity.java` — দুই WebView + JS ব্রিজ
- `app/src/main/assets/www/` — `index.html`, `renderer.js`, `android-shim.js` (Electron `<webview>`/`window.api` এর বদলি)
- `.github/workflows/android.yml` — GitHub Actions বিল্ড

## সতর্কতা
এই বিল্ড আমার এখানে কম্পাইল করে পরীক্ষা করা যায়নি। Actions-এ এরর এলে লগের লাল অংশটা পাঠালে ঠিক করে দেবো।
