package com.ps5altyazi.overlay

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.media.projection.MediaProjectionManager
import android.os.Build
import android.os.Bundle
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import java.net.NetworkInterface
import java.util.Collections

class MainActivity : AppCompatActivity() {

    private lateinit var txtOwnIp: TextView
    private lateinit var txtStatus: TextView
    private lateinit var txtLastSubtitle: TextView
    private lateinit var edtPort: EditText
    private lateinit var btnStartStop: Button

    private lateinit var projectionManager: MediaProjectionManager
    private var running = false

    companion object {
        const val REQ_CAPTURE = 1001
        const val REQ_NOTIF = 1002
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        txtOwnIp = findViewById(R.id.txtOwnIp)
        txtStatus = findViewById(R.id.txtStatus)
        txtLastSubtitle = findViewById(R.id.txtLastSubtitle)
        edtPort = findViewById(R.id.edtPort)
        btnStartStop = findViewById(R.id.btnStartStop)

        txtOwnIp.text = "Bu tabletin IP adresi: ${localIpAddress() ?: "bulunamadı (Wi-Fi'ye bağlı mısın?)"}"

        projectionManager = getSystemService(MediaProjectionManager::class.java)

        btnStartStop.setOnClickListener {
            if (!running) startFlow() else stopCapture()
        }

        // Servisten gelen canlı durum/altyazı güncellemelerini dinle
        CaptureService.onStatus = { msg -> runOnUiThread { txtStatus.text = "Durum: $msg" } }
        CaptureService.onSubtitle = { text -> runOnUiThread { txtLastSubtitle.text = text } }
    }

    private fun startFlow() {
        if (Build.VERSION.SDK_INT >= 33 &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
            != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQ_NOTIF)
        }
        val intent = projectionManager.createScreenCaptureIntent()
        startActivityForResult(intent, REQ_CAPTURE)
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == REQ_CAPTURE && resultCode == Activity.RESULT_OK && data != null) {
            val port = edtPort.text.toString().toIntOrNull() ?: 8787
            val serviceIntent = Intent(this, CaptureService::class.java).apply {
                putExtra(CaptureService.EXTRA_RESULT_CODE, resultCode)
                putExtra(CaptureService.EXTRA_RESULT_DATA, data)
                putExtra(CaptureService.EXTRA_PORT, port)
            }
            startForegroundService(serviceIntent)
            running = true
            btnStartStop.text = "Çeviriyi Durdur"
        } else {
            txtStatus.text = "Durum: ekran kaydı izni verilmedi"
        }
    }

    private fun stopCapture() {
        stopService(Intent(this, CaptureService::class.java))
        running = false
        btnStartStop.text = "Çeviriyi Başlat"
        txtStatus.text = "Durum: durduruldu"
    }

    private fun localIpAddress(): String? {
        try {
            val interfaces = Collections.list(NetworkInterface.getNetworkInterfaces())
            for (intf in interfaces) {
                val addrs = Collections.list(intf.inetAddresses)
                for (addr in addrs) {
                    if (!addr.isLoopbackAddress && addr.hostAddress?.contains(':') == false) {
                        return addr.hostAddress
                    }
                }
            }
        } catch (e: Exception) { /* yok say */ }
        return null
    }
}
