/**
 * Shalaby Verse - Verses Adventure Map JS
 * Animations, node interactions, unit completion
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {

        // ── Island cards entrance animation ──────────────────────
        var islands = document.querySelectorAll('.sv-verse-island');
        islands.forEach(function(island, i) {
            island.style.animationDelay = (i * 0.12) + 's';
        });

        // ── Map nodes staggered entrance ─────────────────────────
        var nodes = document.querySelectorAll('.sv-map-node');
        if (nodes.length) {
            nodes.forEach(function(node, index) {
                node.style.opacity = '0';
                node.style.transform = 'scale(0)';
                node.style.transition = 'opacity 0.4s ease, transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

                setTimeout(function() {
                    node.style.opacity = '1';
                    node.style.transform = 'scale(1)';
                }, index * 100 + 200);
            });

            // Connector animation
            var connectors = document.querySelectorAll('.sv-map-connector');
            connectors.forEach(function(conn, index) {
                conn.style.opacity = '0';
                conn.style.transition = 'opacity 0.3s ease';
                setTimeout(function() {
                    conn.style.opacity = '1';
                }, index * 100 + 300);
            });

            // Scroll to current node
            setTimeout(function() {
                var currentNode = document.querySelector('.sv-map-node--current');
                if (currentNode) {
                    currentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, nodes.length * 100 + 600);
        }

        // ── Node click pulse ─────────────────────────────────────
        document.querySelectorAll('.sv-map-node:not(.sv-map-node--locked)').forEach(function(node) {
            node.addEventListener('click', function(e) {
                var circle = node.querySelector('.sv-map-node-circle');
                if (circle) {
                    circle.style.transform = 'scale(1.25)';
                    setTimeout(function() {
                        circle.style.transform = 'scale(1)';
                    }, 200);
                }
            });
        });

        // ── Complete Activity (from unit page) ───────────────────
        document.querySelectorAll('.sv-complete-activity-btn').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.preventDefault();
                var activityId = btn.dataset.activityId;

                btn.disabled = true;
                btn.textContent = '...';

                fetch('/student/activity/' + activityId + '/complete', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCSRFToken(),
                        'X-Requested-With': 'XMLHttpRequest',
                        'Accept': 'application/json',
                    },
                })
                .then(function(response) { return response.json(); })
                .then(function(data) {
                    // Mark as done visually
                    btn.textContent = '\u2713';
                    btn.classList.remove('btn-do');
                    btn.classList.add('btn-done');

                    if (typeof showXPPopup === 'function') {
                        showXPPopup(data.xp_earned || btn.dataset.xp || 20, '\u0646\u0634\u0627\u0637 \u0645\u0643\u062A\u0645\u0644');
                    }

                    // Update topbar stats
                    if (data.total_xp !== undefined) {
                        updateTopbar(data.total_xp, data.total_coins, data.total_gems);
                    }

                    // Check if all activities are now done
                    setTimeout(function() {
                        checkAllActivitiesDone();
                    }, 500);
                })
                .catch(function() {
                    btn.disabled = false;
                    btn.textContent = '\u0623\u0643\u0645\u0644 \u0627\u0644\u0646\u0634\u0627\u0637';
                    if (typeof showToast === 'function') {
                        showToast('\u062D\u062F\u062B \u062E\u0637\u0623\u060C \u062D\u0627\u0648\u0644 \u0645\u0631\u0629 \u0623\u062E\u0631\u0649', 'error');
                    }
                });
            });
        });

        // ── Complete Unit ────────────────────────────────────────
        var completeUnitBtn = document.getElementById('completeUnitBtn');
        if (completeUnitBtn) {
            completeUnitBtn.addEventListener('click', function(e) {
                e.preventDefault();
                var trackId = completeUnitBtn.dataset.trackId;
                var levelId = completeUnitBtn.dataset.levelId;
                var unitId = completeUnitBtn.dataset.unitId;

                completeUnitBtn.disabled = true;
                completeUnitBtn.textContent = '...';

                fetch('/student/verses/complete-unit', {
                    method: 'POST',
                    headers: {
                        'X-CSRFToken': getCSRFToken(),
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                    },
                    body: JSON.stringify({
                        track_id: trackId,
                        level_id: levelId,
                        unit_id: unitId,
                    }),
                })
                .then(function(resp) { return resp.json(); })
                .then(function(data) {
                    if (data.success) {
                        // Celebration!
                        if (typeof confetti === 'function') {
                            confetti(3000);
                        }
                        if (typeof showXPPopup === 'function') {
                            showXPPopup(data.xp_earned, '\u0648\u062D\u062F\u0629 \u0645\u0643\u062A\u0645\u0644\u0629!');
                        }
                        if (data.is_level_boundary && typeof showToast === 'function') {
                            setTimeout(function() {
                                showToast('\u0645\u0643\u0627\u0641\u0623\u0629 \u0627\u0644\u0645\u0633\u062A\u0648\u0649! +' + data.coins_earned + ' \u0639\u0645\u0644\u0627\u062A', 'success', 4000);
                            }, 1000);
                        }

                        // Update topbar stats immediately
                        if (data.total_xp !== undefined) {
                            updateTopbar(data.total_xp, data.total_coins, data.total_gems);
                        }

                        // Redirect back to adventure map after celebration
                        setTimeout(function() {
                            window.location.href = '/student/verses/' + trackId;
                        }, 2500);
                    } else {
                        completeUnitBtn.disabled = false;
                        completeUnitBtn.textContent = '\u0623\u0643\u0645\u0644 \u0627\u0644\u0648\u062D\u062F\u0629';
                        if (typeof showToast === 'function') {
                            showToast(data.error || '\u062D\u062F\u062B \u062E\u0637\u0623', 'error');
                        }
                    }
                })
                .catch(function() {
                    completeUnitBtn.disabled = false;
                    completeUnitBtn.textContent = '\u0623\u0643\u0645\u0644 \u0627\u0644\u0648\u062D\u062F\u0629';
                    if (typeof showToast === 'function') {
                        showToast('\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644', 'error');
                    }
                });
            });
        }

        // ── Update Topbar Stats ──────────────────────────────────
        function updateTopbar(xp, coins, gems) {
            // XP
            var xpEl = document.querySelector('.topbar-xp span');
            if (xpEl && xp !== undefined) xpEl.textContent = xp;

            // Coins
            var coinsEl = document.querySelector('.topbar-coins span');
            if (coinsEl && coins !== undefined) coinsEl.textContent = coins;

            // Gems
            var gemsEl = document.querySelector('.topbar-gems span');
            if (gemsEl && gems !== undefined) gemsEl.textContent = gems;

            // Sidebar XP label
            var sidebarXpSpans = document.querySelectorAll('.sidebar-xp-label span');
            if (sidebarXpSpans.length >= 2 && xp !== undefined) {
                sidebarXpSpans[1].textContent = xp + ' XP';
            }
        }

        // ── Helpers ──────────────────────────────────────────────
        function getCSRFToken() {
            var meta = document.querySelector('meta[name="csrf-token"]');
            if (meta) return meta.getAttribute('content');
            var input = document.querySelector('input[name="csrf_token"]');
            if (input) return input.value;
            return '';
        }

        function checkAllActivitiesDone() {
            var allBtns = document.querySelectorAll('.sv-unit-activity-btn');
            var allDone = true;
            allBtns.forEach(function(b) {
                if (!b.classList.contains('btn-done')) allDone = false;
            });
            var completeBtn = document.getElementById('completeUnitBtn');
            if (completeBtn && allDone) {
                completeBtn.disabled = false;
                completeBtn.innerHTML = '\uD83C\uDFC6 \u0623\u0643\u0645\u0644 \u0627\u0644\u0648\u062D\u062F\u0629';
                completeBtn.style.display = 'inline-flex';
                completeBtn.style.animation = 'adventurePulse 2s ease-in-out infinite';
            }
        }

        // ── Circular progress animation (overview page) ──────────
        document.querySelectorAll('.sv-verse-island-circle-fill').forEach(function(circle) {
            var pct = parseFloat(circle.dataset.pct || 0);
            var radius = 24;
            var circumference = 2 * Math.PI * radius;
            circle.style.strokeDasharray = circumference;
            circle.style.strokeDashoffset = circumference;

            setTimeout(function() {
                var offset = circumference - (pct / 100) * circumference;
                circle.style.strokeDashoffset = offset;
            }, 400);
        });
    });
})();
