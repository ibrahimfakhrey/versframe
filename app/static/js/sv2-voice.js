/* ============================================================
   Shalaby Verse — Arabic Voice Encouragement System
   Plays pre-generated MP3s with Web Speech API fallback
   ============================================================ */

var SV2 = window.SV2 || {};

SV2.voice = (function() {
    'use strict';

    var STORAGE_KEY = 'sv2_sound_enabled';
    var FIRST_VISIT_KEY = 'sv2_voice_seen';
    var audio = null;
    var currentPageKey = '';

    /* Arabic messages for Web Speech API fallback */
    var FALLBACK_MESSAGES = {
        onboarding_step1: 'أهلاً وسهلاً بك يا بطل! مرحباً بك في شلبي فيرس! رحلة ممتعة بانتظارك!',
        onboarding_step2: 'يلا نصمم شخصيتك! اختر الشكل اللي يعجبك!',
        onboarding_step3: 'ممتاز! اختر الأسلوب اللي يناسبك في التعلم!',
        onboarding_step4: 'حلو! حدثنا عن نفسك، نحن نحب نتعرف عليك!',
        onboarding_step5: 'آخر خطوة! اختر عالمك الأول وابدأ المغامرة!',
        dashboard: 'أهلاً بك من جديد يا بطل! يومك مليء بالمغامرات!',
        profile: 'ملفك الشخصي رائع! أنت نجم متألق!',
        activities: 'يلا نبدأ الأنشطة! كل نشاط يقربك من النجاح!',
        library: 'مرحباً بك في المكتبة! المعرفة كنز وأنت المستكشف!',
        rewards: 'مبروك! حان وقت جمع المكافآت!',
        quests: 'مهمات جديدة بانتظارك! هل أنت جاهز للتحدي؟',
        timetable: 'جدولك جاهز! نظم وقتك وكن بطلاً منظماً!',
        verses_map: 'خريطة العوالم أمامك! استكشف وتعلم وامرح!',
        progress: 'أنت تتقدم بشكل رائع! استمر يا بطل!',
        leaderboard: 'هل أنت مستعد لتتصدر القائمة؟ نافس أصدقاءك!',
        sessions: 'حان وقت التعلم! استعد للحصة!',
        homework: 'واجباتك هنا! حان وقت التألق والإبداع!'
    };

    /* ── State ── */
    function isEnabled() {
        var val = localStorage.getItem(STORAGE_KEY);
        if (val === null) return true; /* Default ON for first visit */
        return val === '1';
    }

    function setEnabled(val) {
        localStorage.setItem(STORAGE_KEY, val ? '1' : '0');
        updateButtonState();
    }

    /* ── Audio Playback ── */
    function playMp3(pageKey) {
        stop();
        var src = '/static/audio/tts/' + pageKey + '.mp3';
        audio = new Audio(src);
        audio.volume = 0.85;

        audio.addEventListener('error', function() {
            /* MP3 not found — try Web Speech API */
            playWebSpeech(pageKey);
        });

        audio.play().catch(function() {
            /* Autoplay blocked — silently fail */
        });
    }

    function playWebSpeech(pageKey) {
        if (!('speechSynthesis' in window)) return;
        var text = FALLBACK_MESSAGES[pageKey];
        if (!text) return;

        window.speechSynthesis.cancel();
        var utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ar';
        utterance.rate = 0.9;
        utterance.pitch = 1.1;

        /* Try to find an Arabic voice */
        var voices = window.speechSynthesis.getVoices();
        for (var i = 0; i < voices.length; i++) {
            if (voices[i].lang && voices[i].lang.indexOf('ar') === 0) {
                utterance.voice = voices[i];
                break;
            }
        }

        window.speechSynthesis.speak(utterance);
    }

    /* ── Public API ── */
    function play(pageKey) {
        if (!pageKey || !isEnabled()) return;
        currentPageKey = pageKey;
        playMp3(pageKey);
    }

    function stop() {
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
            audio = null;
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    function toggle() {
        var newState = !isEnabled();
        setEnabled(newState);

        if (newState) {
            /* Turning on — play current page message */
            var key = getPageKey();
            if (key) play(key);
        } else {
            stop();
        }

        return newState;
    }

    function playOnboardingStep(stepNum) {
        if (!isEnabled()) return;
        var key = 'onboarding_step' + stepNum;
        play(key);
    }

    /* ── Page Key Detection ── */
    function getPageKey() {
        /* From body data attribute */
        var bodyKey = document.body.getAttribute('data-sv2-page');
        if (bodyKey) return bodyKey;

        /* From hidden element */
        var el = document.getElementById('sv2PageData');
        if (el) return el.getAttribute('data-page-key') || '';

        return '';
    }

    /* ── Floating Button ── */
    function createButton() {
        /* Don't create if already exists */
        if (document.getElementById('sv2VoiceToggle')) return;

        var btn = document.createElement('button');
        btn.id = 'sv2VoiceToggle';
        btn.className = 'sv2-voice-btn' + (isEnabled() ? ' active' : '');
        btn.setAttribute('aria-label', 'تشغيل/إيقاف الصوت');
        btn.setAttribute('title', 'الصوت التشجيعي');
        btn.innerHTML =
            '<svg class="sv2-voice-icon-on" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
                '<path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>' +
                '<path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>' +
            '</svg>' +
            '<svg class="sv2-voice-icon-off" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>' +
                '<line x1="23" y1="9" x2="17" y2="15"/>' +
                '<line x1="17" y1="9" x2="23" y2="15"/>' +
            '</svg>';

        btn.addEventListener('click', function() {
            var newState = toggle();
            btn.classList.toggle('active', newState);
        });

        document.body.appendChild(btn);

        /* First-time bounce hint */
        if (!localStorage.getItem(FIRST_VISIT_KEY)) {
            btn.classList.add('sv2-voice-hint');
            localStorage.setItem(FIRST_VISIT_KEY, '1');
            setTimeout(function() {
                btn.classList.remove('sv2-voice-hint');
            }, 4000);
        }
    }

    function updateButtonState() {
        var btn = document.getElementById('sv2VoiceToggle');
        if (btn) {
            btn.classList.toggle('active', isEnabled());
        }
    }

    /* ── Init ── */
    function init() {
        createButton();

        /* Load voices for Web Speech API (some browsers need this) */
        if ('speechSynthesis' in window) {
            window.speechSynthesis.getVoices();
            window.speechSynthesis.onvoiceschanged = function() {
                window.speechSynthesis.getVoices();
            };
        }

        /* Auto-play on page load if enabled */
        if (isEnabled()) {
            var key = getPageKey();
            if (key) {
                setTimeout(function() {
                    play(key);
                }, 800);
            }
        }
    }

    /* Run on DOM ready */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    /* Public interface */
    return {
        play: play,
        stop: stop,
        toggle: toggle,
        playOnboardingStep: playOnboardingStep,
        isEnabled: isEnabled
    };
})();

/* ============================================================
   Background Music — Loops across pages, low volume
   ============================================================ */

SV2.music = (function() {
    'use strict';

    var STORAGE_KEY = 'sv2_music_enabled';
    var bgAudio = null;

    function isEnabled() {
        var val = localStorage.getItem(STORAGE_KEY);
        if (val === null) return true; /* Default ON for first visit */
        return val === '1';
    }

    function setEnabled(val) {
        localStorage.setItem(STORAGE_KEY, val ? '1' : '0');
        updateButtonState();
    }

    function start() {
        if (bgAudio) return; /* Already playing */
        bgAudio = new Audio('/static/audio/bg-music.mp3');
        bgAudio.loop = true;
        bgAudio.volume = 0.12; /* Low background volume */
        bgAudio.play().catch(function() {
            /* Autoplay blocked — will start on next user click */
        });
    }

    function stopMusic() {
        if (bgAudio) {
            bgAudio.pause();
            bgAudio.currentTime = 0;
            bgAudio = null;
        }
    }

    function toggle() {
        var newState = !isEnabled();
        setEnabled(newState);
        if (newState) {
            start();
        } else {
            stopMusic();
        }
        return newState;
    }

    function updateButtonState() {
        var btn = document.getElementById('sv2MusicToggle');
        if (btn) {
            btn.classList.toggle('active', isEnabled());
        }
    }

    function createButton() {
        if (document.getElementById('sv2MusicToggle')) return;

        var btn = document.createElement('button');
        btn.id = 'sv2MusicToggle';
        btn.className = 'sv2-music-btn' + (isEnabled() ? ' active' : '');
        btn.setAttribute('aria-label', 'تشغيل/إيقاف الموسيقى');
        btn.setAttribute('title', 'موسيقى الخلفية');
        btn.innerHTML =
            '<svg class="sv2-music-icon-on" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M9 18V5l12-2v13"/>' +
                '<circle cx="6" cy="18" r="3"/>' +
                '<circle cx="18" cy="16" r="3"/>' +
            '</svg>' +
            '<svg class="sv2-music-icon-off" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M9 18V5l12-2v13"/>' +
                '<circle cx="6" cy="18" r="3"/>' +
                '<circle cx="18" cy="16" r="3"/>' +
                '<line x1="1" y1="1" x2="23" y2="23" stroke-width="2.5"/>' +
            '</svg>';

        btn.addEventListener('click', function() {
            var newState = toggle();
            btn.classList.toggle('active', newState);
        });

        document.body.appendChild(btn);
    }

    function init() {
        createButton();
        if (isEnabled()) {
            start();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return {
        toggle: toggle,
        start: start,
        stop: stopMusic,
        isEnabled: isEnabled
    };
})();

window.SV2 = SV2;
