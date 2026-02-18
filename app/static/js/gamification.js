/* === Shalaby Verse - Gamification Animations === */
/* Galaxy theme: purple (#640D5F), orange (#EB5B00) */
/* RTL Arabic-first */

(function () {
    'use strict';

    // ── Inject keyframes & styles once ──────────────────────────────────
    const _style = document.createElement('style');
    _style.textContent = `
        /* XP Popup */
        @keyframes xpRise {
            0%   { opacity: 1; transform: translateY(0) scale(1); }
            60%  { opacity: 1; transform: translateY(-60px) scale(1.15); }
            100% { opacity: 0; transform: translateY(-120px) scale(0.9); }
        }
        .xp-popup {
            position: fixed;
            z-index: 10000;
            pointer-events: none;
            font-family: 'Tajawal', sans-serif;
            font-weight: 800;
            font-size: 1.5rem;
            color: #EB5B00;
            text-shadow: 0 0 12px rgba(235, 91, 0, 0.5), 0 2px 4px rgba(0,0,0,0.3);
            animation: xpRise 1.6s ease-out forwards;
        }

        /* Badge unlock */
        @keyframes badgeZoomIn {
            0%   { transform: scale(0) rotate(-20deg); opacity: 0; }
            60%  { transform: scale(1.2) rotate(5deg); opacity: 1; }
            100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }
        @keyframes badgeOverlayIn {
            0%   { opacity: 0; }
            100% { opacity: 1; }
        }
        .badge-unlock-overlay {
            position: fixed; inset: 0;
            background: rgba(0, 0, 0, 0.75);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
            animation: badgeOverlayIn 0.3s ease forwards;
        }
        .badge-unlock-content {
            text-align: center;
            direction: rtl;
        }
        .badge-unlock-icon {
            width: 130px; height: 130px;
            background: linear-gradient(135deg, #640D5F, #EB5B00);
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 3.5rem;
            margin: 0 auto 20px;
            box-shadow: 0 0 50px rgba(235, 91, 0, 0.5), 0 0 100px rgba(100, 13, 95, 0.3);
            animation: badgeZoomIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }
        .badge-unlock-title {
            color: #FFD700;
            font-size: 1.8rem;
            font-weight: 800;
            margin-bottom: 8px;
        }
        .badge-unlock-name {
            color: rgba(255, 255, 255, 0.8);
            font-size: 1.2rem;
            margin-bottom: 24px;
        }

        /* Level Up */
        @keyframes levelPulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 40px rgba(100, 13, 95, 0.5); }
            50%      { transform: scale(1.08); box-shadow: 0 0 80px rgba(235, 91, 0, 0.7); }
        }
        @keyframes starTwinkle {
            0%, 100% { opacity: 0.3; transform: scale(0.8); }
            50%      { opacity: 1; transform: scale(1.2); }
        }
        .levelup-overlay {
            position: fixed; inset: 0;
            background: radial-gradient(ellipse at center, rgba(100, 13, 95, 0.9) 0%, rgba(0, 0, 0, 0.95) 100%);
            display: flex; align-items: center; justify-content: center;
            z-index: 10000;
            animation: badgeOverlayIn 0.4s ease forwards;
        }
        .levelup-content {
            text-align: center;
            direction: rtl;
            position: relative;
        }
        .levelup-stars {
            position: absolute; inset: -80px;
            pointer-events: none;
        }
        .levelup-star {
            position: absolute;
            font-size: 1.5rem;
            animation: starTwinkle 1.5s ease-in-out infinite;
        }
        .levelup-number {
            width: 120px; height: 120px;
            background: linear-gradient(135deg, #640D5F, #EB5B00);
            border-radius: 24px;
            display: flex; align-items: center; justify-content: center;
            color: white;
            font-size: 3rem;
            font-weight: 800;
            margin: 20px auto;
            animation: levelPulse 2s ease-in-out infinite;
        }
        .levelup-heading {
            color: #EB5B00;
            font-size: 2.5rem;
            font-weight: 800;
            margin-bottom: 8px;
        }
        .levelup-title {
            color: white;
            font-size: 1.4rem;
            margin-bottom: 8px;
        }
        .levelup-sub {
            color: rgba(255, 255, 255, 0.5);
            margin-bottom: 24px;
        }

        /* XP Bar animation */
        .xp-fill-animated {
            transition: width 1.2s cubic-bezier(0.4, 0, 0.2, 1);
            background: linear-gradient(90deg, #640D5F, #EB5B00) !important;
        }

        /* Streak flame pulse */
        @keyframes streakPulse {
            0%, 100% { transform: scale(1); }
            25%      { transform: scale(1.3); }
            50%      { transform: scale(1.1); }
            75%      { transform: scale(1.25); }
        }
        .streak-flame-animated {
            animation: streakPulse 0.8s ease-in-out;
        }

        /* Confetti */
        @keyframes confettiFall {
            0%   { transform: translateY(0) rotate(0deg); opacity: 1; }
            100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes confettiSway {
            0%   { transform: translateY(0) translateX(0) rotate(0deg); opacity: 1; }
            25%  { transform: translateY(25vh) translateX(15px) rotate(180deg); opacity: 1; }
            50%  { transform: translateY(50vh) translateX(-10px) rotate(360deg); opacity: 0.8; }
            75%  { transform: translateY(75vh) translateX(20px) rotate(540deg); opacity: 0.4; }
            100% { transform: translateY(100vh) translateX(5px) rotate(720deg); opacity: 0; }
        }

        /* Toast container & toasts */
        .toast-container {
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 10001;
            display: flex;
            flex-direction: column;
            gap: 8px;
            pointer-events: none;
            direction: rtl;
        }
        .toast {
            padding: 12px 24px;
            border-radius: 12px;
            font-family: 'Tajawal', sans-serif;
            font-weight: 600;
            font-size: 0.95rem;
            color: white;
            pointer-events: auto;
            box-shadow: 0 4px 20px rgba(0,0,0,0.2);
            transition: opacity 0.3s, transform 0.3s;
            max-width: 400px;
            text-align: center;
        }
        .toast-success { background: #00B894; }
        .toast-error   { background: #E74C3C; }
        .toast-info    { background: #3498DB; }
        .toast-warning { background: #EB5B00; }
    `;
    document.head.appendChild(_style);

    // ── showXPPopup ─────────────────────────────────────────────────────
    // Floating "+50 XP!" popup that rises and fades
    window.showXPPopup = function (amount, reason) {
        var popup = document.createElement('div');
        popup.className = 'xp-popup';
        popup.innerHTML = '<div style="font-size:2rem;">+' + amount + ' XP!</div>'
            + (reason ? '<div style="font-size:0.85rem;opacity:0.8;margin-top:2px;">' + reason + '</div>' : '');
        // Position at center top area
        popup.style.left = '50%';
        popup.style.top = '40%';
        popup.style.transform = 'translateX(-50%)';
        document.body.appendChild(popup);
        setTimeout(function () { popup.remove(); }, 1700);
    };

    // ── showBadgeUnlock ─────────────────────────────────────────────────
    // Celebration modal with confetti + badge zoom-in
    window.showBadgeUnlock = function (badgeName, badgeIcon) {
        var overlay = document.createElement('div');
        overlay.className = 'badge-unlock-overlay';
        overlay.innerHTML =
            '<div class="badge-unlock-content">' +
                '<div class="badge-unlock-icon">' + (badgeIcon || '\uD83C\uDFC5') + '</div>' +
                '<div class="badge-unlock-title">\u0634\u0627\u0631\u0629 \u062C\u062F\u064A\u062F\u0629!</div>' +
                '<div class="badge-unlock-name">' + badgeName + '</div>' +
                '<button class="btn btn-orange" style="margin-top:8px;min-width:120px;">\u0631\u0627\u0626\u0639!</button>' +
            '</div>';

        document.body.appendChild(overlay);

        // Launch confetti behind the badge
        confetti(2500);

        // Close handlers
        overlay.querySelector('button').addEventListener('click', function () {
            overlay.remove();
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
    };

    // ── showLevelUp ─────────────────────────────────────────────────────
    // Full-screen level-up celebration with stars
    window.showLevelUp = function (newLevel, title) {
        var overlay = document.createElement('div');
        overlay.className = 'levelup-overlay';

        // Generate random stars
        var starsHTML = '<div class="levelup-stars">';
        var starPositions = [
            { top: '5%', left: '15%', delay: '0s' },
            { top: '10%', left: '75%', delay: '0.3s' },
            { top: '25%', left: '90%', delay: '0.7s' },
            { top: '60%', left: '5%', delay: '0.2s' },
            { top: '70%', left: '85%', delay: '0.5s' },
            { top: '80%', left: '25%', delay: '0.9s' },
            { top: '15%', left: '50%', delay: '1.1s' },
            { top: '90%', left: '60%', delay: '0.4s' },
            { top: '45%', left: '10%', delay: '0.6s' },
            { top: '35%', left: '80%', delay: '0.8s' },
        ];
        for (var i = 0; i < starPositions.length; i++) {
            var sp = starPositions[i];
            starsHTML += '<div class="levelup-star" style="top:' + sp.top + ';left:' + sp.left + ';animation-delay:' + sp.delay + ';">\u2B50</div>';
        }
        starsHTML += '</div>';

        overlay.innerHTML =
            '<div class="levelup-content">' +
                starsHTML +
                '<div style="font-size:4rem;margin-bottom:12px;">\uD83D\uDE80</div>' +
                '<div class="levelup-heading">\u0645\u0633\u062A\u0648\u0649 \u062C\u062F\u064A\u062F!</div>' +
                '<div class="levelup-number">' + newLevel + '</div>' +
                '<div class="levelup-title">' + (title || '') + '</div>' +
                '<div class="levelup-sub">\u0648\u0627\u0635\u0644 \u0627\u0644\u062A\u0642\u062F\u0645!</div>' +
                '<button class="btn btn-primary btn-lg" style="margin-top:16px;min-width:140px;">\u064A\u0644\u0627 \u0646\u0643\u0645\u0644!</button>' +
            '</div>';

        document.body.appendChild(overlay);

        // Launch confetti
        confetti(3000);

        overlay.querySelector('button').addEventListener('click', function () {
            overlay.remove();
        });
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) overlay.remove();
        });
    };

    // ── animateXPBar ────────────────────────────────────────────────────
    // Smooth XP bar fill animation (purple-to-orange gradient)
    window.animateXPBar = function (current, max) {
        var fills = document.querySelectorAll('.xp-fill, .sidebar-xp-fill');
        var pct = max > 0 ? Math.min((current / max) * 100, 100) : 0;
        fills.forEach(function (fill) {
            fill.classList.add('xp-fill-animated');
            fill.style.width = '0%';
            // Trigger reflow, then set target width
            void fill.offsetHeight;
            requestAnimationFrame(function () {
                fill.style.width = pct + '%';
            });
        });
    };

    // ── animateCounter ──────────────────────────────────────────────────
    // Count-up animation for stat numbers
    window.animateCounter = function (elementId, target) {
        var el;
        if (typeof elementId === 'string') {
            el = document.getElementById(elementId);
        } else {
            // Allow passing an element directly (used by dashboard.js)
            el = elementId;
        }
        if (!el) return;

        var targetNum = typeof target === 'number' ? target : parseInt(target, 10);
        if (isNaN(targetNum) || targetNum === 0) {
            el.textContent = '0';
            return;
        }

        var duration = 1200;
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            // Ease out cubic
            var eased = 1 - Math.pow(1 - progress, 3);
            var currentVal = Math.round(eased * targetNum);
            el.textContent = currentVal.toLocaleString('ar-EG');
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }

        requestAnimationFrame(step);
    };

    // ── showStreakFlame ──────────────────────────────────────────────────
    // Pulse animation on streak counter
    window.showStreakFlame = function (days) {
        var flame = document.querySelector('.streak-flame');
        if (!flame) return;

        // Update count display if there is a sibling
        var countEl = flame.parentElement && flame.parentElement.querySelector('[style*="font-weight:800"]');
        if (countEl && days !== undefined) {
            countEl.textContent = days;
        }

        flame.classList.remove('streak-flame-animated');
        void flame.offsetHeight; // reflow
        flame.classList.add('streak-flame-animated');

        // Remove class after animation
        setTimeout(function () {
            flame.classList.remove('streak-flame-animated');
        }, 900);
    };

    // ── confetti ─────────────────────────────────────────────────────────
    // Simple confetti effect using CSS animations (no library)
    window.confetti = function (duration) {
        var dur = duration || 2000;
        var colors = ['#640D5F', '#EB5B00', '#FFD700', '#00B894', '#6C5CE7', '#FD79A8', '#FDCB6E'];
        var count = 60;

        for (var i = 0; i < count; i++) {
            var piece = document.createElement('div');
            var size = 4 + Math.random() * 8;
            var leftPos = Math.random() * 100;
            var fallDuration = 1.5 + Math.random() * 2;
            var delay = Math.random() * 0.8;
            var color = colors[Math.floor(Math.random() * colors.length)];
            var shape = Math.random() > 0.5 ? '50%' : '2px';

            piece.style.cssText =
                'position:fixed;top:-12px;' +
                'left:' + leftPos + '%;' +
                'width:' + size + 'px;' +
                'height:' + size + 'px;' +
                'background:' + color + ';' +
                'border-radius:' + shape + ';' +
                'z-index:10002;' +
                'pointer-events:none;' +
                'animation:confettiSway ' + fallDuration + 's ease ' + delay + 's forwards;' +
                'opacity:0;animation-fill-mode:forwards;';

            document.body.appendChild(piece);

            // Remove piece after its animation
            (function (p, d, dl) {
                setTimeout(function () { p.remove(); }, (d + dl) * 1000 + 500);
            })(piece, fallDuration, delay);
        }
    };

    // ── showToast (global) ──────────────────────────────────────────────
    // Toast notification: success=green, error=red, info=blue, warning=orange
    // Note: This supplements the showToast in app.js. If app.js showToast exists
    // we defer to it; otherwise we define our own.
    if (typeof window.showToast !== 'function') {
        window.showToast = function (message, type, duration) {
            type = type || 'info';
            duration = duration || 3000;

            var container = document.getElementById('toastContainer');
            if (!container) {
                container = document.createElement('div');
                container.id = 'toastContainer';
                container.className = 'toast-container';
                document.body.appendChild(container);
            }

            var toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            container.appendChild(toast);

            setTimeout(function () {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-10px)';
                setTimeout(function () { toast.remove(); }, 300);
            }, duration);
        };
    }

})();
