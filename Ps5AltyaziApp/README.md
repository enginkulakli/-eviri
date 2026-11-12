# PS5 Altyazı — Tablet Uygulaması (kaynak kod)

## Hazır APK'yı GitHub'a derletme (önerilen — tablette hiçbir kurulum gerekmez)

1. github.com'da (ücretsiz) bir hesabın yoksa aç. Tarayıcıdan/GitHub mobil
   uygulamasından tablette de yapılır.
2. Yeni bir **repository** oluştur (adı önemli değil, "Private" seçebilirsin).
3. Repo sayfasında **Add file > Upload files** ile bu zip'in İÇİNDEKİ TÜM
   dosya ve klasörleri (gizli `.github` klasörü dahil) sürükle-bırak yükle,
   **Commit changes**'e bas.
4. Üstteki **Actions** sekmesine git. "APK derle" adlı bir çalıştırma otomatik
   başlayacak (birkaç dakika sürer, Android SDK bulutta kurulup kodu derliyor).
5. Yeşil tik çıkınca o çalıştırmanın sayfasına gir, en altta **Artifacts**
   bölümünde **Ps5Altyazi-debug-apk** dosyasını indir (bir .zip içinde gelir,
   içinde `app-debug.apk` var).
6. Bu `.apk`'yı tablete indirip aç, "bilinmeyen kaynaklardan yükleme" iznini
   ver, kur. Artık çalışır durumda.

Derleme kırmızı (başarısız) çıkarsa, o çalıştırmanın log'undaki hata mesajını
kopyalayıp buraya yapıştır — bir satır değiştirip tekrar yükleriz, GitHub
otomatik yeniden derler.

## Alternatif: AIDE ile tablette derleme

Bu yöntemde `gradlew` olmadığı için AIDE'de **New Project** ile boş bir
Gradle projesi oluşturup kaynak dosyaları onun içine taşıman gerekiyor
(wrapper dosyalarını AIDE kendisi üretir). Yukarıdaki GitHub yöntemi bunu
gerektirmediği için daha az uğraştırıcı.

## Ne yapıyor
1. Ekranını MediaProjection ile yakalıyor (PS Remote Play açıkken).
2. Her ~800ms'de bir kareyi görüntünün alt %28'lik kısmına (altyazı bölgesi)
   odaklanarak ML Kit OCR'dan geçiriyor.
3. Metin değiştiyse ML Kit (cihaz üstü, ücretsiz) ile Türkçeye çeviriyor.
4. Sonucu, tablette çalışan küçük bir WebSocket sunucusu üzerinden TV'deki
   `Ps5Altyazi.wgt` uygulamasına JSON olarak (`{"text": "..."}`) gönderiyor.

## Kurulum adımları (tablet, AIDE)
1. Bu klasörü AIDE ile aç (proje olarak import et).
2. AIDE Gradle senkronizasyonunu bekle (ML Kit + Java-WebSocket indirilecek).
3. Derle ve tablete yükle (`Run` / `Build & Run`).
4. Uygulamayı aç — ekranda tabletin kendi IP adresi görünecek, bunu not et.
5. TV'deki `Ps5Altyazi.wgt` uygulamasını aç, kumandayla bu IP'yi ve (varsayılan)
   8787 portunu gir, Bağlan'a bas.
6. Tablette "Çeviriyi Başlat"a bas, ekran kaydı izni ver.
7. PS Remote Play'i aç, oyunu oynamaya başla — altyazı göründüğünde birkaç
   saniye içinde TV'de Türkçe çevirisi belirmeli.

## Bilinen sınırlamalar / sıradaki adımlar
- Kaynak dil şu an sabit İngilizce (`TranslateLanguage.ENGLISH`). Farklı dilden
  oynuyorsan `TranslationHelper.kt` içindeki `sourceLanguage` parametresini
  değiştir, ya da MainActivity'ye bir dil seçici ekleriz.
- Altyazı bölgesi sabit oranla (`top > height * 0.72`) belirleniyor; oyuna göre
  bu oranın ayarlanması gerekebilir (bir sonraki adım: kullanıcı tarafından
  sürüklenebilir bir seçim kutusu eklemek).
- İlk derlemede ve çeviri modelinin ilk indirilmesinde internet gerekiyor;
  sonrasında model cihazda kalır, tamamen offline çalışır.
- "Orijinal altyazının üstünü kapatma" kısmı bu sürümde yok — TV uygulaması
  kendi katmanını ÜSTÜNE koyuyor ama PS5'in native altyazısını gizlemiyor.
  Bunu çözmek için ya PS5/oyun ayarlarından native altyazıyı kapatman (çoğu
  oyun destekler), ya da overlay kutusunun arka planını native altyazının
  tam üstünü örtecek şekilde boyutlandırmamız gerekiyor — bunu birlikte
  ince ayar yapmamız gereken bir adım olarak bırakıyorum.

Bir sonraki konuşmada derleme hatası alırsan tam hata mesajını yapıştır,
birlikte düzeltelim — bu normal, ilk denemede %100 hatasız derlenmesini
garanti edemem.
