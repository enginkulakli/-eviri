package com.ps5altyazi.overlay

import android.graphics.Bitmap
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.TranslatorOptions
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions

/**
 * Bir kareyi alır -> OCR ile metni çıkarır -> Türkçeye çevirir -> callback ile döner.
 * Aynı metin art arda geldiğinde gereksiz çeviri/gönderim yapmaz (debounce).
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

    private var lastRawText: String = ""
    private var modelReady = false

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
                // Sadece görüntünün alt kısmındaki (altyazı bölgesi) metinleri al
                val height = bitmap.height
                val subtitleLines = visionText.textBlocks
                    .filter { it.boundingBox != null && it.boundingBox!!.top > height * 0.72 }
                    .joinToString(" ") { it.text }
                    .trim()

                if (subtitleLines.isEmpty()) {
                    if (lastRawText.isNotEmpty()) {
                        lastRawText = ""
                        onResult("") // ekrandaki altyazıyı temizle
                    }
                    return@addOnSuccessListener
                }

                if (subtitleLines == lastRawText) return@addOnSuccessListener // değişmemiş, atla
                lastRawText = subtitleLines

                if (!modelReady) {
                    onLog("Çeviri modeli henüz hazır değil, bekleniyor")
                    return@addOnSuccessListener
                }

                translator.translate(subtitleLines)
                    .addOnSuccessListener { translated -> onResult(translated) }
                    .addOnFailureListener { onLog("Çeviri hatası: ${it.message}") }
            }
            .addOnFailureListener { onLog("OCR hatası: ${it.message}") }
    }

    fun close() {
        recognizer.close()
        translator.close()
    }
}
