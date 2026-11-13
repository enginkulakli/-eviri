package com.ps5altyazi.overlay

import android.graphics.Bitmap
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.util.concurrent.atomic.AtomicLong

/**
 * Altyazı şeridi bitmap'ini alır -> OCR ile metni çıkarır -> Türkçeye çevirir -> onResult ile döner.
 *
 * - Aynı metin tekrar gelirse yeniden çevrilmez.
 * - Her çeviri isteğine sıra numarası verilir; daha yeni bir istek varsa eski sonuç gösterilmez.
 *
 * processFrame'e verilen bitmap'in sahipliği bu sınıfa geçer; işlem bitince recycle edilir.
 */
class TranslationHelper(
    sourceLanguage: String = TranslateLanguage.ENGLISH,
    private val onResult: (String) -> Unit,
    private val onLog: (String) -> Unit
) {
    private val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

    private val translatorOptions = TranslatorOptions.Builder()
        .setSourceLanguage(sourceLanguage)
        .setTargetLanguage(TranslateLanguage.TURKISH)
        .build()
    private val translator = Translation.getClient(translatorOptions)

    // ML Kit dinleyicileri ana thread'de çalışır; bu alanlar yalnızca orada değiştirilir
    private var lastRawText: String = ""
    private var modelReady = false

    // Çeviri isteği sıra numarası; eski isteklerin sonucu bu sayıyla eşleşmezse atılır
    private val requestSeq = AtomicLong(0)

    init {
        // Çeviri modelini bir kere indir (ilk kullanımda internet ister, sonra cihazda kalır)
        translator.downloadModelIfNeeded()
            .addOnSuccessListener { modelReady = true; onLog("Çeviri modeli hazır") }
            .addOnFailureListener { onLog("Çeviri modeli indirilemedi: ${it.message}") }
    }

    fun processFrame(bitmap: Bitmap) {
        val image = InputImage.fromBitmap(bitmap, 0)
        recognizer.process(image)
            .addOnSuccessListener { visionText ->
                // Bitmap zaten yalnızca altyazı şeridi; tüm metin bloklarını birleştir
                val subtitleText = visionText.textBlocks
                    .joinToString(" ") { it.text }
                    .trim()

                if (subtitleText.isEmpty()) {
                    if (lastRawText.isNotEmpty()) {
                        lastRawText = ""
                        requestSeq.incrementAndGet() // devam eden çeviriler artık geçersiz
                        onResult("") // ekrandaki altyazıyı temizle
                    }
                    return@addOnSuccessListener
                }

                if (subtitleText == lastRawText) return@addOnSuccessListener // değişmemiş, atla

                if (!modelReady) {
                    onLog("Çeviri modeli henüz hazır değil, bekleniyor")
                    return@addOnSuccessListener
                }

                lastRawText = subtitleText
                val seq = requestSeq.incrementAndGet()

                translator.translate(subtitleText)
                    .addOnSuccessListener { translated ->
                        // Bu sırada daha yeni bir istek başladıysa eski sonucu gösterme
                        if (seq == requestSeq.get()) onResult(translated)
                    }
                    .addOnFailureListener { onLog("Çeviri hatası: ${it.message}") }
            }
            .addOnFailureListener { onLog("OCR hatası: ${it.message}") }
            .addOnCompleteListener { bitmap.recycle() }
    }

    fun close() {
        recognizer.close()
        translator.close()
    }
}
