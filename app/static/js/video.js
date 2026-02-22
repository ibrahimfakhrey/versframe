/* === YouTube Video Player for Live Room === */

var ytPlayer = null;
var ytReady = false;
var ytApiLoaded = false;
var pendingVideoUrl = null;

// Load YouTube IFrame API
function loadYTApi() {
    if (ytApiLoaded) return;
    ytApiLoaded = true;
    var tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    document.head.appendChild(tag);
}

// YouTube API callback
window.onYouTubeIframeAPIReady = function() {
    ytReady = true;
    if (pendingVideoUrl) {
        loadVideo(pendingVideoUrl);
        pendingVideoUrl = null;
    }
};

function extractVideoId(url) {
    if (!url) return null;
    var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

function loadVideo(url) {
    var videoId = extractVideoId(url);
    if (!videoId) return;

    loadYTApi();

    if (!ytReady) {
        pendingVideoUrl = url;
        return;
    }

    var container = document.getElementById('ytPlayerContainer');
    if (!container) return;

    // Show video pane
    var placeholder = document.getElementById('videoPlaceholder');
    if (placeholder) placeholder.style.display = 'none';
    container.style.display = 'block';

    var isTeacher = typeof IS_TEACHER !== 'undefined' && IS_TEACHER;

    // Destroy existing player
    if (ytPlayer && typeof ytPlayer.destroy === 'function') {
        try { ytPlayer.destroy(); } catch(e) {}
        ytPlayer = null;
    }

    ytPlayer = new YT.Player('ytPlayer', {
        height: '100%',
        width: '100%',
        videoId: videoId,
        playerVars: {
            autoplay: 0,
            controls: isTeacher ? 1 : 0,
            disablekb: isTeacher ? 0 : 1,
            modestbranding: 1,
            rel: 0,
            fs: 1,
        },
        events: {
            onReady: function() {
                // Show/hide student overlay
                var overlay = document.getElementById('videoStudentOverlay');
                if (overlay) {
                    overlay.style.display = isTeacher ? 'none' : 'block';
                }
            },
            onStateChange: function(event) {
                if (!isTeacher) return;
                // Teacher state changes -> emit to students
                if (event.data === YT.PlayerState.PLAYING) {
                    emitVideoPlay(window.SESSION_ID, ytPlayer.getCurrentTime());
                } else if (event.data === YT.PlayerState.PAUSED) {
                    emitVideoPause(window.SESSION_ID, ytPlayer.getCurrentTime());
                }
            }
        }
    });
}

/* --- Handlers for incoming socket events (student side) --- */

function handleVideoLoad(data) {
    var url = data.youtube_url || data.url;
    if (url) {
        loadVideo(url);
        // Switch to video tab
        if (typeof switchSubTab === 'function') switchSubTab('video');
        if (typeof switchTopTab === 'function') switchTopTab('video');
    }
}

function handleVideoPlay(data) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
    var t = data.current_time || 0;
    ytPlayer.seekTo(t, true);
    ytPlayer.playVideo();
}

function handleVideoPause(data) {
    if (!ytPlayer || typeof ytPlayer.pauseVideo !== 'function') return;
    ytPlayer.pauseVideo();
    if (data.current_time !== undefined) {
        ytPlayer.seekTo(data.current_time, true);
    }
}

function handleVideoSeek(data) {
    if (!ytPlayer || typeof ytPlayer.seekTo !== 'function') return;
    ytPlayer.seekTo(data.current_time || 0, true);
}

function handleVideoSync(data) {
    // Late joiner: load video and sync position
    var url = data.youtube_url;
    if (!url) return;

    loadVideo(url);

    // Wait for player to be ready, then sync
    var syncInterval = setInterval(function() {
        if (ytPlayer && typeof ytPlayer.seekTo === 'function') {
            clearInterval(syncInterval);
            var t = data.current_time || 0;
            ytPlayer.seekTo(t, true);
            if (data.is_playing) {
                ytPlayer.playVideo();
            } else {
                ytPlayer.pauseVideo();
            }
        }
    }, 300);

    // Switch to video tab
    if (typeof switchSubTab === 'function') switchSubTab('video');
    if (typeof switchTopTab === 'function') switchTopTab('video');
}
