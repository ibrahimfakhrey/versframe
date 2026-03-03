/* ══════════════════════════════════════════════════════════════
   Shalaby Verse — Premium Effects Engine
   canvas-confetti · tsParticles · GSAP · SweetAlert2
   ══════════════════════════════════════════════════════════════ */

(function() {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // 1. tsParticles — Interactive Hero Sparkles
    // ═══════════════════════════════════════════════════════════
    function initHeroParticles() {
        var hero = document.querySelector('.sv2-hero');
        if (!hero || typeof tsParticles === 'undefined') return;

        // Create container inside hero
        var container = document.createElement('div');
        container.id = 'sv2-hero-particles';
        container.style.cssText = 'position:absolute;inset:0;z-index:0;pointer-events:none;';
        hero.style.position = 'relative';
        hero.insertBefore(container, hero.firstChild);

        tsParticles.load('sv2-hero-particles', {
            fullScreen: false,
            fpsLimit: 60,
            particles: {
                number: { value: 35, density: { enable: true, area: 600 } },
                color: { value: ['#FFD700', '#ff9a2f', '#ffffff', '#ff4fc7', '#8a46ff'] },
                shape: { type: ['circle', 'star'] },
                opacity: {
                    value: { min: 0.3, max: 0.8 },
                    animation: { enable: true, speed: 1.2, minimumValue: 0.2, sync: false }
                },
                size: {
                    value: { min: 1, max: 4 },
                    animation: { enable: true, speed: 2, minimumValue: 0.5, sync: false }
                },
                move: {
                    enable: true,
                    speed: { min: 0.3, max: 1.2 },
                    direction: 'top',
                    random: true,
                    straight: false,
                    outModes: { default: 'out', top: 'out', bottom: 'out' }
                },
                twinkle: {
                    particles: { enable: true, frequency: 0.08, color: '#FFD700' }
                }
            },
            interactivity: {
                detectsOn: 'window',
                events: {
                    onHover: { enable: true, mode: 'bubble' },
                    resize: true
                },
                modes: {
                    bubble: { distance: 150, size: 6, duration: 0.4, opacity: 1 }
                }
            },
            detectRetina: true
        });
    }

    // ═══════════════════════════════════════════════════════════
    // 2. GSAP — Scroll-Triggered Animations
    // ═══════════════════════════════════════════════════════════
    function initGSAP() {
        if (typeof gsap === 'undefined') return;

        gsap.registerPlugin(ScrollTrigger);

        // Hero entrance (override CSS animation)
        var hero = document.querySelector('.sv2-hero');
        if (hero) {
            hero.style.animation = 'none';
            gsap.from(hero, {
                y: 40, opacity: 0, scale: 0.95,
                duration: 0.8,
                ease: 'back.out(1.7)',
                clearProps: 'all'
            });
        }

        // Topbar slide down
        var topbar = document.querySelector('.sv2-topbar');
        if (topbar) {
            topbar.style.animation = 'none';
            gsap.from(topbar, {
                y: -30, opacity: 0,
                duration: 0.5,
                delay: 0.1,
                ease: 'power3.out',
                clearProps: 'all'
            });
        }

        // Universe cards — staggered entrance
        var ucards = document.querySelectorAll('.sv2-ucard');
        if (ucards.length) {
            ucards.forEach(function(c) { c.style.animation = 'none'; });
            gsap.from(ucards, {
                y: 50, opacity: 0, scale: 0.9,
                duration: 0.6,
                stagger: 0.12,
                delay: 0.3,
                ease: 'back.out(1.4)',
                clearProps: 'transform,opacity'
            });
        }

        // Universes section
        var universes = document.querySelector('.sv2-universes');
        if (universes) {
            universes.style.animation = 'none';
        }

        // Lower panels — scroll-triggered
        var panels = document.querySelectorAll('.sv2-lower .sv2-panel');
        if (panels.length) {
            panels.forEach(function(p) { p.style.animation = 'none'; });
            gsap.from(panels, {
                scrollTrigger: {
                    trigger: '.sv2-lower',
                    start: 'top 85%',
                    toggleActions: 'play none none none'
                },
                y: 60, opacity: 0, scale: 0.92,
                duration: 0.7,
                stagger: 0.15,
                ease: 'back.out(1.3)',
                clearProps: 'transform,opacity'
            });
        }

        // GSAP count-up for stats (replace the vanilla JS version)
        document.querySelectorAll('[data-countup]').forEach(function(el) {
            var target = parseInt(el.getAttribute('data-countup'), 10) || 0;
            if (target === 0) { el.textContent = '0'; return; }
            var obj = { val: 0 };
            gsap.to(obj, {
                val: target,
                duration: 1.5,
                delay: 0.5,
                ease: 'power2.out',
                onUpdate: function() {
                    el.textContent = Math.floor(obj.val);
                }
            });
        });

        // Focus items — subtle reveal
        var focusItems = document.querySelectorAll('.sv2-focus-item');
        focusItems.forEach(function(item) {
            gsap.from(item, {
                scrollTrigger: {
                    trigger: item,
                    start: 'top 90%',
                    toggleActions: 'play none none none'
                },
                x: -30, opacity: 0,
                duration: 0.5,
                ease: 'power3.out',
                clearProps: 'all'
            });
        });

        // Task rows — staggered slide
        var tasks = document.querySelectorAll('.sv2-task');
        if (tasks.length) {
            gsap.from(tasks, {
                scrollTrigger: {
                    trigger: '.sv2-task-list, .sv2-task',
                    start: 'top 90%',
                    toggleActions: 'play none none none'
                },
                x: -20, opacity: 0,
                duration: 0.4,
                stagger: 0.1,
                ease: 'power2.out',
                clearProps: 'all'
            });
        }
    }

    // ═══════════════════════════════════════════════════════════
    // 3. canvas-confetti — Celebration Functions
    // ═══════════════════════════════════════════════════════════
    window.SV2 = window.SV2 || {};

    // Standard confetti burst
    SV2.celebrate = function() {
        if (typeof confetti === 'undefined') return;
        // Burst from both sides
        confetti({
            particleCount: 80,
            spread: 70,
            origin: { x: 0.25, y: 0.6 },
            colors: ['#FFD700', '#ff9a2f', '#640D5F', '#ff4fc7', '#8a46ff', '#ffffff']
        });
        confetti({
            particleCount: 80,
            spread: 70,
            origin: { x: 0.75, y: 0.6 },
            colors: ['#FFD700', '#ff9a2f', '#640D5F', '#ff4fc7', '#8a46ff', '#ffffff']
        });
    };

    // Big firework celebration (for level up, badge earned)
    SV2.fireworks = function() {
        if (typeof confetti === 'undefined') return;
        var duration = 2000;
        var end = Date.now() + duration;
        var colors = ['#FFD700', '#ff9a2f', '#640D5F', '#ff4fc7', '#8a46ff'];

        (function frame() {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: colors
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: colors
            });
            if (Date.now() < end) requestAnimationFrame(frame);
        })();
    };

    // Star shower (for quest complete)
    SV2.starShower = function() {
        if (typeof confetti === 'undefined') return;
        confetti({
            particleCount: 50,
            spread: 100,
            shapes: ['star'],
            colors: ['#FFD700', '#FFA500'],
            origin: { y: 0.3 },
            scalar: 1.2,
            gravity: 0.8
        });
    };

    // ═══════════════════════════════════════════════════════════
    // 4. SweetAlert2 — Themed Achievement Popups
    // ═══════════════════════════════════════════════════════════
    var swalTheme = {
        background: 'linear-gradient(135deg, #1a0a2e 0%, #2d0a3e 50%, #640D5F 100%)',
        color: '#fff',
        confirmButtonColor: '#EB5B00',
        iconColor: '#FFD700',
        showClass: { popup: 'animate__animated animate__zoomIn' },
        hideClass: { popup: 'animate__animated animate__zoomOut' },
        customClass: {
            popup: 'sv2-swal-popup',
            title: 'sv2-swal-title',
            confirmButton: 'sv2-swal-btn'
        }
    };

    // Achievement unlocked popup
    SV2.achievementPopup = function(opts) {
        if (typeof Swal === 'undefined') return;
        opts = opts || {};
        SV2.celebrate();
        Swal.fire(Object.assign({}, swalTheme, {
            title: opts.title || '🏆 إنجاز جديد!',
            html: '<div style="font-size:3rem;margin:0.5rem 0;">' + (opts.icon || '⭐') + '</div>' +
                  '<div style="font-size:1.1rem;font-weight:700;color:#FFD700;margin-bottom:0.5rem;">' + (opts.name || '') + '</div>' +
                  '<div style="font-size:0.85rem;color:rgba(255,255,255,0.7);">' + (opts.description || '') + '</div>',
            confirmButtonText: opts.buttonText || 'رائع! 🎉',
            timer: opts.timer || null,
            timerProgressBar: !!opts.timer
        }));
    };

    // Level up popup
    SV2.levelUpPopup = function(level, title) {
        if (typeof Swal === 'undefined') return;
        SV2.fireworks();
        Swal.fire(Object.assign({}, swalTheme, {
            title: '🚀 ارتقيت للمستوى ' + level + '!',
            html: '<div style="font-size:4rem;margin:0.5rem 0;">🎖️</div>' +
                  '<div style="font-size:1.2rem;font-weight:800;color:#FFD700;">' + (title || '') + '</div>' +
                  '<div style="font-size:0.85rem;color:rgba(255,255,255,0.7);margin-top:0.5rem;">استمر في التقدم!</div>',
            confirmButtonText: 'يلا نكمل! 💪'
        }));
    };

    // XP earned toast
    SV2.xpToast = function(amount, reason) {
        if (typeof Swal === 'undefined') return;
        Swal.fire({
            toast: true,
            position: 'top-end',
            icon: 'success',
            title: '+' + amount + ' XP',
            text: reason || '',
            showConfirmButton: false,
            timer: 2500,
            timerProgressBar: true,
            background: '#1a0a2e',
            color: '#FFD700',
            iconColor: '#38d39f',
            customClass: { popup: 'sv2-swal-toast' }
        });
    };

    // Coins earned toast
    SV2.coinsToast = function(amount) {
        if (typeof Swal === 'undefined') return;
        Swal.fire({
            toast: true,
            position: 'top-end',
            title: '🪙 +' + amount + ' عملات',
            showConfirmButton: false,
            timer: 2000,
            timerProgressBar: true,
            background: '#1a0a2e',
            color: '#FFD700',
            customClass: { popup: 'sv2-swal-toast' }
        });
    };

    // Daily reward claimed
    SV2.dailyRewardPopup = function(day, rewardText) {
        if (typeof Swal === 'undefined') return;
        SV2.starShower();
        Swal.fire(Object.assign({}, swalTheme, {
            title: '🎁 مكافأة اليوم ' + day,
            html: '<div style="font-size:3.5rem;margin:0.5rem 0;">🎁</div>' +
                  '<div style="font-size:1rem;font-weight:700;color:#FFD700;">' + (rewardText || 'حصلت على مكافأتك!') + '</div>',
            confirmButtonText: 'شكراً! ✨',
            timer: 4000,
            timerProgressBar: true
        }));
    };

    // Quest completed
    SV2.questCompletePopup = function(questName, xp, coins) {
        if (typeof Swal === 'undefined') return;
        SV2.celebrate();
        Swal.fire(Object.assign({}, swalTheme, {
            title: '⚔️ مهمة مكتملة!',
            html: '<div style="font-size:3rem;margin:0.5rem 0;">🏅</div>' +
                  '<div style="font-size:1.1rem;font-weight:700;color:#FFD700;margin-bottom:0.75rem;">' + (questName || '') + '</div>' +
                  '<div style="display:flex;gap:1rem;justify-content:center;">' +
                  (xp ? '<div style="background:rgba(255,255,255,0.1);padding:0.5rem 1rem;border-radius:12px;"><span style="color:#38d39f;font-weight:900;">+' + xp + '</span> XP</div>' : '') +
                  (coins ? '<div style="background:rgba(255,255,255,0.1);padding:0.5rem 1rem;border-radius:12px;">🪙 <span style="font-weight:900;">+' + coins + '</span></div>' : '') +
                  '</div>',
            confirmButtonText: 'ممتاز! 🌟'
        }));
    };

    // ═══════════════════════════════════════════════════════════
    // 5. Welcome Celebration (first visit after onboarding)
    // ═══════════════════════════════════════════════════════════
    function checkWelcomeCelebration() {
        // Check for flash messages that indicate celebration-worthy events
        var flashMessages = document.querySelectorAll('.alert-success, [data-flash="success"]');
        flashMessages.forEach(function(msg) {
            var text = msg.textContent || '';
            if (text.indexOf('شلبي فيرس') !== -1 && text.indexOf('مرحباً') !== -1) {
                // Welcome after onboarding
                setTimeout(function() { SV2.fireworks(); }, 500);
            }
            if (text.indexOf('أكملت المهمة') !== -1) {
                setTimeout(function() { SV2.starShower(); }, 300);
            }
            if (text.indexOf('مكافأة') !== -1) {
                setTimeout(function() { SV2.celebrate(); }, 300);
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    // INIT — Run everything when DOM is ready
    // ═══════════════════════════════════════════════════════════
    function init() {
        initHeroParticles();
        initGSAP();
        checkWelcomeCelebration();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
