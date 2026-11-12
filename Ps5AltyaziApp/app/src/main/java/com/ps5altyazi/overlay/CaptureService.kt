package com.ps5altyazi.overlay

import android.app.*
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.hardware.display.VirtualDisplay
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat

class CaptureService : Service() {

    companion object {
        const val EXTRA_RESULT_CODE = "result_code"
        const val EXTRA_RESULT_DATA = "result_data"
        const val EXTRA_PORT = "port"
        const val CHANNEL_ID = "ps5altyazi_capture"
        const val NOTIF_ID = 42
        const val FRAME_INTERVAL_MS = 800L

        // MainActivity bu callback'leri dinleyerek ekranı günceller
        var onStatus: ((String) -> Unit)? = null
        var onSubtitle: ((String) -> Unit)? = null
    }

    private var mediaProjection: MediaProjection? = null
    private var virtualDisplay: VirtualDisplay? = null
    private var imageReader: ImageReader? = null
    private var wsHub: WsHub? = null
    private var helper: TranslationHelper? = null
    private val handler = Handler(Looper.getMainLooper())
    private var screenWidth = 0
    private var screenHeight = 0
    private var screenDensity = 0

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val resultCode = intent?.getIntExtra(EXTRA_RESULT_CODE, Activity_RESULT_CANCELED) ?: Activity_RESULT_CANCELED
        val resultData: Intent? = intent?.getParcelableExtra(EXTRA_RESULT_DATA)
        val port = intent?.getIntExtra(EXTRA_PORT, 8787) ?: 8787

        startForeground(NOTIF_ID, buildNotification())

        if (resultData == null) {
            log("Ekran kaydı verisi alınamadı, servis durduruluyor")
            stopSelf()
            return START_NOT_STICKY
        }

        val mgr = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        mediaProjection = mgr.getMediaProjection(resultCode, resultData)

        wsHub = WsHub(port) { msg -> log(msg) }
        wsHub?.start()

        helper = TranslationHelper(
            onResult = { translated ->
                onSubtitle?.invoke(translated)
                wsHub?.broadcastText(translated)
            },
            onLog = { msg -> log(msg) }
        )

        setupVirtualDisplay()
        handler.post(frameLoop)
        log("Yakalama başladı")
        return START_STICKY
    }

    private val frameLoop = object : Runnable {
        override fun run() {
            captureFrame()
            handler.postDelayed(this, FRAME_INTERVAL_MS)
        }
    }

    private fun setupVirtualDisplay() {
        val metrics = DisplayMetrics()
        val wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(metrics)
        screenWidth = metrics.widthPixels
        screenHeight = metrics.heightPixels
        screenDensity = metrics.densityDpi

        imageReader = ImageReader.newInstance(screenWidth, screenHeight, PixelFormat.RGBA_8888, 2)

        virtualDisplay = mediaProjection?.createVirtualDisplay(
            "Ps5AltyaziCapture",
            screenWidth, screenHeight, screenDensity,
            android.hardware.display.DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
            imageReader?.surface, null, handler
        )
    }

    private fun captureFrame() {
        val reader = imageReader ?: return
        val image = try { reader.acquireLatestImage() } catch (e: Exception) { null } ?: return
        try {
            val plane = image.planes[0]
            val buffer = plane.buffer
            val pixelStride = plane.pixelStride
            val rowStride = plane.rowStride
            val rowPadding = rowStride - pixelStride * screenWidth

            val bitmap = Bitmap.createBitmap(
                screenWidth + rowPadding / pixelStride,
                screenHeight,
                Bitmap.Config.ARGB_8888
            )
            bitmap.copyPixelsFromBuffer(buffer)
            val cropped = Bitmap.createBitmap(bitmap, 0, 0, screenWidth, screenHeight)
            helper?.processFrame(cropped)
        } catch (e: Exception) {
            log("Kare okuma hatası: ${e.message}")
        } finally {
            image.close()
        }
    }

    private fun buildNotification(): Notification {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "PS5 Altyazı", NotificationManager.IMPORTANCE_LOW
            )
            (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(channel)
        }
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("PS5 Altyazı çalışıyor")
            .setContentText("Ekran okunuyor ve TV'ye çeviri gönderiliyor")
            .setSmallIcon(android.R.drawable.ic_menu_view)
            .build()
    }

    private fun log(msg: String) {
        onStatus?.invoke(msg)
    }

    override fun onDestroy() {
        handler.removeCallbacks(frameLoop)
        virtualDisplay?.release()
        imageReader?.close()
        mediaProjection?.stop()
        wsHub?.stop()
        helper?.close()
        super.onDestroy()
    }
}

// MediaProjection izni reddedilirse kıyaslamak için küçük bir sabit
private const val Activity_RESULT_CANCELED = 0
