/* === Q&A Panel - Real-time Questions === */

let questions = [];
let questionVotes = {};

function initQnA() {
    const list = document.getElementById('qnaList');
    if (list) {
        list.innerHTML = `
            <div class="qna-empty">
                <div style="font-size: 2rem; margin-bottom: 8px;">❓</div>
                <p>لا توجد أسئلة بعد</p>
                <p style="font-size: 12px; opacity: 0.6;">كن أول من يسأل!</p>
            </div>
        `;
    }
    questions = [];
    questionVotes = {};
}

/* ---------- Submit Question ---------- */

function submitQuestion() {
    const input = document.getElementById('qnaInput') || document.getElementById('questionInput');
    if (!input || !input.value.trim()) return;

    const text = input.value.trim();
    input.value = '';

    const questionData = {
        id: 'q_' + Date.now(),
        question_text: text,
        student_id: typeof USER_ID !== 'undefined' ? USER_ID : 0,
        student_name: typeof USER_NAME !== 'undefined' ? USER_NAME : 'طالب',
        timestamp: new Date().toISOString(),
        votes: 0,
        answered: false,
    };

    // Emit via SocketIO
    if (typeof emitQuestion === 'function' && typeof SESSION_ID !== 'undefined') {
        emitQuestion(SESSION_ID, text);
    }

    // Add locally
    addQuestion(questionData);
}

/* ---------- Add Question to UI ---------- */

function addQuestion(data) {
    const list = document.getElementById('qnaList');
    if (!list) return;

    // Remove empty placeholder
    const empty = list.querySelector('.qna-empty');
    if (empty) empty.remove();

    // Avoid duplicates
    if (data.id && document.getElementById(data.id)) return;

    const isTeacher = typeof IS_TEACHER !== 'undefined' && IS_TEACHER;

    const item = document.createElement('div');
    item.className = 'qna-item' + (data.answered ? ' answered' : '');
    item.id = data.id || 'q_' + Date.now();
    item.innerHTML = `
        <div class="qna-item-content">
            <div class="qna-question">${escapeHtml(data.question_text)}</div>
            <div class="qna-meta">
                <span class="qna-author">${escapeHtml(data.student_name || 'طالب')}</span>
                <span class="qna-time">${data.timestamp ? formatTimeShort(data.timestamp) : 'الآن'}</span>
            </div>
        </div>
        <div class="qna-actions">
            <button class="qna-vote-btn" onclick="voteQuestion('${item.id}')" title="تصويت">
                👍 <span class="qna-vote-count">${data.votes || 0}</span>
            </button>
            ${isTeacher ? `<button class="qna-answer-btn" onclick="markAnswered('${item.id}')" title="تم الإجابة">✅</button>` : ''}
        </div>
    `;

    // Insert at top (newest first)
    list.insertBefore(item, list.firstChild);
    questions.push(data);

    // Scroll to top
    list.scrollTop = 0;
}

/* ---------- Vote & Answer ---------- */

function voteQuestion(questionId) {
    if (questionVotes[questionId]) return; // Already voted
    questionVotes[questionId] = true;

    const item = document.getElementById(questionId);
    if (!item) return;

    const countEl = item.querySelector('.qna-vote-count');
    if (countEl) {
        const current = parseInt(countEl.textContent) || 0;
        countEl.textContent = current + 1;
    }

    const btn = item.querySelector('.qna-vote-btn');
    if (btn) btn.classList.add('voted');
}

function markAnswered(questionId) {
    const item = document.getElementById(questionId);
    if (item) {
        item.classList.add('answered');
        const btn = item.querySelector('.qna-answer-btn');
        if (btn) btn.textContent = '✅ تمت الإجابة';
    }
}

/* ---------- Helpers ---------- */

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeShort(dateStr) {
    try {
        const d = new Date(dateStr);
        const h = d.getHours().toString().padStart(2, '0');
        const m = d.getMinutes().toString().padStart(2, '0');
        return `${h}:${m}`;
    } catch {
        return 'الآن';
    }
}
