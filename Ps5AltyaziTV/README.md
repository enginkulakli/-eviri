# PS5 Altyazı TV

Samsung `TVWindow` API'si, seçilen HDMI girişini Tizen uygulamasının `MAIN` penceresinde `BEHIND` katmanında gösterir. Uygulama Tizen 4.0 TV profilini kullanır.

## Kullanım

1. PS5'i aç ve TV uygulamasından HDMI girişini seç. İlk bağlı giriş uygulama açılınca otomatik denenir.
2. Tablet uygulamasında **Çeviriyi Başlat** düğmesine bas. Bağlantı ekranındaki tablet IPv4 adresini ve portu TV'ye gir, ardından **Tablete bağlan** seçeneğini aç.
3. Kumandada yukarı ve aşağı ile alanlar arasında dolaş. Seçim alanında sağ ve sol ile boyutu, konumu veya görünümü değiştir. **Paneli gizle** ile oyuna dön.

Bağlantı adresi ve altyazı görünümü TV'de saklanır. Bağlantı kesilince metin hemen temizlenir, uygulama tabletle tekrar bağlantı kurmayı dener. Önceki tablet sürümlerinin `{"text":"…"}` mesajları 2 saniye görünür. Yeni sürüm, `ttlMs` ile görünme süresini belirtir ve aynı altyazı görünmeye devam ediyorsa metni yeniden göndermeden `refresh` mesajı yollar. `{"text":""}` mesajı ekranı hemen temizler.

`Ps5AltyaziTV` klasörünü Tizen Studio'da Samsung TV Web Project olarak aç. UE65NU7100'e yüklemek için TV'ye yetki veren Samsung TV geliştirici sertifikasıyla WGT paketini imzala.

## Tam ekran çeviri

Tablet ayarlarında **Tam ekran çeviri** seçildiğinde V2 TV, birden çok konumlu çeviri kutusu gösterir. **Altyazı boyutu** ve **Altyazı görünümü** her iki modda kullanılır. **Tam ekran hizalama** varsayılan olarak Remote Play kare oranını korur. HDMI görüntüsü TV alanına gerilerek gösteriliyorsa **HDMI alanını doldur** seçeneğini kullan. Oyun, PS5 veya TV kaynaklı görüntü kırpma ve overscan için cihazda hizalamayı doğrula.

TV bağlantıda önce altyazı protokolü 2, sonra konumlu çeviri protokolü 3 bildirimini yollar. Böylece önceki Android sürümü mevcut `text`, `ttlMs` ve `refresh` mesajlarını kullanmaya devam eder. Yeni tablet, `overlay` anlık görüntülerini yalnızca sürüm 3 istemcilerine yollar. Her kutunun kararlı kimliği, normalize edilmiş konumu ve bağımsız yaşam süresi vardır. Boş liste, bağlantı kapanması ve uygulamanın gizlenmesi kutuları temizler.
