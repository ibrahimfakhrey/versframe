/* === Shalaby Verse - Shared Dashboard Utilities === */
/* RTL Arabic-first | Galaxy theme */

(function () {
    'use strict';

    // ── CSRF token helper (fallback if app.js not loaded) ───────────────
    function _getCsrf() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.content;
        var input = document.querySelector('input[name="csrf_token"]');
        if (input) return input.value;
        return '';
    }

    // ── initDashboard ───────────────────────────────────────────────────
    // Auto-calls animateCounter for every element with [data-count-to] or [data-count]
    window.initDashboard = function () {
        // Support both data-count-to and data-count (used in admin dashboard)
        var selectors = document.querySelectorAll('[data-count-to], [data-count]');
        selectors.forEach(function (el) {
            var target = parseInt(el.dataset.countTo || el.dataset.count, 10);
            if (!isNaN(target) && target > 0) {
                animateCounter(el, target);
            }
        });

        // Animate progress bars
        document.querySelectorAll('[data-progress]').forEach(function (bar) {
            var target = parseFloat(bar.dataset.progress);
            setTimeout(function () {
                bar.style.width = Math.min(target, 100) + '%';
            }, 300);
        });

        // Init XP bar if values available
        var xpFill = document.querySelector('.xp-fill');
        if (xpFill && xpFill.style.width) {
            var pct = parseFloat(xpFill.style.width);
            if (!isNaN(pct)) {
                xpFill.style.width = '0%';
                setTimeout(function () {
                    xpFill.style.transition = 'width 1.2s cubic-bezier(0.4,0,0.2,1)';
                    xpFill.style.width = pct + '%';
                }, 100);
            }
        }

        // Init sidebar XP bar
        var sidebarFill = document.querySelector('.sidebar-xp-fill');
        if (sidebarFill && sidebarFill.style.width) {
            var spct = parseFloat(sidebarFill.style.width);
            if (!isNaN(spct)) {
                sidebarFill.style.width = '0%';
                setTimeout(function () {
                    sidebarFill.style.transition = 'width 1s cubic-bezier(0.4,0,0.2,1)';
                    sidebarFill.style.width = spct + '%';
                }, 200);
            }
        }

        // Init other modules
        initScrollAnimations();
        initNotificationBell();
    };

    // ── initCharts ──────────────────────────────────────────────────────
    // Placeholder chart rendering using CSS bar charts (no chart library)
    window.initCharts = function () {
        var chartContainers = document.querySelectorAll('[data-chart]');
        chartContainers.forEach(function (container) {
            var type = container.dataset.chart; // 'bar', 'horizontal-bar'
            var labelsAttr = container.dataset.labels;
            var valuesAttr = container.dataset.values;
            var colorsAttr = container.dataset.colors;

            if (!labelsAttr || !valuesAttr) return;

            var labels = labelsAttr.split(',');
            var values = valuesAttr.split(',').map(Number);
            var colors = colorsAttr ? colorsAttr.split(',') : null;
            var maxVal = Math.max.apply(null, values) || 1;

            container.innerHTML = '';
            container.style.cssText = 'display:flex;align-items:flex-end;gap:8px;height:200px;padding:12px 0;direction:rtl;';

            if (type === 'horizontal-bar') {
                container.style.cssText = 'display:flex;flex-direction:column;gap:8px;padding:12px 0;direction:rtl;';
            }

            for (var i = 0; i < labels.length; i++) {
                var barColor = colors && colors[i] ? colors[i].trim() : (i % 2 === 0 ? '#640D5F' : '#EB5B00');
                var pct = (values[i] / maxVal) * 100;

                if (type === 'horizontal-bar') {
                    var row = document.createElement('div');
                    row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                    row.innerHTML =
                        '<span style="min-width:60px;font-size:0.8rem;text-align:right;color:var(--text-secondary);">' + labels[i].trim() + '</span>' +
                        '<div style="flex:1;height:24px;background:var(--bg-secondary);border-radius:6px;overflow:hidden;">' +
                            '<div style="height:100%;width:0%;background:' + barColor + ';border-radius:6px;transition:width 0.8s ease ' + (i * 0.1) + 's;" data-bar-target="' + pct + '"></div>' +
                        '</div>' +
                        '<span style="min-width:30px;font-size:0.8rem;font-weight:700;color:var(--text-primary);">' + values[i] + '</span>';
                    container.appendChild(row);
                } else {
                    // Vertical bar
                    var col = document.createElement('div');
                    col.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;height:100%;justify-content:flex-end;';
                    col.innerHTML =
                        '<span style="font-size:0.75rem;font-weight:700;color:var(--text-primary);">' + values[i] + '</span>' +
                        '<div style="width:100%;max-width:40px;background:' + barColor + ';border-radius:6px 6px 0 0;height:0%;transition:height 0.8s ease ' + (i * 0.1) + 's;" data-bar-target="' + pct + '"></div>' +
                        '<span style="font-size:0.7rem;color:var(--text-secondary);white-space:nowrap;">' + labels[i].trim() + '</span>';
                    container.appendChild(col);
                }
            }

            // Animate bars after render
            requestAnimationFrame(function () {
                container.querySelectorAll('[data-bar-target]').forEach(function (bar) {
                    var targetPct = bar.dataset.barTarget;
                    if (type === 'horizontal-bar') {
                        bar.style.width = targetPct + '%';
                    } else {
                        bar.style.height = targetPct + '%';
                    }
                });
            });
        });
    };

    // ── initScrollAnimations ────────────────────────────────────────────
    // Fade-in cards on scroll using IntersectionObserver
    window.initScrollAnimations = function () {
        // Add initial opacity to animatable elements
        var animStyle = document.createElement('style');
        animStyle.textContent = [
            '.scroll-animate { opacity: 0; transform: translateY(20px); transition: opacity 0.5s ease, transform 0.5s ease; }',
            '.scroll-animate.visible { opacity: 1; transform: translateY(0); }',
            '.card, .stat-card, .mission-card, .badge-item { opacity: 0; transform: translateY(16px); transition: opacity 0.4s ease, transform 0.4s ease; }',
            '.card.visible, .stat-card.visible, .mission-card.visible, .badge-item.visible { opacity: 1; transform: translateY(0); }'
        ].join('\n');
        document.head.appendChild(animStyle);

        if (!('IntersectionObserver' in window)) {
            // Fallback: show everything immediately
            document.querySelectorAll('.card, .stat-card, .mission-card, .badge-item, .scroll-animate').forEach(function (el) {
                el.classList.add('visible');
            });
            return;
        }

        var observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (entry.isIntersecting) {
                    entry.target.classList.add('visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.08, rootMargin: '0px 0px -30px 0px' });

        // Stagger animation delays for stat cards
        var statCards = document.querySelectorAll('.stats-grid .stat-card');
        statCards.forEach(function (card, idx) {
            card.style.transitionDelay = (idx * 0.08) + 's';
        });

        // Observe all animatable elements
        document.querySelectorAll('.card, .stat-card, .mission-card, .badge-item, .scroll-animate').forEach(function (el) {
            observer.observe(el);
        });
    };

    // ── formatNumber ────────────────────────────────────────────────────
    // Arabic numeral formatting
    window.formatNumber = function (n) {
        if (n === null || n === undefined) return '';
        return Number(n).toLocaleString('ar-EG');
    };

    // ── formatDate ──────────────────────────────────────────────────────
    // Arabic date formatting
    window.formatDate = function (dateStr) {
        if (!dateStr) return '';
        var d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        var months = [
            '\u064A\u0646\u0627\u064A\u0631', '\u0641\u0628\u0631\u0627\u064A\u0631', '\u0645\u0627\u0631\u0633',
            '\u0623\u0628\u0631\u064A\u0644', '\u0645\u0627\u064A\u0648', '\u064A\u0648\u0646\u064A\u0648',
            '\u064A\u0648\u0644\u064A\u0648', '\u0623\u063A\u0633\u0637\u0633', '\u0633\u0628\u062A\u0645\u0628\u0631',
            '\u0623\u0643\u062A\u0648\u0628\u0631', '\u0646\u0648\u0641\u0645\u0628\u0631', '\u062F\u064A\u0633\u0645\u0628\u0631'
        ];
        var day = d.getDate();
        var month = months[d.getMonth()];
        var year = d.getFullYear();
        var hours = d.getHours();
        var mins = d.getMinutes().toString().padStart(2, '0');
        var period = hours >= 12 ? '\u0645' : '\u0635';
        var h12 = hours % 12 || 12;
        return day + ' ' + month + ' ' + year + ' - ' + h12 + ':' + mins + ' ' + period;
    };

    // ── toggleSidebar ───────────────────────────────────────────────────
    // Mobile sidebar toggle
    window.toggleSidebar = function () {
        var sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('open');
        }
    };

    // ── initNotificationBell ────────────────────────────────────────────
    // Notification dropdown toggle, mark as read via fetch
    window.initNotificationBell = function () {
        var bell = document.getElementById('notifBell');
        if (!bell) return;

        // Create dropdown if not exists
        var dropdown = document.getElementById('notifDropdown');
        if (!dropdown) {
            dropdown = document.createElement('div');
            dropdown.id = 'notifDropdown';
            dropdown.style.cssText = [
                'position:absolute;top:100%;left:0;',
                'width:340px;max-height:400px;overflow-y:auto;',
                'background:var(--bg-card,#fff);border-radius:12px;',
                'box-shadow:0 8px 32px rgba(0,0,0,0.15);',
                'z-index:1000;display:none;direction:rtl;',
                'border:1px solid var(--border-light,#eee);'
            ].join('');
            bell.style.position = 'relative';
            bell.appendChild(dropdown);
        }

        // Toggle on click
        bell.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = dropdown.style.display === 'block';
            if (isOpen) {
                dropdown.style.display = 'none';
                return;
            }
            dropdown.style.display = 'block';
            _loadNotifications(dropdown);
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (!bell.contains(e.target)) {
                dropdown.style.display = 'none';
            }
        });

        // Initial count load
        _updateNotifCount();
    };

    function _updateNotifCount() {
        var fetchFn = window.apiFetch || _simpleFetch;
        fetchFn('/api/notifications').then(function (data) {
            var countEl = document.getElementById('notifCount');
            if (!countEl) return;
            if (data.unread > 0) {
                countEl.textContent = data.unread;
                countEl.style.display = 'flex';
            } else {
                countEl.style.display = 'none';
            }
        }).catch(function () {});
    }

    function _loadNotifications(dropdown) {
        var fetchFn = window.apiFetch || _simpleFetch;
        dropdown.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-secondary);">\u062C\u0627\u0631\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644...</div>';

        fetchFn('/api/notifications').then(function (data) {
            if (!data.notifications || data.notifications.length === 0) {
                dropdown.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary);">\u0644\u0627 \u062A\u0648\u062C\u062F \u0625\u0634\u0639\u0627\u0631\u0627\u062A</div>';
                return;
            }

            var header = '<div style="padding:12px 16px;border-bottom:1px solid var(--border-light,#eee);display:flex;justify-content:space-between;align-items:center;">' +
                '<span style="font-weight:700;">\u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A</span>' +
                (data.unread > 0 ? '<button onclick="markAllNotificationsRead()" style="background:none;border:none;color:var(--sv-purple,#640D5F);cursor:pointer;font-size:0.85rem;font-family:inherit;">\u0642\u0631\u0627\u0621\u0629 \u0627\u0644\u0643\u0644</button>' : '') +
                '</div>';

            var items = '';
            data.notifications.forEach(function (n) {
                var bg = n.is_read ? '' : 'background:var(--sv-purple-glow,rgba(100,13,95,0.05));';
                items += '<div style="padding:12px 16px;border-bottom:1px solid var(--border-light,#eee);cursor:pointer;' + bg + '" ' +
                    'onclick="markNotificationAsRead(' + n.id + ',this)">' +
                    '<div style="font-weight:' + (n.is_read ? '400' : '700') + ';font-size:0.9rem;margin-bottom:2px;">' + (n.title || '') + '</div>' +
                    '<div style="font-size:0.8rem;color:var(--text-secondary);">' + (n.message || '') + '</div>' +
                    '<div style="font-size:0.7rem;color:var(--text-muted);margin-top:4px;">' + (n.created_at ? window.formatDate(n.created_at) : '') + '</div>' +
                    '</div>';
            });

            dropdown.innerHTML = header + items;
        }).catch(function () {
            dropdown.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-secondary);">\u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062A\u062D\u0645\u064A\u0644</div>';
        });
    }

    // Mark single notification as read
    window.markNotificationAsRead = function (notifId, el) {
        var fetchFn = window.apiFetch || _simpleFetch;
        fetchFn('/api/notifications/' + notifId + '/read', {
            method: 'POST',
            body: JSON.stringify({}),
        }).then(function () {
            if (el) {
                el.style.background = '';
                el.querySelector('div').style.fontWeight = '400';
            }
            _updateNotifCount();
        }).catch(function () {});
    };

    // Mark all notifications as read
    window.markAllNotificationsRead = function () {
        var fetchFn = window.apiFetch || _simpleFetch;
        fetchFn('/api/notifications/read', {
            method: 'POST',
            body: JSON.stringify({}),
        }).then(function () {
            _updateNotifCount();
            var dropdown = document.getElementById('notifDropdown');
            if (dropdown && dropdown.style.display === 'block') {
                _loadNotifications(dropdown);
            }
            if (typeof showToast === 'function') {
                showToast('\u062A\u0645 \u0642\u0631\u0627\u0621\u0629 \u062C\u0645\u064A\u0639 \u0627\u0644\u0625\u0634\u0639\u0627\u0631\u0627\u062A', 'success');
            }
        }).catch(function () {});
    };

    // Simple fetch fallback if apiFetch not available
    function _simpleFetch(url, options) {
        var defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': _getCsrf(),
            },
        };
        var config = Object.assign({}, defaults, options || {});
        if (options && options.headers) {
            config.headers = Object.assign({}, defaults.headers, options.headers);
        }
        return fetch(url, config).then(function (res) {
            var ct = res.headers.get('content-type') || '';
            if (!ct.includes('application/json')) {
                return Promise.reject(new Error('Not JSON'));
            }
            return res.json();
        });
    }

    // ── DOMContentLoaded - Auto-init ────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        initDashboard();
        initCharts();

        // Sidebar mobile close on link click
        document.querySelectorAll('.sidebar-nav-item, .sidebar-link').forEach(function (item) {
            item.addEventListener('click', function () {
                if (window.innerWidth <= 768) {
                    var sidebar = document.querySelector('.sidebar');
                    if (sidebar) sidebar.classList.remove('open');
                }
            });
        });
    });

})();
