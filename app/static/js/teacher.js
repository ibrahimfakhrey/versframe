/* === Shalaby Verse - Teacher Dashboard JS === */
/* RTL Arabic-first | Galaxy theme */
/* All fetch calls include X-CSRFToken header */

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
    function teacherFetch(url, options) {
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

    // ── startSession ────────────────────────────────────────────────────
    // POST /teacher/sessions/<id>/start with confirmation
    // Falls back to API route /api/session/<id>/start
    window.startSession = function (sessionId) {
        if (!confirm('\u0647\u0644 \u062A\u0631\u064A\u062F \u0628\u062F\u0621 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629\u061F')) return;
        teacherFetch('/api/session/' + sessionId + '/start', { method: 'POST' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u0628\u062F\u0621 \u0627\u0644\u062C\u0644\u0633\u0629!', 'success');
                    // Redirect to room
                    window.location.href = '/room/' + sessionId;
                }
            })
            .catch(function () {
                // Error toast shown by teacherFetch / apiFetch
            });
    };

    // ── endSession ──────────────────────────────────────────────────────
    // POST /teacher/sessions/<id>/end with confirmation
    window.endSession = function (sessionId) {
        if (!confirm('\u0647\u0644 \u062A\u0631\u064A\u062F \u0625\u0646\u0647\u0627\u0621 \u0647\u0630\u0647 \u0627\u0644\u062C\u0644\u0633\u0629\u061F \u0633\u064A\u062A\u0645 \u0645\u0646\u062D \u0646\u0642\u0627\u0637 \u0627\u0644\u062D\u0636\u0648\u0631 \u0644\u0644\u0637\u0644\u0627\u0628.')) return;
        teacherFetch('/api/session/' + sessionId + '/end', { method: 'POST' })
            .then(function (data) {
                if (data.ok) {
                    showToast('\u062A\u0645 \u0625\u0646\u0647\u0627\u0621 \u0627\u0644\u062C\u0644\u0633\u0629 \u0628\u0646\u062C\u0627\u062D', 'success');
                    setTimeout(function () { location.reload(); }, 1000);
                }
            })
            .catch(function () {});
    };

    // ── gradeSubmission ─────────────────────────────────────────────────
    // POST grade and feedback for a homework submission
    window.gradeSubmission = function (homeworkId, submissionId, grade, feedback) {
        // Validate grade
        var gradeNum = parseInt(grade, 10);
        if (isNaN(gradeNum) || gradeNum < 0 || gradeNum > 100) {
            showToast('\u0627\u0644\u062F\u0631\u062C\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0628\u064A\u0646 0 \u0648 100', 'error');
            return Promise.reject(new Error('Invalid grade'));
        }

        return teacherFetch('/api/teacher/grade', {
            method: 'POST',
            body: JSON.stringify({
                homework_id: homeworkId,
                submission_id: submissionId,
                grade: gradeNum,
                feedback: feedback || '',
            }),
        })
        .then(function (data) {
            if (data.ok) {
                showToast('\u062A\u0645 \u062A\u0642\u064A\u064A\u0645 \u0627\u0644\u0648\u0627\u062C\u0628 \u0628\u0646\u062C\u0627\u062D', 'success');
                // Update the UI - replace the grade form with badge
                var form = document.querySelector('[data-submission-id="' + submissionId + '"]');
                if (form) {
                    form.innerHTML = '<span class="badge badge-success">' + gradeNum + ' / 100</span>';
                    if (feedback) {
                        form.innerHTML += '<div style="margin-top:var(--space-sm);padding:var(--space-sm) var(--space-md);background:var(--success-light);border-radius:var(--radius-sm);font-size:var(--text-sm);">' +
                            '<strong>\u0645\u0644\u0627\u062D\u0638\u0627\u062A \u0627\u0644\u0645\u0639\u0644\u0645:</strong> ' + feedback + '</div>';
                    }
                }
                return data;
            }
        })
        .catch(function () {});
    };

    // ── awardXP ─────────────────────────────────────────────────────────
    // POST /api/teacher/award-xp to award XP to a student
    window.awardXP = function (studentId, amount, reason) {
        var amountNum = parseInt(amount, 10);
        if (isNaN(amountNum) || amountNum <= 0) {
            showToast('\u064A\u062C\u0628 \u0625\u062F\u062E\u0627\u0644 \u0639\u062F\u062F \u0646\u0642\u0627\u0637 \u0635\u062D\u064A\u062D', 'error');
            return Promise.reject(new Error('Invalid amount'));
        }

        return teacherFetch('/api/teacher/award-xp', {
            method: 'POST',
            body: JSON.stringify({
                student_id: studentId,
                amount: amountNum,
                reason: reason || '\u0645\u0643\u0627\u0641\u0623\u0629',
            }),
        })
        .then(function (data) {
            if (data.ok) {
                showToast('\u062A\u0645 \u0645\u0646\u062D ' + amountNum + ' XP \u0628\u0646\u062C\u0627\u062D', 'success');
                // Update XP display if visible
                var xpEl = document.querySelector('[data-student-xp="' + studentId + '"]');
                if (xpEl && data.total_xp !== undefined) {
                    xpEl.textContent = data.total_xp + ' XP';
                }
                return data;
            }
        })
        .catch(function () {});
    };

    // ── initHomeworkForm ─────────────────────────────────────────────────
    // Date picker setup and form validation for homework creation
    window.initHomeworkForm = function () {
        var form = document.querySelector('#newHomeworkModal form, [data-homework-form]');
        if (!form) return;

        // Set min date to today for due date picker
        var dueDateInput = form.querySelector('input[name="due_date"], input[type="datetime-local"]');
        if (dueDateInput) {
            var now = new Date();
            var offset = now.getTimezoneOffset();
            var local = new Date(now.getTime() - offset * 60000);
            dueDateInput.min = local.toISOString().slice(0, 16);
        }

        // Form validation
        form.addEventListener('submit', function (e) {
            var title = form.querySelector('input[name="title"]');
            var groupSelect = form.querySelector('select[name="group_id"]');

            if (title && !title.value.trim()) {
                e.preventDefault();
                showToast('\u064A\u062C\u0628 \u0625\u062F\u062E\u0627\u0644 \u0639\u0646\u0648\u0627\u0646 \u0627\u0644\u0648\u0627\u062C\u0628', 'error');
                title.focus();
                return;
            }

            if (groupSelect && !groupSelect.value) {
                e.preventDefault();
                showToast('\u064A\u062C\u0628 \u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0645\u062C\u0645\u0648\u0639\u0629', 'error');
                groupSelect.focus();
                return;
            }

            if (dueDateInput && dueDateInput.value) {
                var dueDate = new Date(dueDateInput.value);
                if (dueDate <= new Date()) {
                    e.preventDefault();
                    showToast('\u0627\u0644\u0645\u0648\u0639\u062F \u0627\u0644\u0646\u0647\u0627\u0626\u064A \u064A\u062C\u0628 \u0623\u0646 \u064A\u0643\u0648\u0646 \u0641\u064A \u0627\u0644\u0645\u0633\u062A\u0642\u0628\u0644', 'error');
                    dueDateInput.focus();
                    return;
                }
            }
        });
    };

    // ── initGradeForm ───────────────────────────────────────────────────
    // Grade slider/input (0-100) with live validation
    window.initGradeForm = function () {
        document.querySelectorAll('.grade-form, [data-grade-form]').forEach(function (form) {
            var gradeInput = form.querySelector('input[name="grade"]');
            if (!gradeInput) return;

            // Add range visualization
            var rangeContainer = document.createElement('div');
            rangeContainer.style.cssText = 'display:flex;align-items:center;gap:8px;margin-top:4px;';

            var rangeSlider = document.createElement('input');
            rangeSlider.type = 'range';
            rangeSlider.min = '0';
            rangeSlider.max = '100';
            rangeSlider.value = gradeInput.value || '0';
            rangeSlider.style.cssText = 'flex:1;accent-color:#640D5F;direction:ltr;';

            var rangeLabel = document.createElement('span');
            rangeLabel.style.cssText = 'font-weight:700;font-size:0.85rem;min-width:35px;text-align:center;color:var(--sv-purple,#640D5F);';
            rangeLabel.textContent = rangeSlider.value;

            rangeContainer.appendChild(rangeSlider);
            rangeContainer.appendChild(rangeLabel);
            gradeInput.parentElement.appendChild(rangeContainer);

            // Sync slider and input
            rangeSlider.addEventListener('input', function () {
                gradeInput.value = rangeSlider.value;
                rangeLabel.textContent = rangeSlider.value;
                _updateGradeColor(rangeLabel, parseInt(rangeSlider.value, 10));
            });

            gradeInput.addEventListener('input', function () {
                var val = parseInt(gradeInput.value, 10);
                if (!isNaN(val) && val >= 0 && val <= 100) {
                    rangeSlider.value = val;
                    rangeLabel.textContent = val;
                    _updateGradeColor(rangeLabel, val);
                }
            });

            // Form submission validation
            form.addEventListener('submit', function (e) {
                var val = parseInt(gradeInput.value, 10);
                if (isNaN(val) || val < 0 || val > 100) {
                    e.preventDefault();
                    showToast('\u0627\u0644\u062F\u0631\u062C\u0629 \u064A\u062C\u0628 \u0623\u0646 \u062A\u0643\u0648\u0646 \u0628\u064A\u0646 0 \u0648 100', 'error');
                    gradeInput.focus();
                }
            });
        });
    };

    function _updateGradeColor(label, val) {
        if (val >= 80) {
            label.style.color = 'var(--status-success, #00B894)';
        } else if (val >= 60) {
            label.style.color = 'var(--sv-orange, #EB5B00)';
        } else if (val >= 40) {
            label.style.color = 'var(--status-warning, #F39C12)';
        } else {
            label.style.color = 'var(--status-error, #E74C3C)';
        }
    }

    // ── Award XP Modal Helper ───────────────────────────────────────────
    // Opens a small modal to award XP to a specific student
    window.openAwardXPModal = function (studentId, studentName) {
        // Remove existing modal if any
        var existing = document.getElementById('awardXPModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'awardXPModal';
        modal.className = 'modal-overlay active';
        modal.innerHTML =
            '<div class="modal" style="max-width:400px;">' +
                '<div class="modal-header">' +
                    '<h2 class="modal-title">\u0645\u0646\u062D \u0646\u0642\u0627\u0637 XP</h2>' +
                    '<button class="modal-close" onclick="closeModal(\'awardXPModal\')">\u00D7</button>' +
                '</div>' +
                '<div style="padding:var(--space-lg);">' +
                    '<p style="margin-bottom:var(--space-md);">\u0645\u0646\u062D \u0646\u0642\u0627\u0637 \u0644\u0640: <strong>' + (studentName || '') + '</strong></p>' +
                    '<div class="form-group">' +
                        '<label class="form-label">\u0639\u062F\u062F \u0627\u0644\u0646\u0642\u0627\u0637</label>' +
                        '<input type="number" id="awardXPAmount" class="form-input" min="1" max="500" value="10" placeholder="10">' +
                    '</div>' +
                    '<div class="form-group">' +
                        '<label class="form-label">\u0627\u0644\u0633\u0628\u0628</label>' +
                        '<input type="text" id="awardXPReason" class="form-input" placeholder="\u0645\u0634\u0627\u0631\u0643\u0629 \u0645\u0645\u064A\u0632\u0629">' +
                    '</div>' +
                    '<div style="display:flex;gap:var(--space-sm);justify-content:flex-end;">' +
                        '<button class="btn btn-ghost" onclick="closeModal(\'awardXPModal\')">\u0625\u0644\u063A\u0627\u0621</button>' +
                        '<button class="btn btn-orange" onclick="' +
                            'awardXP(' + studentId + ', document.getElementById(\'awardXPAmount\').value, document.getElementById(\'awardXPReason\').value)' +
                            '.then(function(){ closeModal(\'awardXPModal\'); })">' +
                            '\u0645\u0646\u062D \u0627\u0644\u0646\u0642\u0627\u0637</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(modal);

        // Close on overlay click
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                setTimeout(function () { modal.remove(); }, 300);
            }
        });
    };

    // ── DOMContentLoaded ────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        initHomeworkForm();
        initGradeForm();
    });

})();
