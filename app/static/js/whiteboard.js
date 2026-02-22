/* === Whiteboard (WBO Collaboration via iframe) === */

/**
 * Teacher clicks "Start Whiteboard" button.
 * POSTs to server, which generates a WBO board URL,
 * stores it for late joiners, and broadcasts to all via SocketIO.
 */
function startWhiteboard() {
    var btn = document.getElementById('whiteboardStartBtn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'جاري التشغيل...';
    }

    var csrfMeta = document.querySelector('meta[name="csrf-token"]');
    var headers = { 'Content-Type': 'application/json' };
    if (csrfMeta) headers['X-CSRFToken'] = csrfMeta.content;

    fetch('/room/' + SESSION_ID + '/start-whiteboard', {
        method: 'POST',
        headers: headers,
        body: '{}',
    })
    .then(function(resp) { return resp.json(); })
    .then(function(data) {
        if (data.ok && data.url) {
            loadWhiteboard(data.url);
            // Broadcast to students via SocketIO
            if (typeof socket !== 'undefined' && socket && socketConnected) {
                socket.emit('whiteboard_started', { session_id: SESSION_ID, url: data.url });
            }
        } else {
            if (typeof showToast === 'function') showToast(data.error || 'خطأ في تشغيل السبورة', 'error');
            if (btn) { btn.disabled = false; btn.textContent = 'تشغيل السبورة'; }
        }
    })
    .catch(function(err) {
        console.error('Whiteboard start error:', err);
        if (typeof showToast === 'function') showToast('خطأ في الاتصال', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'تشغيل السبورة'; }
    });
}

/**
 * Loads WBO collaborative whiteboard into the pane via iframe.
 * Both teacher and student get the same interactive board.
 */
function loadWhiteboard(url) {
    var pane = document.getElementById('pane-whiteboard');
    if (!pane) return;

    pane.innerHTML = '<iframe id="whiteboardFrame" class="whiteboard-frame" src="' + url + '" ' +
            'allow="clipboard-read; clipboard-write" ' +
            'frameborder="0" allowfullscreen></iframe>';

    // Switch to whiteboard tab
    if (typeof switchSubTab === 'function') switchSubTab('whiteboard');

    if (typeof showToast === 'function') {
        showToast('تم تشغيل السبورة التفاعلية', 'success');
    }
}

/**
 * Called by SocketIO when teacher starts whiteboard or for late-joiner sync.
 */
function handleWhiteboardStart(data) {
    if (data && data.url) {
        loadWhiteboard(data.url);
    }
}
