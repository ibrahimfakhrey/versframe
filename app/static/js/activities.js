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
        var card = document.querySelector('.room-activity-card');
        if (!card) return;

        var liveBadge = card.querySelector('.room-activity-live');
        if (liveBadge) {
            liveBadge.style.display = active ? 'inline-flex' : 'none';
        }
    }

    function showActivityIdle() {
        var contentArea = document.getElementById('activityContent');
        if (contentArea) {
            contentArea.innerHTML =
                '<div style="text-align:center;padding:20px 10px;color:rgba(255,255,255,0.4);">' +
                '<div style="font-size:2rem;margin-bottom:8px;">&#127919;</div>' +
                '<p style="font-size:13px;">لا يوجد نشاط حالياً</p>' +
                '<p style="font-size:11px;margin-top:4px;">سيظهر النشاط عندما يبدأه المعلم</p>' +
                '</div>';
        }

        updateTimerDisplay(0);
        updateActivityProgress(0, 1);

        var liveBadge = document.querySelector('.room-activity-card .room-activity-live');
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
                contentArea.innerHTML = '<p style="color:rgba(255,255,255,0.5);text-align:center;">نوع النشاط غير معروف</p>';
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
        html += '<div class="dragdrop-hint" style="font-size:11px;color:rgba(255,255,255,0.45);margin-bottom:8px;">اسحب العناصر لترتيبها بالترتيب الصحيح</div>';
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
            html += '<div class="activity-code-desc" style="font-size:12px;color:rgba(255,255,255,0.6);margin-bottom:8px;">' + escapeHtml(data.description) + '</div>';
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
        }

        stopActivityCountdown();
    };

    // -----------------------------------------------------------------------
    // Skill Snapshot
    // -----------------------------------------------------------------------

    /**
     * updateSkillSnapshot(skills) - Updates skill progress bars in the
     * Skill Snapshot card.
     * skills: [{ name: string, progress: 0-100, color?: string }]
     */
    window.updateSkillSnapshot = function (skills) {
        var card = document.getElementById('skillCard');
        if (!card) {
            card = document.querySelector('.room-skill-card');
        }
        if (!card || !skills || !skills.length) return;

        var html = '<div class="card-header">';
        html += '<span class="card-title">&#128200; لقطة المهارة</span>';
        html += '</div>';

        skills.forEach(function (skill) {
            var color = skill.color || 'linear-gradient(90deg, var(--sv-purple), #a29bfe)';
            html += '<div class="skill-snapshot-item">';
            html += '<div class="skill-snapshot-header">';
            html += '<span class="skill-snapshot-name">' + escapeHtml(skill.name) + '</span>';
            html += '<span class="skill-snapshot-pct">' + skill.progress + '%</span>';
            html += '</div>';
            html += '<div class="progress-bar-track">';
            html += '<div class="progress-bar-fill skill-bar-animated" style="width:' + skill.progress + '%;background:' + color + ';"></div>';
            html += '</div>';
            html += '</div>';
        });

        card.innerHTML = html;
    };

    // -----------------------------------------------------------------------
    // Teacher: Activity Launcher Panel
    // -----------------------------------------------------------------------

    function showTeacherActivityLauncher() {
        var contentArea = document.getElementById('activityContent');
        if (!contentArea || !window.IS_TEACHER) return;

        var html = '<div class="teacher-activity-launcher" dir="rtl">';

        html += '<div style="font-size:13px;font-weight:700;margin-bottom:10px;color:rgba(255,255,255,0.8);">اختر نوع النشاط:</div>';

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

        // Quick-launch demo activities
        html += '<div style="margin-top:12px;border-top:1px solid rgba(255,255,255,0.08);padding-top:10px;">';
        html += '<div style="font-size:11px;color:rgba(255,255,255,0.4);margin-bottom:6px;">أنشطة سريعة (تجريبي):</div>';
        html += '<button class="activity-action-btn" style="margin-bottom:4px;font-size:11px;padding:6px;" onclick="launchDemoActivity(\'mcq\')">تجربة MCQ</button>';
        html += '<button class="activity-action-btn" style="margin-bottom:4px;font-size:11px;padding:6px;background:var(--sv-purple);" onclick="launchDemoActivity(\'dragdrop\')">تجربة سحب وإفلات</button>';
        html += '<button class="activity-action-btn" style="margin-bottom:4px;font-size:11px;padding:6px;background:linear-gradient(135deg,#00b894,#00cec9);" onclick="launchDemoActivity(\'fillblank\')">تجربة أكمل الكود</button>';
        html += '</div>';

        html += '</div>';

        contentArea.innerHTML = html;
    }

    window.showActivityCreator = function (type) {
        if (typeof showToast === 'function') {
            showToast('منشئ الأنشطة - ' + type + ' - قريباً!', 'info');
        }
    };

    /**
     * launchDemoActivity - Quick launch of a demo activity for testing.
     */
    window.launchDemoActivity = function (type) {
        var demoActivities = {
            mcq: {
                type: 'mcq',
                id: 'demo_mcq_' + Date.now(),
                title: 'ما هو المتغير؟',
                options: ['قيمة ثابتة', 'مكان لتخزين البيانات', 'نوع من الدوال', 'جزء من الذاكرة لا يمكن تغييره'],
                correct: 1,
                timeLimit: 60,
            },
            dragdrop: {
                type: 'dragdrop',
                id: 'demo_dd_' + Date.now(),
                title: 'رتب خطوات البرنامج',
                items: ['print("مرحبا")', 'x = 5', 'print(x)', 'y = x + 10'],
                correctOrder: [1, 0, 2, 3],
                timeLimit: 90,
            },
            fillblank: {
                type: 'fillblank',
                id: 'demo_fb_' + Date.now(),
                title: 'أكمل الكود',
                lines: [
                    { text: 'x = ____', blanks: [{ position: 0, answer: '5' }] },
                    { text: 'y = x + ____', blanks: [{ position: 0, answer: '10' }] },
                    { text: 'print(____)', blanks: [{ position: 0, answer: 'y' }] },
                ],
                timeLimit: 120,
            },
        };

        var activity = demoActivities[type];
        if (activity) {
            startActivity(activity);
        }
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
        // Scroll to the activity card on mobile or show it
        var card = document.querySelector('.room-activity-card');
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (typeof showToast === 'function') showToast('لوحة الأنشطة', 'info');
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
