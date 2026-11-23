# PS5 Altyazı TV

Samsung `TVWindow` API'si, seçilen HDMI girişini Tizen uygulamasının `MAIN` penceresinde `BEHIND` katmanında gösterir. Uygulama Tizen 4.0 TV profilini kullanır.

## Kullanım

1. PS5'i aç ve TV uygulamasından HDMI girişini seç. İlk bağlı giriş uygulama açılınca otomatik denenir.
2. Tablet uygulamasında **Çeviriyi Başlat** düğmesine bas. Bağlantı ekranındaki tablet IPv4 adresini ve portu TV'ye gir, ardından **Tablete bağlan** seçeneğini aç.
3. Kumandada yukarı ve aşağı ile alanlar arasında dolaş. Seçim alanında sağ ve sol ile boyutu, konumu veya görünümü değiştir. **Paneli gizle** ile oyuna dön.

Bağlantı adresi ve altyazı görünümü TV'de saklanır. Bağlantı kesilince metin hemen temizlenir, uygulama tabletle tekrar bağlantı kurmayı dener. Önceki tablet sürümlerinin `{"text":"…"}` mesajları 2 saniye görünür. Yeni sürüm, `ttlMs` ile görünme süresini belirtir ve aynı altyazı görünmeye devam ediyorsa metni yeniden göndermeden `refresh` mesajı yollar. `{"text":""}` mesajı ekranı hemen temizler.

`Ps5AltyaziTV` klasörünü Tizen Studio'da Samsung TV Web Project olarak aç. UE65NU7100'e yüklemek için TV'ye yetki veren Samsung TV geliştirici sertifikasıyla WGT paketini imzala.
