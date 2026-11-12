package com.ps5altyazi.overlay

import org.java_websocket.WebSocket
import org.java_websocket.handshake.ClientHandshake
import org.java_websocket.server.WebSocketServer
import java.net.InetSocketAddress
import org.json.JSONObject

/**
 * TV tarafı (Ps5Altyazi.wgt) buraya ws://<tablet-ip>:<port> ile bağlanıyor.
 * Biz sadece broadcastText() ile her yeni çeviriyi JSON olarak yayınlıyoruz:
 *   {"text": "..."}
 */
class WsHub(port: Int, private val onLog: (String) -> Unit) : WebSocketServer(InetSocketAddress(port)) {

    override fun onOpen(conn: WebSocket, handshake: ClientHandshake) {
        onLog("TV bağlandı: ${conn.remoteSocketAddress}")
    }

    override fun onClose(conn: WebSocket, code: Int, reason: String, remote: Boolean) {
        onLog("TV bağlantısı koptu")
    }

    override fun onMessage(conn: WebSocket, message: String) {
        // TV'den şu an için bir mesaj beklemiyoruz; ileride "hazır/bağlandı" gibi
        // bir onay mesajı eklenirse burada işlenebilir.
    }

    override fun onError(conn: WebSocket?, ex: Exception) {
        onLog("WebSocket hatası: ${ex.message}")
    }

    override fun onStart() {
        onLog("Sunucu dinlemede, port: ${this.port}")
    }

    fun broadcastText(text: String) {
        val json = JSONObject().put("text", text).toString()
        try {
            connections.forEach { it.send(json) }
        } catch (e: Exception) {
            onLog("Gönderim hatası: ${e.message}")
        }
    }
}
