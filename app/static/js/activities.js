/* ============================================================
   Shalaby Verse - In-Class Activities System
   Live classroom activities: MCQ, Drag & Drop, Fill-in-Blank,
   Code Challenges
   RTL Arabic-first, Galaxy Glassmorphism theme
   Vanilla JS only, no external dependencies
   ============================================================ */

(function () {
    'use strict';

    // -----------------------------------------------------------------------
    // State
    // -----------------------------------------------------------------------
    var currentActivity = null;       // The active activity data object
    var activityTimerInterval = null;  // Timer countdown interval
    var activityTimeLeft = 0;          // Seconds remaining
    var activitySubmitted = false;     // Whether current user has submitted
    var studentCompletions = 0;        // Number of students who completed (teacher view)
    var totalStudentsInRoom = 0;       // Total students in room for progress

    // Drag-drop state
    var dragState = {
        dragging: null,        // The DOM element being dragged
        placeholder: null,     // Placeholder element showing drop position
        startY: 0,
        startX: 0,
        offsetY: 0,
        offsetX: 0,
        listContainer: null,
    };

    // -----------------------------------------------------------------------
    // Activity Lifecycle
    // -----------------------------------------------------------------------

    /**
     * startActivity(activityData) - Teacher starts an activity.
     * Emits via SocketIO, then renders locally for teacher too.
     */
    window.startActivity = function (activityData) {
        if (!activityData) return;

        // If teacher, emit to room
        if (window.IS_TEACHER && typeof emitActivityStart === 'function') {
            emitActivityStart(window.SESSION_ID, activityData);
        }

        // Render locally (teacher also sees the activity)
        handleActivityStart(activityData);
    };

    /**
     * submitActivityAnswer(activityId, answer) - Student submits answer.
     */
    window.submitActivityAnswer = function (activityId, answer) {
        if (activitySubmitted) return;
        activitySubmitted = true;

        if (typeof emitActivitySubmit === 'function') {
            emitActivitySubmit(window.SESSION_ID, {
                activity_id: activityId,
                answer: answer,
                student_id: window.USER_ID,
                student_name: window.USER_NAME,
            });
        }

        // Disable the submit button
        var submitBtn = document.getElementById('activitySubmitBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'تم الإرسال';
            submitBtn.style.opacity = '0.6';
        }
    };

    /**
     * endActivity() - Teacher ends the current activity.
     */
    window.endActivity = function () {
        if (window.IS_TEACHER && typeof emitActivityEnd === 'function') {
            emitActivityEnd(window.SESSION_ID, currentActivity ? currentActivity.id : null);
        }
        handleActivityEnd();
    };

    // -----------------------------------------------------------------------
    // SocketIO Event Handlers (called from socketio.js)
    // -----------------------------------------------------------------------

    /**
     * handleActivityStart(data) - Received when teacher starts an activity.
     */
    window.handleActivityStart = function (data) {
        if (!data) return;

        currentActivity = data;
        activitySubmitted = false;
        studentCompletions = 0;

        // Auto-switch to the activities tab so both teacher and student see it
        if (typeof switchTopTab === 'function') {
            switchTopTab('activities');
        }

        // Show the activity card area
        showActivityCard(true);

        // Render the activity content
        renderActivity(data);

        // Start the timer
        if (data.timeLimit) {
            startActivityCountdown(data.timeLimit);
        }

        // Update progress bar
        updateActivityProgress(0, 1);

        // Show notification
        if (typeof showToast === 'function') {
            showToast('نشاط جديد بدأ!', 'info');
        }
    };

    function handleActivityStart(data) {
        window.handleActivityStart(data);
    }

    /**
     * handleActivityEnd() - Received when teacher ends the activity.
     */
    window.handleActivityEnd = function (data) {
        stopActivityCountdown();
        currentActivity = null;
        activitySubmitted = false;

        // Show idle state
        showActivityIdle();

        if (typeof showToast === 'function') {
            showToast('انتهى النشاط', 'info');
        }
    };

    /**
     * handleActivityResult(data) - Received with individual score after submission.
     * data: { correct: bool/number, total: number, xp_earned: number, ... }
     */
    window.handleActivityResult = function (data) {
        if (!data) return;
        showActivityResult(data.correct, data.total, data.xp_earned || 0);

        // Update student completion count (for progress)
        if (data.completions !== undefined) {
            studentCompletions = data.completions;
            totalStudentsInRoom = data.total_students || totalStudentsInRoom;
            updateActivityProgress(studentCompletions, totalStudentsInRoom || 1);
        }
    };

    /**
     * handleActivitySubmissionUpdate(data) - Teacher receives when a student submits.
     * data: { student_id, student_name, correct, total, completions, activity_id }
     */
    window.handleActivitySubmissionUpdate = function (data) {
        if (!data || !window.IS_TEACHER) return;

        // Update progress
        if (data.completions !== undefined) {
            studentCompletions = data.completions;
            var total = data.total_students || totalStudentsInRoom || Math.max(studentCompletions, 1);
            updateActivityProgress(studentCompletions, total);
        }

        // Show toast with student result
        var name = data.student_name || ('طالب #' + data.student_id);
        var pct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
        var emoji = pct >= 80 ? '&#127942;' : (pct >= 50 ? '&#128170;' : '&#128161;');
        if (typeof showToast === 'function') {
            showToast(name + ' أجاب — ' + pct + '%', pct >= 50 ? 'success' : 'warning');
        }

        // Append submission entry in activity content area (below the activity)
        var submissionList = document.getElementById('teacherSubmissionList');
        if (!submissionList) {
            var contentArea = document.getElementById('activityContent');
            if (contentArea) {
                var listDiv = document.createElement('div');
                listDiv.id = 'teacherSubmissionList';
                listDiv.style.cssText = 'margin-top:10px;border-top:1px solid rgba(180,140,210,0.15);padding-top:8px;display:flex;flex-direction:column;gap:4px;max-height:120px;overflow-y:auto;';
                listDiv.innerHTML = '<div style="font-size:10px;font-weight:700;color:#636E72;margin-bottom:2px;">&#128203; الإجابات:</div>';
                contentArea.appendChild(listDiv);
                submissionList = listDiv;
            }
        }
        if (submissionList) {
            var entry = document.createElement('div');
            entry.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:4px 8px;background:rgba(240,230,250,0.5);border-radius:var(--radius-sm);font-size:11px;';
            entry.innerHTML = '<span style="color:#2D3436;font-weight:600;">' + escapeHtml(name) + '</span>' +
                '<span style="color:' + (pct >= 80 ? '#00b894' : (pct >= 50 ? '#EB5B00' : '#d63031')) + ';font-weight:700;font-family:var(--font-en);">' + pct + '%</span>';
            submissionList.appendChild(entry);
            submissionList.scrollTop = submissionList.scrollHeight;
        }
    };

    // -----------------------------------------------------------------------
    // Timer
    // -----------------------------------------------------------------------

    function startActivityCountdown(seconds) {
        stopActivityCountdown();
        activityTimeLeft = seconds;
        updateTimerDisplay(activityTimeLeft);

        activityTimerInterval = setInterval(function () {
            activityTimeLeft--;
            updateTimerDisplay(activityTimeLeft);

            if (activityTimeLeft <= 10) {
                var timerEl = document.getElementById('activityTimer');
                if (timerEl) timerEl.style.color = '#ff6b6b';
            }

            if (activityTimeLeft <= 0) {
                stopActivityCountdown();
                // Auto-submit if student hasn't submitted
                if (!window.IS_TEACHER && !activitySubmitted && currentActivity) {
                    autoSubmitCurrentActivity();
                }
                if (typeof showToast === 'function') {
                    showToast('انتهى الوقت!', 'warning');
                }
            }
        }, 1000);
    }

    function stopActivityCountdown() {
        clearInterval(activityTimerInterval);
        activityTimerInterval = null;
        var timerEl = document.getElementById('activityTimer');
        if (timerEl) timerEl.style.color = '';
    }

    function updateTimerDisplay(seconds) {
        var timerEl = document.getElementById('activityTimer');
        if (!timerEl) return;
        var m = Math.floor(seconds / 60);
        var s = seconds % 60;
        timerEl.textContent = m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
    }

    // -----------------------------------------------------------------------
    // Progress
    // -----------------------------------------------------------------------

    function updateActivityProgress(completed, total) {
        var progressBar = document.getElementById('activityProgressBar');
        var progressText = document.getElementById('activityProgressText');
        if (!total || total <= 0) total = 1;
        var pct = Math.min(100, Math.round((completed / total) * 100));

        if (progressBar) {
            progressBar.style.width = pct + '%';
        }
        if (progressText) {
            progressText.textContent = completed + ' / ' + total;
        }
    }

    // -----------------------------------------------------------------------
    // UI: Show/Hide Activity Card
    // -----------------------------------------------------------------------

    function showActivityCard(active) {
        var liveBadge = document.querySelector('.room-activity-live');
        if (liveBadge) {
            liveBadge.style.display = active ? 'inline-flex' : 'none';
        }
    }

    function showActivityIdle() {
        var contentArea = document.getElementById('activityContent');
        if (contentArea) {
            contentArea.innerHTML =
                '<div style="text-align:center;padding:20px 10px;color:#636E72;">' +
                '<div style="font-size:2rem;margin-bottom:8px;">&#127919;</div>' +
                '<p style="font-size:13px;">لا يوجد نشاط حالياً</p>' +
                '<p style="font-size:11px;margin-top:4px;color:#B2BEC3;">سيظهر النشاط عندما يبدأه المعلم</p>' +
                '</div>';
        }

        updateTimerDisplay(0);
        updateActivityProgress(0, 1);

        var liveBadge = document.querySelector('.room-activity-live');
        if (liveBadge) liveBadge.style.display = 'none';

        // Show teacher launch panel if teacher
        if (window.IS_TEACHER) {
            showTeacherActivityLauncher();
        }
    }

    // -----------------------------------------------------------------------
    // Render Activity (dispatcher)
    // -----------------------------------------------------------------------

    /**
     * renderActivity(data) - Main dispatcher that renders activity
     * into the right sidebar #activityContent area.
     */
    window.renderActivity = function (data) {
        if (!data || !data.type) return;

        var contentArea = document.getElementById('activityContent');
        if (!contentArea) return;

        // Update title in the card header
        var titleEl = document.getElementById('activityTitle');
        if (titleEl) titleEl.textContent = data.title || 'نشاط';

        switch (data.type) {
            case 'mcq':
                renderMultipleChoice(data, contentArea);
                break;
            case 'dragdrop':
                renderDragDrop(data, contentArea);
                break;
            case 'fillblank':
                renderFillBlank(data, contentArea);
                break;
            case 'code':
                renderCodeChallenge(data, contentArea);
                break;
            default:
                contentArea.innerHTML = '<p style="color:#636E72;text-align:center;">نوع النشاط غير معروف</p>';
        }
    };

    // -----------------------------------------------------------------------
    // 1. Multiple Choice Questions (MCQ)
    // -----------------------------------------------------------------------

    window.renderMultipleChoice = function (data, container) {
        if (!container) container = document.getElementById('activityContent');
        if (!container) return;

        var html = '<div class="activity-mcq" dir="rtl">';
        html += '<div class="activity-question">' + escapeHtml(data.title) + '</div>';
        html += '<div class="mcq-options">';

        data.options.forEach(function (opt, i) {
            html += '<label class="mcq-option" data-index="' + i + '">';
            html += '<input type="radio" name="mcq_answer" value="' + i + '"' +
                (window.IS_TEACHER ? ' disabled' : '') + '>';
            html += '<span class="mcq-radio-custom"></span>';
            html += '<span class="mcq-option-text">' + escapeHtml(opt) + '</span>';
            html += '</label>';
        });

        html += '</div>';

        if (!window.IS_TEACHER) {
            html += '<button class="activity-action-btn activity-submit-btn" id="activitySubmitBtn" onclick="submitMCQ()">إرسال الإجابة</button>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Add click highlight for options
        container.querySelectorAll('.mcq-option').forEach(function (label) {
            label.addEventListener('click', function () {
                container.querySelectorAll('.mcq-option').forEach(function (l) { l.classList.remove('selected'); });
                label.classList.add('selected');
            });
        });
    };

    window.submitMCQ = function () {
        if (!currentActivity || activitySubmitted) return;

        var selected = document.querySelector('input[name="mcq_answer"]:checked');
        if (!selected) {
            if (typeof showToast === 'function') showToast('اختر إجابة أولاً', 'warning');
            return;
        }

        var answer = parseInt(selected.value, 10);
        submitActivityAnswer(currentActivity.id, { type: 'mcq', selected: answer });
    };

    // -----------------------------------------------------------------------
    // 2. Drag & Drop Sorting
    // -----------------------------------------------------------------------

    window.renderDragDrop = function (data, container) {
        if (!container) container = document.getElementById('activityContent');
        if (!container) return;

        var html = '<div class="activity-dragdrop" dir="rtl">';
        html += '<div class="activity-question">' + escapeHtml(data.title) + '</div>';
        html += '<div class="dragdrop-hint" style="font-size:11px;color:#636E72;margin-bottom:8px;">اسحب العناصر لترتيبها بالترتيب الصحيح</div>';
        html += '<div class="dragdrop-list" id="dragDropList" dir="ltr">';

        // Shuffle items for the student (but keep data.items as reference)
        var shuffled = shuffleWithIndices(data.items);

        shuffled.forEach(function (item) {
            html += '<div class="dragdrop-item" data-original-index="' + item.originalIndex + '" draggable="true">';
            html += '<span class="dragdrop-handle">&#9776;</span>';
            html += '<code class="dragdrop-code">' + escapeHtml(item.text) + '</code>';
            html += '</div>';
        });

        html += '</div>';

        if (!window.IS_TEACHER) {
            html += '<button class="activity-action-btn activity-submit-btn" id="activitySubmitBtn" onclick="submitDragDrop()">إرسال الترتيب</button>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Initialize drag & drop (vanilla JS with touch support)
        initDragDrop(document.getElementById('dragDropList'));
    };

    function shuffleWithIndices(items) {
        var arr = items.map(function (text, i) {
            return { text: text, originalIndex: i };
        });
        // Fisher-Yates shuffle
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i];
            arr[i] = arr[j];
            arr[j] = tmp;
        }
        return arr;
    }

    /**
     * Vanilla JS Drag & Drop with Touch support
     */
    function initDragDrop(listEl) {
        if (!listEl) return;

        var items = listEl.querySelectorAll('.dragdrop-item');

        items.forEach(function (item) {
            // ---- Mouse Events ----
            item.addEventListener('dragstart', onDragStart);
            item.addEventListener('dragover', onDragOver);
            item.addEventListener('dragend', onDragEnd);
            item.addEventListener('drop', onDrop);

            // ---- Touch Events ----
            item.addEventListener('touchstart', onTouchStart, { passive: false });
            item.addEventListener('touchmove', onTouchMove, { passive: false });
            item.addEventListener('touchend', onTouchEnd);
        });

        // Prevent default dragover on the list container
        listEl.addEventListener('dragover', function (e) {
            e.preventDefault();
        });
    }

    // --- Mouse drag handlers ---

    function onDragStart(e) {
        dragState.dragging = this;
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        // Required for Firefox
        e.dataTransfer.setData('text/plain', '');
    }

    function onDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        var dragging = dragState.dragging;
        if (!dragging || dragging === this) return;

        var list = this.parentNode;
        var children = Array.from(list.children).filter(function (c) {
            return c.classList.contains('dragdrop-item');
        });

        var draggingIndex = children.indexOf(dragging);
        var targetIndex = children.indexOf(this);

        if (draggingIndex < targetIndex) {
            list.insertBefore(dragging, this.nextSibling);
        } else {
            list.insertBefore(dragging, this);
        }
    }

    function onDrop(e) {
        e.preventDefault();
    }

    function onDragEnd(e) {
        if (dragState.dragging) {
            dragState.dragging.classList.remove('dragging');
        }
        dragState.dragging = null;
    }

    // --- Touch drag handlers ---

    function onTouchStart(e) {
        if (e.touches.length !== 1) return;

        var touch = e.touches[0];
        dragState.dragging = this;
        dragState.listContainer = this.parentNode;

        var rect = this.getBoundingClientRect();
        dragState.offsetY = touch.clientY - rect.top;
        dragState.offsetX = touch.clientX - rect.left;
        dragState.startY = touch.clientY;
        dragState.startX = touch.clientX;

        this.classList.add('dragging');
        this.style.zIndex = '100';

        e.preventDefault();
    }

    function onTouchMove(e) {
        if (!dragState.dragging || e.touches.length !== 1) return;
        e.preventDefault();

        var touch = e.touches[0];
        var dragging = dragState.dragging;
        var list = dragState.listContainer;

        // Visual feedback - slight scale
        dragging.style.transform = 'scale(1.03)';
        dragging.style.opacity = '0.85';

        // Find the element under the touch point (excluding dragged)
        var elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!elemBelow) return;

        // Walk up to find a .dragdrop-item
        var target = elemBelow.closest('.dragdrop-item');
        if (!target || target === dragging || target.parentNode !== list) return;

        var children = Array.from(list.children).filter(function (c) {
            return c.classList.contains('dragdrop-item');
        });

        var draggingIndex = children.indexOf(dragging);
        var targetIndex = children.indexOf(target);

        if (draggingIndex < targetIndex) {
            list.insertBefore(dragging, target.nextSibling);
        } else {
            list.insertBefore(dragging, target);
        }
    }

    function onTouchEnd(e) {
        if (!dragState.dragging) return;

        dragState.dragging.classList.remove('dragging');
        dragState.dragging.style.zIndex = '';
        dragState.dragging.style.transform = '';
        dragState.dragging.style.opacity = '';
        dragState.dragging = null;
        dragState.listContainer = null;
    }

    window.submitDragDrop = function () {
        if (!currentActivity || activitySubmitted) return;

        var listEl = document.getElementById('dragDropList');
        if (!listEl) return;

        var items = listEl.querySelectorAll('.dragdrop-item');
        var order = [];
        items.forEach(function (item) {
            order.push(parseInt(item.getAttribute('data-original-index'), 10));
        });

        submitActivityAnswer(currentActivity.id, { type: 'dragdrop', order: order });
    };

    // -----------------------------------------------------------------------
    // 3. Fill-in-the-Blank
    // -----------------------------------------------------------------------

    window.renderFillBlank = function (data, container) {
        if (!container) container = document.getElementById('activityContent');
        if (!container) return;

        var html = '<div class="activity-fillblank" dir="rtl">';
        html += '<div class="activity-question">' + escapeHtml(data.title) + '</div>';
        html += '<div class="fillblank-code" dir="ltr">';

        data.lines.forEach(function (line, lineIdx) {
            html += '<div class="fillblank-line">';
            html += '<span class="fillblank-linenum">' + (lineIdx + 1) + '</span>';

            var text = line.text;
            if (line.blanks) {
                line.blanks.forEach(function (blank, blankIdx) {
                    var inputId = 'fb_' + lineIdx + '_' + blankIdx;
                    var placeholder = blank.hint || '____';
                    var inputHtml = '<input type="text" ' +
                        'id="' + inputId + '" ' +
                        'class="room-code-blank fillblank-input" ' +
                        'placeholder="' + escapeHtml(placeholder) + '" ' +
                        'data-answer="' + escapeHtml(blank.answer || '') + '" ' +
                        'data-line="' + lineIdx + '" ' +
                        'data-blank="' + blankIdx + '" ' +
                        'autocomplete="off" dir="ltr" spellcheck="false"' +
                        (window.IS_TEACHER ? ' disabled' : '') + '>';
                    text = text.replace('____', inputHtml);
                });
            }

            html += '<span class="fillblank-content">' + text + '</span>';
            html += '</div>';
        });

        html += '</div>';

        if (!window.IS_TEACHER) {
            html += '<button class="activity-action-btn activity-submit-btn" id="activitySubmitBtn" onclick="submitFillBlank()">إرسال الإجابة</button>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Auto-focus on first blank
        var firstInput = container.querySelector('.fillblank-input');
        if (firstInput) {
            setTimeout(function () { firstInput.focus(); }, 200);
        }

        // Tab-navigate between blanks
        var inputs = container.querySelectorAll('.fillblank-input');
        inputs.forEach(function (inp, idx) {
            inp.addEventListener('keydown', function (e) {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    var next = inputs[idx + 1];
                    if (next) next.focus();
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    var nextInp = inputs[idx + 1];
                    if (nextInp) {
                        nextInp.focus();
                    } else {
                        // Last blank - submit
                        submitFillBlank();
                    }
                }
            });
        });
    };

    window.submitFillBlank = function () {
        if (!currentActivity || activitySubmitted) return;

        var inputs = document.querySelectorAll('.fillblank-input');
        var answers = [];

        inputs.forEach(function (input) {
            answers.push({
                line: parseInt(input.getAttribute('data-line'), 10),
                blank: parseInt(input.getAttribute('data-blank'), 10),
                value: input.value.trim(),
            });
        });

        submitActivityAnswer(currentActivity.id, { type: 'fillblank', answers: answers });
    };

    // -----------------------------------------------------------------------
    // 4. Code Challenges
    // -----------------------------------------------------------------------

    function renderCodeChallenge(data, container) {
        if (!container) container = document.getElementById('activityContent');
        if (!container) return;

        var html = '<div class="activity-code" dir="rtl">';
        html += '<div class="activity-question">' + escapeHtml(data.title) + '</div>';

        if (data.description) {
            html += '<div class="activity-code-desc" style="font-size:12px;color:#636E72;margin-bottom:8px;">' + escapeHtml(data.description) + '</div>';
        }

        html += '<textarea id="activityCodeEditor" class="activity-code-editor" dir="ltr" spellcheck="false" placeholder="# اكتب الكود هنا..."' +
            (window.IS_TEACHER ? ' disabled' : '') + '>';
        html += escapeHtml(data.starterCode || '');
        html += '</textarea>';

        if (!window.IS_TEACHER) {
            html += '<div style="display:flex;gap:6px;margin-top:8px;">';
            html += '<button class="activity-action-btn activity-submit-btn" style="flex:1;" id="activitySubmitBtn" onclick="submitCodeChallenge()">إرسال الكود</button>';
            html += '</div>';
        }

        html += '</div>';
        container.innerHTML = html;

        // Tab support in textarea
        var textarea = document.getElementById('activityCodeEditor');
        if (textarea) {
            textarea.addEventListener('keydown', function (e) {
                if (e.key === 'Tab') {
                    e.preventDefault();
                    var start = textarea.selectionStart;
                    var end = textarea.selectionEnd;
                    textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
                    textarea.selectionStart = textarea.selectionEnd = start + 4;
                }
            });
        }
    }

    window.submitCodeChallenge = function () {
        if (!currentActivity || activitySubmitted) return;

        var editor = document.getElementById('activityCodeEditor');
        if (!editor) return;

        var code = editor.value.trim();
        if (!code) {
            if (typeof showToast === 'function') showToast('اكتب الكود أولاً', 'warning');
            return;
        }

        submitActivityAnswer(currentActivity.id, { type: 'code', code: code });
    };

    // -----------------------------------------------------------------------
    // Auto-Submit (when timer expires)
    // -----------------------------------------------------------------------

    function autoSubmitCurrentActivity() {
        if (!currentActivity || activitySubmitted) return;

        switch (currentActivity.type) {
            case 'mcq':
                var selected = document.querySelector('input[name="mcq_answer"]:checked');
                submitActivityAnswer(currentActivity.id, {
                    type: 'mcq',
                    selected: selected ? parseInt(selected.value, 10) : -1,
                });
                break;
            case 'dragdrop':
                submitDragDrop();
                break;
            case 'fillblank':
                submitFillBlank();
                break;
            case 'code':
                submitCodeChallenge();
                break;
        }
    }

    // -----------------------------------------------------------------------
    // Show Activity Result (score with animation)
    // -----------------------------------------------------------------------

    window.showActivityResult = function (correct, total, xpEarned) {
        var contentArea = document.getElementById('activityContent');
        if (!contentArea) return;

        var isCorrect = (correct === total) || (correct === true);
        var pct = total > 0 ? Math.round((correct / total) * 100) : (correct ? 100 : 0);

        var resultClass = pct >= 80 ? 'result-excellent' : (pct >= 50 ? 'result-good' : 'result-retry');
        var emoji = pct >= 80 ? '&#127942;' : (pct >= 50 ? '&#128170;' : '&#128161;');
        var message = pct >= 80 ? 'ممتاز!' : (pct >= 50 ? 'جيد، واصل!' : 'حاول مرة أخرى!');

        var html = '<div class="activity-result ' + resultClass + '" dir="rtl">';
        html += '<div class="result-emoji">' + emoji + '</div>';
        html += '<div class="result-score">' + (typeof correct === 'boolean' ? (correct ? '1' : '0') : correct) + ' / ' + total + '</div>';
        html += '<div class="result-pct">' + pct + '%</div>';
        html += '<div class="result-message">' + message + '</div>';

        if (xpEarned > 0) {
            html += '<div class="result-xp">+' + xpEarned + ' XP</div>';
        }

        html += '<div class="result-bar-track"><div class="result-bar-fill" style="width:0%;"></div></div>';
        html += '</div>';

        contentArea.innerHTML = html;

        // Animate the bar after a short delay
        setTimeout(function () {
            var fill = contentArea.querySelector('.result-bar-fill');
            if (fill) fill.style.width = pct + '%';
        }, 100);

        // Update XP display
        if (xpEarned > 0) {
            var xpDisplay = document.getElementById('xpDisplay');
            if (xpDisplay) {
                var currentXP = parseInt(xpDisplay.textContent, 10) || 0;
                animateNumber(xpDisplay, currentXP, currentXP + xpEarned, 800);
            }

            // Refresh from server to stay accurate
            if (!window.IS_TEACHER) {
                setTimeout(function(){
                    fetch('/api/me').then(function(r){return r.json();}).then(function(d){
                        var el = document.getElementById('xpDisplay');
                        if (el && d.total_xp !== undefined) el.textContent = d.total_xp;
                    }).catch(function(){});
                }, 1000);
            }
        }

        stopActivityCountdown();
    };

    // -----------------------------------------------------------------------
    // Teacher: Activity Launcher Panel
    // -----------------------------------------------------------------------

    function showTeacherActivityLauncher() {
        var contentArea = document.getElementById('activityContent');
        if (!contentArea || !window.IS_TEACHER) return;

        var html = '<div class="teacher-activity-launcher" dir="rtl">';

        html += '<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:#2D3436;">إنشاء نشاط جديد:</div>';

        html += '<div class="launcher-grid">';
        html += '<button class="launcher-btn" onclick="showActivityCreator(\'mcq\')">';
        html += '<span class="launcher-icon">&#127793;</span>';
        html += '<span>اختيار من متعدد</span>';
        html += '</button>';

        html += '<button class="launcher-btn" onclick="showActivityCreator(\'dragdrop\')">';
        html += '<span class="launcher-icon">&#128260;</span>';
        html += '<span>سحب وإفلات</span>';
        html += '</button>';

        html += '<button class="launcher-btn" onclick="showActivityCreator(\'fillblank\')">';
        html += '<span class="launcher-icon">&#9999;</span>';
        html += '<span>أكمل الكود</span>';
        html += '</button>';

        html += '<button class="launcher-btn" onclick="showActivityCreator(\'code\')">';
        html += '<span class="launcher-icon">&#128187;</span>';
        html += '<span>تحدي كود</span>';
        html += '</button>';
        html += '</div>';

        // Template library grouped by topic
        html += '<div style="margin-top:12px;border-top:1px solid rgba(180,140,210,0.15);padding-top:10px;">';
        html += '<div style="font-size:11px;color:#636E72;margin-bottom:8px;">قوالب أنشطة برمجية جاهزة:</div>';
        html += '<div style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:6px;">';

        var lastTopic = '';
        var typeBadge = { mcq:'اختيار', dragdrop:'ترتيب', fillblank:'أكمل', code:'كود' };
        var typeBadgeColor = { mcq:'#EB5B00', dragdrop:'var(--sv-purple)', fillblank:'#00b894', code:'#0984E3' };

        ACTIVITY_TEMPLATES.forEach(function (tmpl, idx) {
            if (tmpl.topic !== lastTopic) {
                lastTopic = tmpl.topic;
                html += '<div style="font-size:10px;font-weight:700;color:#636E72;margin-top:4px;">' + tmpl.icon + ' ' + tmpl.topicAr + '</div>';
            }
            html += '<button onclick="launchTemplate(' + idx + ')" style="display:flex;align-items:center;gap:6px;width:100%;padding:6px 8px;background:rgba(240,230,250,0.5);border:1px solid rgba(180,140,210,0.12);border-radius:var(--radius-sm);cursor:pointer;text-align:right;font-family:var(--font-ar);font-size:11px;color:#2D3436;transition:all 0.15s;"' +
                ' onmouseover="this.style.background=\'rgba(235,91,0,0.06)\';this.style.borderColor=\'rgba(235,91,0,0.2)\'" onmouseout="this.style.background=\'rgba(240,230,250,0.5)\';this.style.borderColor=\'rgba(180,140,210,0.12)\'">';
            html += '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + escapeHtml(tmpl.data.title) + '</span>';
            html += '<span style="font-size:9px;padding:2px 6px;border-radius:var(--radius-full);background:' + (typeBadgeColor[tmpl.data.type] || '#636E72') + ';color:white;white-space:nowrap;">' + (typeBadge[tmpl.data.type] || '') + '</span>';
            html += '</button>';
        });

        html += '</div></div>';
        html += '</div>';

        contentArea.innerHTML = html;
    }

    // -----------------------------------------------------------------------
    // Activity Creator Forms (Teacher)
    // -----------------------------------------------------------------------

    var creatorInputStyle = 'width:100%;padding:8px 10px;background:rgba(255,255,255,0.7);border:1px solid rgba(180,140,210,0.2);border-radius:var(--radius-sm);color:#2D3436;font-family:var(--font-ar);font-size:12px;outline:none;box-sizing:border-box;';
    var creatorLabelStyle = 'font-size:11px;font-weight:700;color:#636E72;margin-bottom:4px;display:block;';
    var creatorBtnStyle = 'display:block;width:100%;padding:8px;background:linear-gradient(135deg,var(--sv-orange),#ff8a3d);color:white;border:none;border-radius:var(--radius-md);font-family:var(--font-ar);font-weight:700;font-size:12px;cursor:pointer;border-bottom:3px solid #B84700;margin-top:8px;';
    var creatorBackBtnStyle = 'display:block;width:100%;padding:6px;background:rgba(180,140,210,0.15);color:#636E72;border:none;border-radius:var(--radius-sm);font-family:var(--font-ar);font-weight:700;font-size:11px;cursor:pointer;margin-top:6px;';

    window.showActivityCreator = function (type) {
        var contentArea = document.getElementById('activityContent');
        if (!contentArea) return;

        switch (type) {
            case 'mcq': showMCQCreator(contentArea); break;
            case 'dragdrop': showDragDropCreator(contentArea); break;
            case 'fillblank': showFillBlankCreator(contentArea); break;
            case 'code': showCodeCreator(contentArea); break;
        }
    };

    function showMCQCreator(container) {
        var html = '<div dir="rtl" style="display:flex;flex-direction:column;gap:8px;">';
        html += '<div style="font-size:13px;font-weight:700;color:#2D3436;">&#127793; إنشاء سؤال اختيار متعدد</div>';
        html += '<div><label style="' + creatorLabelStyle + '">عنوان السؤال</label>';
        html += '<input type="text" id="mcqTitle" placeholder="مثال: ما هو المتغير؟" style="' + creatorInputStyle + '"></div>';
        html += '<div id="mcqOptionsContainer">';
        for (var i = 0; i < 4; i++) {
            html += '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">';
            html += '<input type="radio" name="mcqCorrect" value="' + i + '"' + (i === 0 ? ' checked' : '') + ' style="flex-shrink:0;">';
            html += '<input type="text" class="mcq-creator-opt" placeholder="الخيار ' + (i + 1) + '" style="' + creatorInputStyle + 'margin:0;">';
            if (i >= 2) html += '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#d63031;cursor:pointer;font-size:14px;flex-shrink:0;">&#10006;</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<button onclick="addMCQOption()" style="background:none;border:1px dashed rgba(180,140,210,0.3);color:#636E72;padding:4px;border-radius:var(--radius-sm);font-family:var(--font-ar);font-size:11px;cursor:pointer;">+ إضافة خيار</button>';
        html += '<div><label style="' + creatorLabelStyle + '">الوقت (ثانية)</label>';
        html += '<select id="mcqTime" style="' + creatorInputStyle + '"><option value="30">30</option><option value="60" selected>60</option><option value="90">90</option><option value="120">120</option></select></div>';
        html += '<button onclick="launchCreatedMCQ()" style="' + creatorBtnStyle + '">&#9654; إطلاق النشاط</button>';
        html += '<button onclick="showTeacherActivityLauncherGlobal()" style="' + creatorBackBtnStyle + '">&#8594; رجوع</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    window.addMCQOption = function () {
        var c = document.getElementById('mcqOptionsContainer');
        if (!c) return;
        var count = c.querySelectorAll('.mcq-creator-opt').length;
        if (count >= 6) return;
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:4px;';
        div.innerHTML = '<input type="radio" name="mcqCorrect" value="' + count + '" style="flex-shrink:0;">' +
            '<input type="text" class="mcq-creator-opt" placeholder="الخيار ' + (count + 1) + '" style="' + creatorInputStyle + 'margin:0;">' +
            '<button onclick="this.parentElement.remove()" style="background:none;border:none;color:#d63031;cursor:pointer;font-size:14px;flex-shrink:0;">&#10006;</button>';
        c.appendChild(div);
    };

    window.launchCreatedMCQ = function () {
        var title = document.getElementById('mcqTitle');
        if (!title || !title.value.trim()) { showToast('أدخل عنوان السؤال', 'warning'); return; }
        var opts = document.querySelectorAll('.mcq-creator-opt');
        var options = [];
        opts.forEach(function (o) { if (o.value.trim()) options.push(o.value.trim()); });
        if (options.length < 2) { showToast('أدخل خيارين على الأقل', 'warning'); return; }
        var correct = document.querySelector('input[name="mcqCorrect"]:checked');
        var correctIdx = correct ? parseInt(correct.value, 10) : 0;
        if (correctIdx >= options.length) correctIdx = 0;
        var timeLimit = parseInt(document.getElementById('mcqTime').value, 10) || 60;
        startActivity({
            type: 'mcq', id: 'mcq_' + Date.now(), title: title.value.trim(),
            options: options, correct: correctIdx, timeLimit: timeLimit
        });
    };

    function showDragDropCreator(container) {
        var html = '<div dir="rtl" style="display:flex;flex-direction:column;gap:8px;">';
        html += '<div style="font-size:13px;font-weight:700;color:#2D3436;">&#128260; إنشاء نشاط سحب وإفلات</div>';
        html += '<div><label style="' + creatorLabelStyle + '">عنوان النشاط</label>';
        html += '<input type="text" id="ddTitle" placeholder="رتب الخطوات بالترتيب الصحيح" style="' + creatorInputStyle + '"></div>';
        html += '<label style="' + creatorLabelStyle + '">العناصر (بالترتيب الصحيح)</label>';
        html += '<div id="ddItemsContainer">';
        for (var i = 0; i < 3; i++) {
            html += '<div style="display:flex;gap:4px;align-items:center;margin-bottom:4px;">';
            html += '<span style="font-size:11px;color:#B2BEC3;width:18px;text-align:center;">' + (i + 1) + '</span>';
            html += '<input type="text" class="dd-creator-item" dir="ltr" placeholder="السطر ' + (i + 1) + '" style="' + creatorInputStyle + 'margin:0;font-family:var(--font-mono);direction:ltr;text-align:left;">';
            if (i >= 2) html += '<button onclick="this.parentElement.remove();renumberDDItems()" style="background:none;border:none;color:#d63031;cursor:pointer;font-size:14px;flex-shrink:0;">&#10006;</button>';
            html += '</div>';
        }
        html += '</div>';
        html += '<button onclick="addDDItem()" style="background:none;border:1px dashed rgba(180,140,210,0.3);color:#636E72;padding:4px;border-radius:var(--radius-sm);font-family:var(--font-ar);font-size:11px;cursor:pointer;">+ إضافة عنصر</button>';
        html += '<div><label style="' + creatorLabelStyle + '">الوقت (ثانية)</label>';
        html += '<select id="ddTime" style="' + creatorInputStyle + '"><option value="60">60</option><option value="90" selected>90</option><option value="120">120</option><option value="180">180</option></select></div>';
        html += '<button onclick="launchCreatedDragDrop()" style="' + creatorBtnStyle + '">&#9654; إطلاق النشاط</button>';
        html += '<button onclick="showTeacherActivityLauncherGlobal()" style="' + creatorBackBtnStyle + '">&#8594; رجوع</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    window.addDDItem = function () {
        var c = document.getElementById('ddItemsContainer');
        if (!c) return;
        var count = c.querySelectorAll('.dd-creator-item').length;
        if (count >= 8) return;
        var div = document.createElement('div');
        div.style.cssText = 'display:flex;gap:4px;align-items:center;margin-bottom:4px;';
        div.innerHTML = '<span style="font-size:11px;color:#B2BEC3;width:18px;text-align:center;">' + (count + 1) + '</span>' +
            '<input type="text" class="dd-creator-item" dir="ltr" placeholder="السطر ' + (count + 1) + '" style="' + creatorInputStyle + 'margin:0;font-family:var(--font-mono);direction:ltr;text-align:left;">' +
            '<button onclick="this.parentElement.remove();renumberDDItems()" style="background:none;border:none;color:#d63031;cursor:pointer;font-size:14px;flex-shrink:0;">&#10006;</button>';
        c.appendChild(div);
    };

    window.renumberDDItems = function () {
        var c = document.getElementById('ddItemsContainer');
        if (!c) return;
        c.querySelectorAll('span').forEach(function (s, i) { s.textContent = i + 1; });
    };

    window.launchCreatedDragDrop = function () {
        var title = document.getElementById('ddTitle');
        if (!title || !title.value.trim()) { showToast('أدخل عنوان النشاط', 'warning'); return; }
        var inputs = document.querySelectorAll('.dd-creator-item');
        var items = [];
        inputs.forEach(function (inp) { if (inp.value.trim()) items.push(inp.value.trim()); });
        if (items.length < 2) { showToast('أدخل عنصرين على الأقل', 'warning'); return; }
        var correctOrder = items.map(function (_, i) { return i; });
        var timeLimit = parseInt(document.getElementById('ddTime').value, 10) || 90;
        startActivity({
            type: 'dragdrop', id: 'dd_' + Date.now(), title: title.value.trim(),
            items: items, correctOrder: correctOrder, timeLimit: timeLimit
        });
    };

    function showFillBlankCreator(container) {
        var html = '<div dir="rtl" style="display:flex;flex-direction:column;gap:8px;">';
        html += '<div style="font-size:13px;font-weight:700;color:#2D3436;">&#9999; إنشاء نشاط أكمل الكود</div>';
        html += '<div><label style="' + creatorLabelStyle + '">عنوان النشاط</label>';
        html += '<input type="text" id="fbTitle" placeholder="أكمل الكود التالي" style="' + creatorInputStyle + '"></div>';
        html += '<label style="' + creatorLabelStyle + '">أسطر الكود (استخدم ____ للفراغات)</label>';
        html += '<div id="fbLinesContainer">';
        html += buildFBLineInput(0, 'x = ____', '5');
        html += buildFBLineInput(1, 'print(____)', 'x');
        html += '</div>';
        html += '<button onclick="addFBLine()" style="background:none;border:1px dashed rgba(180,140,210,0.3);color:#636E72;padding:4px;border-radius:var(--radius-sm);font-family:var(--font-ar);font-size:11px;cursor:pointer;">+ إضافة سطر</button>';
        html += '<div><label style="' + creatorLabelStyle + '">الوقت (ثانية)</label>';
        html += '<select id="fbTime" style="' + creatorInputStyle + '"><option value="60">60</option><option value="90">90</option><option value="120" selected>120</option><option value="180">180</option></select></div>';
        html += '<button onclick="launchCreatedFillBlank()" style="' + creatorBtnStyle + '">&#9654; إطلاق النشاط</button>';
        html += '<button onclick="showTeacherActivityLauncherGlobal()" style="' + creatorBackBtnStyle + '">&#8594; رجوع</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    function buildFBLineInput(idx, codePlaceholder, ansPlaceholder) {
        return '<div class="fb-line-group" style="margin-bottom:6px;padding:6px;background:rgba(240,230,250,0.4);border-radius:var(--radius-sm);">' +
            '<div style="display:flex;gap:4px;align-items:center;margin-bottom:3px;">' +
            '<input type="text" class="fb-creator-line" dir="ltr" placeholder="' + (codePlaceholder || 'code ____') + '" style="' + creatorInputStyle + 'margin:0;font-family:var(--font-mono);direction:ltr;text-align:left;">' +
            (idx >= 2 ? '<button onclick="this.closest(\'.fb-line-group\').remove()" style="background:none;border:none;color:#d63031;cursor:pointer;font-size:14px;flex-shrink:0;">&#10006;</button>' : '') +
            '</div>' +
            '<input type="text" class="fb-creator-answer" dir="ltr" placeholder="الإجابة: ' + (ansPlaceholder || '') + '" style="' + creatorInputStyle + 'margin:0;font-size:11px;background:rgba(235,91,0,0.05);direction:ltr;text-align:left;">' +
            '</div>';
    }

    window.addFBLine = function () {
        var c = document.getElementById('fbLinesContainer');
        if (!c) return;
        var count = c.querySelectorAll('.fb-creator-line').length;
        if (count >= 8) return;
        c.insertAdjacentHTML('beforeend', buildFBLineInput(count, '', ''));
    };

    window.launchCreatedFillBlank = function () {
        var title = document.getElementById('fbTitle');
        if (!title || !title.value.trim()) { showToast('أدخل عنوان النشاط', 'warning'); return; }
        var lineInputs = document.querySelectorAll('.fb-creator-line');
        var answerInputs = document.querySelectorAll('.fb-creator-answer');
        var lines = [];
        lineInputs.forEach(function (inp, i) {
            var text = inp.value.trim();
            if (!text) return;
            var answer = answerInputs[i] ? answerInputs[i].value.trim() : '';
            if (text.indexOf('____') !== -1 && answer) {
                lines.push({ text: text, blanks: [{ position: 0, answer: answer }] });
            } else {
                lines.push({ text: text, blanks: [] });
            }
        });
        if (lines.length < 1) { showToast('أدخل سطراً واحداً على الأقل', 'warning'); return; }
        var timeLimit = parseInt(document.getElementById('fbTime').value, 10) || 120;
        startActivity({
            type: 'fillblank', id: 'fb_' + Date.now(), title: title.value.trim(),
            lines: lines, timeLimit: timeLimit
        });
    };

    function showCodeCreator(container) {
        var html = '<div dir="rtl" style="display:flex;flex-direction:column;gap:8px;">';
        html += '<div style="font-size:13px;font-weight:700;color:#2D3436;">&#128187; إنشاء تحدي كود</div>';
        html += '<div><label style="' + creatorLabelStyle + '">عنوان التحدي</label>';
        html += '<input type="text" id="codeCreatorTitle" placeholder="اكتب دالة تجمع رقمين" style="' + creatorInputStyle + '"></div>';
        html += '<div><label style="' + creatorLabelStyle + '">وصف التحدي</label>';
        html += '<textarea id="codeCreatorDesc" rows="2" placeholder="الوصف التفصيلي..." style="' + creatorInputStyle + 'resize:vertical;"></textarea></div>';
        html += '<div><label style="' + creatorLabelStyle + '">كود البداية</label>';
        html += '<textarea id="codeCreatorStarter" rows="3" dir="ltr" placeholder="# starter code" style="' + creatorInputStyle + 'resize:vertical;font-family:var(--font-mono);direction:ltr;text-align:left;"></textarea></div>';
        html += '<div><label style="' + creatorLabelStyle + '">الوقت (ثانية)</label>';
        html += '<select id="codeCreatorTime" style="' + creatorInputStyle + '"><option value="120">120</option><option value="180" selected>180</option><option value="300">300</option><option value="600">600</option></select></div>';
        html += '<button onclick="launchCreatedCode()" style="' + creatorBtnStyle + '">&#9654; إطلاق النشاط</button>';
        html += '<button onclick="showTeacherActivityLauncherGlobal()" style="' + creatorBackBtnStyle + '">&#8594; رجوع</button>';
        html += '</div>';
        container.innerHTML = html;
    }

    window.launchCreatedCode = function () {
        var title = document.getElementById('codeCreatorTitle');
        if (!title || !title.value.trim()) { showToast('أدخل عنوان التحدي', 'warning'); return; }
        var desc = document.getElementById('codeCreatorDesc');
        var starter = document.getElementById('codeCreatorStarter');
        var timeLimit = parseInt(document.getElementById('codeCreatorTime').value, 10) || 180;
        startActivity({
            type: 'code', id: 'code_' + Date.now(), title: title.value.trim(),
            description: desc ? desc.value.trim() : '',
            starterCode: starter ? starter.value : '',
            timeLimit: timeLimit
        });
    };

    window.showTeacherActivityLauncherGlobal = function () {
        showTeacherActivityLauncher();
    };

    // -----------------------------------------------------------------------
    // Programming Activity Templates (~20)
    // -----------------------------------------------------------------------

    var ACTIVITY_TEMPLATES = [
        // === Variables & Data Types ===
        { topic: 'variables', topicAr: 'المتغيرات وأنواع البيانات', icon: '&#128230;',
          data: { type:'mcq', title:'ما هو المتغير في البرمجة؟', options:['قيمة ثابتة لا تتغير','مكان لتخزين البيانات في الذاكرة','نوع خاص من الدوال','أمر لطباعة النصوص'], correct:1, timeLimit:60 }},
        { topic: 'variables', topicAr: 'المتغيرات وأنواع البيانات', icon: '&#128230;',
          data: { type:'mcq', title:'ما نوع القيمة 3.14 في Python؟', options:['int','str','float','bool'], correct:2, timeLimit:45 }},
        { topic: 'variables', topicAr: 'المتغيرات وأنواع البيانات', icon: '&#128230;',
          data: { type:'fillblank', title:'أكمل كود المتغيرات', lines:[
            {text:'x = ____', blanks:[{position:0,answer:'5'}]},
            {text:'y = x + ____', blanks:[{position:0,answer:'10'}]},
            {text:'print(____)', blanks:[{position:0,answer:'y'}]}
          ], timeLimit:120 }},
        { topic: 'variables', topicAr: 'المتغيرات وأنواع البيانات', icon: '&#128230;',
          data: { type:'dragdrop', title:'رتب عمليات المتغيرات بالترتيب الصحيح', items:['name = "أحمد"','age = 15','print(name)','print(age)'], correctOrder:[0,1,2,3], timeLimit:90 }},

        // === Conditionals ===
        { topic: 'conditionals', topicAr: 'الشروط', icon: '&#128256;',
          data: { type:'mcq', title:'ماذا تعني elif في Python؟', options:['نهاية الشرط','شرط بديل إذا لم يتحقق الشرط السابق','تكرار الشرط','طباعة النتيجة'], correct:1, timeLimit:60 }},
        { topic: 'conditionals', topicAr: 'الشروط', icon: '&#128256;',
          data: { type:'fillblank', title:'أكمل الجملة الشرطية', lines:[
            {text:'x = 15', blanks:[]},
            {text:'if x ____ 10:', blanks:[{position:0,answer:'>'}]},
            {text:'    print("كبير")', blanks:[]}
          ], timeLimit:90 }},
        { topic: 'conditionals', topicAr: 'الشروط', icon: '&#128256;',
          data: { type:'dragdrop', title:'رتب كتلة if/elif/else', items:['if score >= 90:','    print("ممتاز")','elif score >= 60:','    print("جيد")','else:','    print("حاول مرة أخرى")'], correctOrder:[0,1,2,3,4,5], timeLimit:120 }},

        // === Loops ===
        { topic: 'loops', topicAr: 'الحلقات', icon: '&#128260;',
          data: { type:'mcq', title:'كم مرة تعمل for i in range(3)؟', options:['1 مرة','2 مرات','3 مرات','4 مرات'], correct:2, timeLimit:45 }},
        { topic: 'loops', topicAr: 'الحلقات', icon: '&#128260;',
          data: { type:'fillblank', title:'أكمل حلقة for', lines:[
            {text:'for i in range(____):', blanks:[{position:0,answer:'5'}]},
            {text:'    print(____)', blanks:[{position:0,answer:'i'}]}
          ], timeLimit:90 }},
        { topic: 'loops', topicAr: 'الحلقات', icon: '&#128260;',
          data: { type:'dragdrop', title:'رتب أجزاء حلقة while', items:['count = 0','while count < 5:','    print(count)','    count = count + 1'], correctOrder:[0,1,2,3], timeLimit:90 }},

        // === Functions ===
        { topic: 'functions', topicAr: 'الدوال', icon: '&#9881;',
          data: { type:'fillblank', title:'أكمل تعريف الدالة', lines:[
            {text:'def ____():', blanks:[{position:0,answer:'greet'}]},
            {text:'    return "____"', blanks:[{position:0,answer:'مرحبا'}]}
          ], timeLimit:90 }},
        { topic: 'functions', topicAr: 'الدوال', icon: '&#9881;',
          data: { type:'code', title:'اكتب دالة تجمع رقمين', description:'اكتب دالة اسمها add تأخذ معاملين a و b وترجع مجموعهما', starterCode:'def add(a, b):\n    # اكتب الكود هنا\n    pass', timeLimit:180 }},
        { topic: 'functions', topicAr: 'الدوال', icon: '&#9881;',
          data: { type:'dragdrop', title:'رتب: تعريف دالة → استدعاء → طباعة', items:['def square(n):','    return n * n','result = square(4)','print(result)'], correctOrder:[0,1,2,3], timeLimit:90 }},

        // === Output Prediction / Debugging ===
        { topic: 'debugging', topicAr: 'التنبؤ والتصحيح', icon: '&#128027;',
          data: { type:'mcq', title:'ما ناتج print(2 + "3") في Python؟', options:['23','5','TypeError','None'], correct:2, timeLimit:45 }},
        { topic: 'debugging', topicAr: 'التنبؤ والتصحيح', icon: '&#128027;',
          data: { type:'mcq', title:'ما ناتج print(len("hello"))؟', options:['4','5','6','hello'], correct:1, timeLimit:45 }},
        { topic: 'debugging', topicAr: 'التنبؤ والتصحيح', icon: '&#128027;',
          data: { type:'mcq', title:'ما ناتج print(10 // 3)؟', options:['3.33','3','4','1'], correct:1, timeLimit:45 }},
        { topic: 'debugging', topicAr: 'التنبؤ والتصحيح', icon: '&#128027;',
          data: { type:'code', title:'اعثر على الخطأ وأصلحه', description:'هذا الكود يحاول طباعة مجموع قائمة أرقام لكن فيه خطأ. أصلحه.', starterCode:'numbers = [1, 2, 3, 4, 5]\ntotal = 0\nfor n in numbers\n    total = total + n\nprint(total)', timeLimit:180 }},

        // === Lists & Strings ===
        { topic: 'lists', topicAr: 'القوائم والنصوص', icon: '&#128220;',
          data: { type:'mcq', title:'ما ناتج "hello"[1] في Python؟', options:['h','e','l','o'], correct:1, timeLimit:45 }},
        { topic: 'lists', topicAr: 'القوائم والنصوص', icon: '&#128220;',
          data: { type:'fillblank', title:'أكمل كود القائمة', lines:[
            {text:'fruits = [____, ____, ____]', blanks:[{position:0,answer:'"تفاح", "موز", "برتقال"'}]},
            {text:'print(fruits[0])', blanks:[]}
          ], timeLimit:120 }},
        { topic: 'lists', topicAr: 'القوائم والنصوص', icon: '&#128220;',
          data: { type:'dragdrop', title:'رتب عمليات القائمة', items:['colors = []','colors.append("أحمر")','colors.append("أزرق")','colors.sort()','print(colors)'], correctOrder:[0,1,2,3,4], timeLimit:90 }}
    ];

    window.launchTemplate = function (idx) {
        var tmpl = ACTIVITY_TEMPLATES[idx];
        if (!tmpl) return;
        var data = JSON.parse(JSON.stringify(tmpl.data));
        data.id = data.type + '_' + Date.now();
        startActivity(data);
    };

    // -----------------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------------

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function animateNumber(el, from, to, duration) {
        var startTime = null;
        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            el.textContent = Math.floor(from + (to - from) * progress);
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }

    // -----------------------------------------------------------------------
    // Override the placeholder startActivity and toggleActivitiesPanel
    // from the room template
    // -----------------------------------------------------------------------

    window.toggleActivitiesPanel = function () {
        // Switch to the activities tab in center panel
        if (typeof switchTopTab === 'function') {
            switchTopTab('activities');
        }
    };

    // -----------------------------------------------------------------------
    // Initialize on DOM ready
    // -----------------------------------------------------------------------

    document.addEventListener('DOMContentLoaded', function () {
        // Set initial idle state
        setTimeout(function () {
            showActivityIdle();
        }, 500);
    });

})();
