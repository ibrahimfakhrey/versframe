/* === Shalaby Verse - Admin Dashboard JS === */
/* RTL Arabic-first | Galaxy theme */
/* All CRUD uses fetch() with CSRF token from meta tag */

(function () {
    'use strict';

    // ── CSRF Helper ─────────────────────────────────────────────────────
    function getCsrf() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        if (meta) return meta.content;
        var input = document.querySelector('input[name="csrf_token"]');
        if (input) return input.value;
        return '';
    }

    // ── API helper ──────────────────────────────────────────────────────
    function adminFetch(url, options) {
        // Use global apiFetch if available (from app.js), otherwise inline
        if (typeof window.apiFetch === 'function') {
            return window.apiFetch(url, options);
        }
        var defaults = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCsrf(),
            },
        };
        var config = Object.assign({}, defaults, options || {});
        if (options && options.headers) {
            config.headers = Object.assign({}, defaults.headers, options.headers);
        }
        return fetch(url, config).then(function (res) {
            return res.json().then(function (data) {
                if (!res.ok) throw new Error(data.error || '\u062D\u062F\u062B \u062E\u0637\u0623');
                return data;
            });
        });
    }

    // ── deleteUser ──────────────────────────────────────────────────────
    // Confirmation dialog then DELETE /api/admin/users/<id>
    window.deleteUser = function (userId) {
        if (!confirm('\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645\u061F \u0644\u0627 \u064A\u0645\u0643\u0646 \u0627\u0644\u062A\u0631\u0627\u062C\u0639 \u0639\u0646 \u0647\u0630\u0627 \u0627\u0644\u0625\u062C\u0631\u0627\u0621.')) return;
        adminFetch('/api/admin/users/' + userId, { method: 'DELETE' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645 \u0628\u0646\u062C\u0627\u062D', 'success');
                    // Remove the row from the table
                    var row = document.querySelector('[data-user-id="' + userId + '"]');
                    if (row) {
                        row.style.transition = 'opacity 0.3s, transform 0.3s';
                        row.style.opacity = '0';
                        row.style.transform = 'translateX(20px)';
                        setTimeout(function () { row.remove(); }, 300);
                    } else {
                        setTimeout(function () { location.reload(); }, 800);
                    }
                }
            })
            .catch(function () {
                // Error toast is shown by adminFetch
            });
    };

    // ── deleteGroup ─────────────────────────────────────────────────────
    // Confirmation dialog then DELETE /api/admin/groups/<id>
    window.deleteGroup = function (groupId) {
        if (!confirm('\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0647 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629\u061F \u0633\u064A\u062A\u0645 \u062D\u0630\u0641 \u062C\u0645\u064A\u0639 \u0627\u0644\u062C\u0644\u0633\u0627\u062A \u0627\u0644\u0645\u0631\u062A\u0628\u0637\u0629.')) return;
        adminFetch('/api/admin/groups/' + groupId, { method: 'DELETE' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629 \u0628\u0646\u062C\u0627\u062D', 'success');
                    var row = document.querySelector('[data-group-id="' + groupId + '"]');
                    if (row) {
                        row.style.transition = 'opacity 0.3s, transform 0.3s';
                        row.style.opacity = '0';
                        row.style.transform = 'translateX(20px)';
                        setTimeout(function () { row.remove(); }, 300);
                    } else {
                        setTimeout(function () { location.reload(); }, 800);
                    }
                }
            })
            .catch(function () {});
    };

    // ── deleteResource ──────────────────────────────────────────────────
    // Confirmation dialog then DELETE /api/admin/resources/<id>
    window.deleteResource = function (resourceId) {
        if (!confirm('\u0647\u0644 \u0623\u0646\u062A \u0645\u062A\u0623\u0643\u062F \u0645\u0646 \u062D\u0630\u0641 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0631\u062F\u061F')) return;
        adminFetch('/api/admin/resources/' + resourceId, { method: 'DELETE' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u062D\u0630\u0641 \u0627\u0644\u0645\u0648\u0631\u062F \u0628\u0646\u062C\u0627\u062D', 'success');
                    var row = document.querySelector('[data-resource-id="' + resourceId + '"]');
                    if (row) {
                        row.style.transition = 'opacity 0.3s, transform 0.3s';
                        row.style.opacity = '0';
                        row.style.transform = 'translateX(20px)';
                        setTimeout(function () { row.remove(); }, 300);
                    } else {
                        setTimeout(function () { location.reload(); }, 800);
                    }
                }
            })
            .catch(function () {});
    };

    // ── toggleUserActive ────────────────────────────────────────────────
    // Toggle user is_active status
    window.toggleUserActive = function (userId) {
        adminFetch('/api/admin/users/' + userId + '/toggle-active', { method: 'POST' })
            .then(function (data) {
                if (data.ok) {
                    var statusText = data.is_active ? '\u062A\u0645 \u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645' : '\u062A\u0645 \u062A\u0639\u0637\u064A\u0644 \u0627\u0644\u0645\u0633\u062A\u062E\u062F\u0645';
                    showToast(statusText, 'success');
                    // Update toggle button appearance
                    var btn = document.querySelector('[data-toggle-user="' + userId + '"]');
                    if (btn) {
                        btn.classList.toggle('active', data.is_active);
                        btn.textContent = data.is_active ? '\u0646\u0634\u0637' : '\u0645\u0639\u0637\u0644';
                        btn.className = btn.className.replace(/badge-(success|danger)/g, '');
                        btn.classList.add(data.is_active ? 'badge-success' : 'badge-danger');
                    } else {
                        setTimeout(function () { location.reload(); }, 600);
                    }
                }
            })
            .catch(function () {});
    };

    // ── showModal / closeModal ──────────────────────────────────────────
    // Generic modal show/hide
    window.showModal = function (modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.add('active');
            // Prevent body scroll
            document.body.style.overflow = 'hidden';
        }
    };

    window.closeModal = function (modalId) {
        var modal = document.getElementById(modalId);
        if (modal) {
            modal.classList.remove('active');
            document.body.style.overflow = '';
        }
    };

    // Close modals on overlay click and Escape
    document.addEventListener('click', function (e) {
        if (e.target.classList && e.target.classList.contains('modal-overlay')) {
            e.target.classList.remove('active');
            document.body.style.overflow = '';
        }
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal-overlay.active').forEach(function (m) {
                m.classList.remove('active');
            });
            document.body.style.overflow = '';
        }
    });

    // ── initDataTables ──────────────────────────────────────────────────
    // Basic table search/filter (no library, vanilla JS)
    window.initDataTables = function () {
        document.querySelectorAll('[data-table-search]').forEach(function (input) {
            var tableId = input.dataset.tableSearch;
            var table = document.getElementById(tableId);
            if (!table) return;

            input.addEventListener('input', function () {
                var query = input.value.trim().toLowerCase();
                var rows = table.querySelectorAll('tbody tr');

                rows.forEach(function (row) {
                    if (!query) {
                        row.style.display = '';
                        return;
                    }
                    var text = row.textContent.toLowerCase();
                    row.style.display = text.indexOf(query) !== -1 ? '' : 'none';
                });

                // Update visible count
                var countEl = document.querySelector('[data-table-count="' + tableId + '"]');
                if (countEl) {
                    var visible = table.querySelectorAll('tbody tr:not([style*="display: none"])').length;
                    countEl.textContent = visible;
                }
            });

            // Filter by column dropdown
            var filterSelect = document.querySelector('[data-table-filter="' + tableId + '"]');
            if (filterSelect) {
                filterSelect.addEventListener('change', function () {
                    var colIdx = parseInt(filterSelect.dataset.filterCol, 10);
                    var filterVal = filterSelect.value.toLowerCase();
                    var rows = table.querySelectorAll('tbody tr');

                    rows.forEach(function (row) {
                        if (!filterVal) {
                            row.style.display = '';
                            return;
                        }
                        var cells = row.querySelectorAll('td');
                        if (cells[colIdx]) {
                            var cellText = cells[colIdx].textContent.toLowerCase();
                            row.style.display = cellText.indexOf(filterVal) !== -1 ? '' : 'none';
                        }
                    });
                });
            }
        });

        // Sortable columns
        document.querySelectorAll('th[data-sort]').forEach(function (th) {
            th.style.cursor = 'pointer';
            th.addEventListener('click', function () {
                var table = th.closest('table');
                var tbody = table.querySelector('tbody');
                var colIdx = Array.prototype.indexOf.call(th.parentElement.children, th);
                var rows = Array.from(tbody.querySelectorAll('tr'));
                var asc = th.dataset.sortDir !== 'asc';
                th.dataset.sortDir = asc ? 'asc' : 'desc';

                // Reset other sort indicators
                th.parentElement.querySelectorAll('th[data-sort]').forEach(function (otherTh) {
                    if (otherTh !== th) otherTh.dataset.sortDir = '';
                });

                rows.sort(function (a, b) {
                    var aText = a.children[colIdx] ? a.children[colIdx].textContent.trim() : '';
                    var bText = b.children[colIdx] ? b.children[colIdx].textContent.trim() : '';
                    var aNum = parseFloat(aText);
                    var bNum = parseFloat(bText);
                    if (!isNaN(aNum) && !isNaN(bNum)) {
                        return asc ? aNum - bNum : bNum - aNum;
                    }
                    return asc ? aText.localeCompare(bText, 'ar') : bText.localeCompare(aText, 'ar');
                });

                rows.forEach(function (row) { tbody.appendChild(row); });
            });
        });
    };

    // ── startSession (admin context) ────────────────────────────────────
    window.startSession = function (sessionId) {
        if (!confirm('\u0647\u0644 \u062A\u0631\u064A\u062F \u0628\u062F\u0621 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629\u061F')) return;
        adminFetch('/api/session/' + sessionId + '/start', { method: 'POST' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u0628\u062F\u0621 \u0627\u0644\u062C\u0644\u0633\u0629 \u0628\u0646\u062C\u0627\u062D', 'success');
                    setTimeout(function () { location.reload(); }, 1000);
                }
            })
            .catch(function () {});
    };

    // ── endSession (admin context) ──────────────────────────────────────
    window.endSession = function (sessionId) {
        if (!confirm('\u0647\u0644 \u062A\u0631\u064A\u062F \u0625\u0646\u0647\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629\u061F')) return;
        adminFetch('/api/session/' + sessionId + '/end', { method: 'POST' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629', 'success');
                    setTimeout(function () { location.reload(); }, 1000);
                }
            })
            .catch(function () {});
    };

    // ── File Upload Area (drag & drop) ──────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        var uploadArea = document.querySelector('.upload-area');
        if (uploadArea) {
            var fileInput = uploadArea.querySelector('input[type="file"]');
            uploadArea.addEventListener('dragover', function (e) {
                e.preventDefault();
                uploadArea.classList.add('dragging');
            });
            uploadArea.addEventListener('dragleave', function () {
                uploadArea.classList.remove('dragging');
            });
            uploadArea.addEventListener('drop', function (e) {
                e.preventDefault();
                uploadArea.classList.remove('dragging');
                if (fileInput && e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    fileInput.dispatchEvent(new Event('change'));
                }
            });
            uploadArea.addEventListener('click', function () {
                if (fileInput) fileInput.click();
            });
        }

        // Init data tables
        initDataTables();
    });

})();
