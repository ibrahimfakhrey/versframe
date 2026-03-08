/**
 * Shalaby Verse - Verses Adventure Map JS
 * Animations, node interactions, unit completion, game map coins
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {

        // ── Island cards entrance animation ──────────────────────
        var islands = document.querySelectorAll('.sv-verse-island');
        islands.forEach(function(island, i) {
            island.style.animationDelay = (i * 0.12) + 's';
        });

        // ── Old Map nodes staggered entrance ─────────────────────
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

            var connectors = document.querySelectorAll('.sv-map-connector');
            connectors.forEach(function(conn, index) {
                conn.style.opacity = '0';
                conn.style.transition = 'opacity 0.3s ease';
                setTimeout(function() {
                    conn.style.opacity = '1';
                }, index * 100 + 300);
            });

            setTimeout(function() {
                var currentNode = document.querySelector('.sv-map-node--current');
                if (currentNode) {
                    currentNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, nodes.length * 100 + 600);
        }

        // ── Node click pulse ─────────────────────────────────────
        document.querySelectorAll('.sv-map-node:not(.sv-map-node--locked)').forEach(function(node) {
            node.addEventListener('click', function() {
                var circle = node.querySelector('.sv-map-node-circle');
                if (circle) {
                    circle.style.transform = 'scale(1.25)';
                    setTimeout(function() {
                        circle.style.transform = 'scale(1)';
                    }, 200);
                }
            });
        });

        // ══════════════════════════════════════════════════════════
        // GAME MAP — dynamic coin positioning + interactions
        // ══════════════════════════════════════════════════════════

        var gameCoins = document.querySelectorAll('.gv-coin:not(.gv-coin--treasure)');
        var treasureCoin = document.querySelector('.gv-coin--treasure');

        if (gameCoins.length > 0) {
            positionCoinsOnPath(gameCoins, treasureCoin);
        }

        /**
         * Position coins along the golden road in bg-map.webp.
         * Uses hand-traced waypoints that follow the actual painted path,
         * then distributes coins evenly along the polyline.
         */
        function positionCoinsOnPath(coins, treasure) {
            var count = coins.length;

            // Waypoints tracing the golden road in bg-map.webp from bottom to top.
            // Measured as {x: left%, y: top%} on the background image.
            // The road starts bottom-left, curves right, then S-winds upward.
            var waypoints = [
                {x: 28, y: 83},   // road start — bottom-left near chests
                {x: 35, y: 78},   // curving up-right
                {x: 44, y: 73},   // right along lower platform
                {x: 50, y: 67},   // continuing right-up
                {x: 54, y: 61},   // right edge of first S-bend
                {x: 48, y: 55},   // bending back left
                {x: 40, y: 50},   // left side
                {x: 32, y: 44},   // far left — second S-bend peak
                {x: 28, y: 38},   // curving up
                {x: 34, y: 32},   // turning right
                {x: 42, y: 27},   // heading right
                {x: 50, y: 22},   // right side upper area
                {x: 55, y: 17},   // near-top right
                {x: 50, y: 12},   // top area, bending left
                {x: 44, y: 8},    // path end — near top-center
            ];

            // Compute cumulative distances along the polyline
            var segLengths = [];
            var totalLength = 0;
            for (var s = 1; s < waypoints.length; s++) {
                var dx = waypoints[s].x - waypoints[s-1].x;
                var dy = waypoints[s].y - waypoints[s-1].y;
                var len = Math.sqrt(dx*dx + dy*dy);
                segLengths.push(len);
                totalLength += len;
            }

            // Place each coin at equal arc-length intervals along the path
            for (var i = 0; i < count; i++) {
                var targetDist = count > 1 ? (i / (count - 1)) * totalLength : 0;
                var walked = 0;
                var px, py;

                // Walk along segments to find the point
                var placed = false;
                for (var seg = 0; seg < segLengths.length; seg++) {
                    if (walked + segLengths[seg] >= targetDist || seg === segLengths.length - 1) {
                        var frac = segLengths[seg] > 0 ? (targetDist - walked) / segLengths[seg] : 0;
                        frac = Math.max(0, Math.min(1, frac));
                        px = waypoints[seg].x + frac * (waypoints[seg+1].x - waypoints[seg].x);
                        py = waypoints[seg].y + frac * (waypoints[seg+1].y - waypoints[seg].y);
                        placed = true;
                        break;
                    }
                    walked += segLengths[seg];
                }
                if (!placed) {
                    px = waypoints[waypoints.length-1].x;
                    py = waypoints[waypoints.length-1].y;
                }

                coins[i].style.left = px.toFixed(1) + '%';
                coins[i].style.top = py.toFixed(1) + '%';
            }

            // Position treasure just past the last waypoint
            if (treasure) {
                var last = waypoints[waypoints.length - 1];
                treasure.style.left = (last.x - 6) + '%';
                treasure.style.top = Math.max(last.y - 6, 3) + '%';
            }

            // Entrance animation AFTER positioning
            coins.forEach(function(coin, i) {
                coin.style.opacity = '0';
                var finalLeft = coin.style.left;
                var finalTop = coin.style.top;
                // Start slightly below and invisible
                coin.style.transform = 'translate(-50%,-50%) scale(0.5)';
                setTimeout(function() {
                    coin.style.transition = 'opacity .4s ease, transform .4s cubic-bezier(.34,1.56,.64,1)';
                    coin.style.opacity = '1';
                    coin.style.transform = 'translate(-50%,-50%) scale(1)';
                }, 100 + i * 80);
            });

            if (treasure) {
                treasure.style.opacity = '0';
                treasure.style.transform = 'translate(-50%,-50%) scale(0.5)';
                setTimeout(function() {
                    treasure.style.transition = 'opacity .5s ease, transform .5s cubic-bezier(.34,1.56,.64,1)';
                    treasure.style.opacity = '1';
                    treasure.style.transform = 'translate(-50%,-50%) scale(1)';
                }, 100 + count * 80 + 100);
            }

            // Scroll to current coin
            setTimeout(function() {
                var currentCoin = document.querySelector('.gv-coin--current');
                if (currentCoin) {
                    currentCoin.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            }, 200 + count * 80 + 400);
        }

        // ── Modal logic ──────────────────────────────────────────
        var modal = document.getElementById('levelModal');
        var modalImg = document.getElementById('modalCoinImg');
        var modalTitle = document.getElementById('modalTitle');
        var modalSub = document.getElementById('modalSub');
        var modalStartBtn = document.getElementById('modalStartBtn');
        var modalCloseBtn = document.getElementById('modalCloseBtn');

        function openCoinModal(coin) {
            if (!modal) return;
            var status = coin.dataset.status;
            if (status === 'locked') return;

            var unitName = coin.dataset.unitName || '';
            var unitId = coin.dataset.unitId || '';
            var levelId = coin.dataset.levelId || '';
            var trackId = coin.dataset.trackId || '';
            var idx = coin.dataset.index || '1';

            var coinImg = coin.querySelector('img');
            if (coinImg && modalImg) {
                modalImg.src = coinImg.src;
                modalImg.alt = unitName;
            }

            if (modalTitle) modalTitle.textContent = unitName;

            if (modalSub) {
                if (status === 'completed') {
                    modalSub.textContent = '\u0623\u0643\u0645\u0644\u062A \u0647\u0630\u0647 \u0627\u0644\u0648\u062D\u062F\u0629 \u0628\u0646\u062C\u0627\u062D!';
                } else {
                    modalSub.textContent = '\u0627\u0644\u0648\u062D\u062F\u0629 ' + idx + ' \u2014 \u0627\u0636\u063A\u0637 \u0627\u0628\u062F\u0623 \u0644\u0644\u062F\u062E\u0648\u0644';
                }
            }

            if (modalStartBtn) {
                modalStartBtn.href = '/student/verses/' + trackId + '/' + levelId + '/' + unitId;
                if (status === 'completed') {
                    modalStartBtn.textContent = '\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0648\u062D\u062F\u0629';
                } else {
                    modalStartBtn.textContent = '\u0627\u0628\u062F\u0623 \u0627\u0644\u0648\u062D\u062F\u0629';
                }
            }

            modal.classList.add('show');
        }

        // Attach click to game map coins
        gameCoins.forEach(function(coin) {
            coin.addEventListener('click', function() { openCoinModal(coin); });
            coin.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCoinModal(coin);
                }
            });
        });

        // Close modal
        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', function() {
                modal.classList.remove('show');
            });
        }
        if (modal) {
            modal.addEventListener('click', function(e) {
                if (e.target === modal) modal.classList.remove('show');
            });
        }
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && modal) modal.classList.remove('show');
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
                    btn.textContent = '\u2713';
                    btn.classList.remove('btn-do');
                    btn.classList.add('btn-done');

                    if (typeof showXPPopup === 'function') {
                        showXPPopup(data.xp_earned || btn.dataset.xp || 20, '\u0646\u0634\u0627\u0637 \u0645\u0643\u062A\u0645\u0644');
                    }

                    if (data.total_xp !== undefined) {
                        updateTopbar(data.total_xp, data.total_coins, data.total_gems);
                    }

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

                        if (data.total_xp !== undefined) {
                            updateTopbar(data.total_xp, data.total_coins, data.total_gems);
                        }

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
            var xpEl = document.querySelector('.topbar-xp span');
            if (xpEl && xp !== undefined) xpEl.textContent = xp;
            var coinsEl = document.querySelector('.topbar-coins span');
            if (coinsEl && coins !== undefined) coinsEl.textContent = coins;
            var gemsEl = document.querySelector('.topbar-gems span');
            if (gemsEl && gems !== undefined) gemsEl.textContent = gems;
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
