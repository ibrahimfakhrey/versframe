/* === Code Editor (CodeMirror 6 + Pyodide) === */

let editorView = null;
let pyodide = null;
let pyodideReady = false;
let pyodideLoading = false;

/* ---------- Editor Initialization ---------- */

function initEditor(containerId) {
    const container = document.getElementById(containerId || 'codeEditorContainer');
    if (!container) return;

    // Try CodeMirror 6 if available, else textarea fallback
    if (typeof window.CodeMirror !== 'undefined') {
        initCodeMirror(container);
    } else {
        initTextareaEditor(container);
    }

    // Start lazy-loading Pyodide in background
    loadPyodideAsync();
}

function initTextareaEditor(container) {
    // Check if textarea already exists
    if (document.getElementById('codeTextarea')) return;

    const textarea = document.createElement('textarea');
    textarea.id = 'codeTextarea';
    textarea.dir = 'ltr';
    textarea.spellcheck = false;
    textarea.placeholder = '# اكتب كودك هنا...\nprint("مرحباً بالعالم!")';
    textarea.value = '# اكتب كودك هنا\nprint("مرحباً بالعالم!")';
    textarea.style.cssText = `
        width: 100%; height: 100%; min-height: 200px;
        background: #1a1a2e; color: #e0e0e0;
        border: none; padding: 16px;
        font-family: 'Fira Code', 'Cascadia Code', 'Consolas', monospace;
        font-size: 14px; line-height: 1.6;
        resize: none; tab-size: 4;
        outline: none;
    `;

    // Tab key support
    textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            textarea.value = textarea.value.substring(0, start) + '    ' + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + 4;
        }
    });

    container.appendChild(textarea);
}

function initCodeMirror(container) {
    // CodeMirror 6 integration (when loaded via CDN)
    // For now, fall back to textarea
    initTextareaEditor(container);
}

/* ---------- Code Get/Set ---------- */

function setEditorCode(code) {
    const textarea = document.getElementById('codeTextarea');
    if (textarea) {
        textarea.value = code;
        // Flash animation to show code was received
        textarea.style.borderColor = '#EB5B00';
        setTimeout(() => { textarea.style.borderColor = 'transparent'; }, 1000);
    }
}

function getEditorCode() {
    const textarea = document.getElementById('codeTextarea');
    return textarea ? textarea.value : '';
}

/* ---------- Pyodide (Python Runtime) ---------- */

async function loadPyodideAsync() {
    if (pyodideReady || pyodideLoading) return;
    pyodideLoading = true;

    try {
        if (typeof loadPyodide === 'undefined') {
            // Load Pyodide script dynamically
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/pyodide.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
        }

        const output = document.getElementById('codeOutput');
        if (output) output.textContent = 'جاري تحميل بيئة بايثون...';

        pyodide = await loadPyodide({
            indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.24.1/full/',
        });
        pyodideReady = true;
        pyodideLoading = false;

        if (output) output.textContent = 'بيئة بايثون جاهزة! اضغط "شغّل الكود" ▶';
        console.log('Pyodide loaded successfully');
    } catch (err) {
        pyodideLoading = false;
        console.warn('Pyodide load failed (will use fallback):', err.message);
    }
}

async function runCode() {
    const code = getEditorCode();
    const output = document.getElementById('codeOutput');
    const runBtn = document.getElementById('runCodeBtn');
    if (!output) return;

    // Show running state
    output.textContent = 'جاري التشغيل...';
    output.className = 'room-code-output running';
    if (runBtn) {
        runBtn.disabled = true;
        runBtn.textContent = '⏳ جاري...';
    }

    try {
        // Try Pyodide if available
        if (!pyodideReady && typeof loadPyodide !== 'undefined') {
            await loadPyodideAsync();
        }

        if (pyodideReady && pyodide) {
            // Redirect stdout
            pyodide.runPython(`
import sys
from io import StringIO
_sv_stdout = StringIO()
_sv_stderr = StringIO()
sys.stdout = _sv_stdout
sys.stderr = _sv_stderr
`);
            try {
                pyodide.runPython(code);
                const stdout = pyodide.runPython('_sv_stdout.getvalue()');
                const stderr = pyodide.runPython('_sv_stderr.getvalue()');

                if (stderr) {
                    output.textContent = stderr;
                    output.className = 'room-code-output error';
                } else {
                    output.textContent = stdout || '(تم التنفيذ بنجاح - لا يوجد مخرجات)';
                    output.className = 'room-code-output success';
                }
            } catch (pyErr) {
                output.textContent = pyErr.message;
                output.className = 'room-code-output error';
            } finally {
                // Restore stdout
                pyodide.runPython('sys.stdout = sys.__stdout__; sys.stderr = sys.__stderr__');
            }
        } else {
            // Fallback: simple Python-like output simulation
            output.textContent = 'بيئة Pyodide غير متاحة حاليا. يتم تحميلها في الخلفية...';
            output.className = 'room-code-output warning';
            loadPyodideAsync(); // Try loading again
        }
    } catch (err) {
        output.textContent = 'خطأ: ' + err.message;
        output.className = 'room-code-output error';
    } finally {
        if (runBtn) {
            runBtn.disabled = false;
            runBtn.textContent = '▶ شغّل الكود';
        }
    }
}

/* ---------- Teacher/Student Code Sharing ---------- */

function broadcastCode() {
    const code = getEditorCode();
    if (typeof emitCodeBroadcast === 'function' && typeof SESSION_ID !== 'undefined') {
        emitCodeBroadcast(SESSION_ID, code);
        if (typeof showToast === 'function') showToast('تم إرسال الكود للطلاب', 'success');
    }
}

function submitCode() {
    const code = getEditorCode();
    if (typeof emitCodeSubmit === 'function' && typeof SESSION_ID !== 'undefined' && typeof USER_ID !== 'undefined') {
        emitCodeSubmit(SESSION_ID, USER_ID, code);
        if (typeof showToast === 'function') showToast('تم تسليم الكود للمعلم', 'success');
    }
}

/* ---------- Fill-in-the-Blank Exercises ---------- */

function initFillBlankExercise(exerciseData) {
    // exerciseData: { lines: [{text, blanks: [{position, answer, hint}]}], task: string }
    const container = document.getElementById('fillBlankExercise');
    if (!container || !exerciseData) return;

    let html = '';
    if (exerciseData.task) {
        html += `<div class="room-task-card"><strong>المهمة:</strong> ${exerciseData.task}</div>`;
    }

    html += '<div class="fill-blank-code" dir="ltr">';
    exerciseData.lines.forEach((line, i) => {
        html += `<div class="code-line"><span class="line-num">${i + 1}</span>`;
        let text = line.text;
        if (line.blanks) {
            line.blanks.forEach((blank, j) => {
                const inputId = `blank_${i}_${j}`;
                const placeholder = blank.hint || '____';
                text = text.replace('____',
                    `<input type="text" id="${inputId}" class="room-code-blank" placeholder="${placeholder}" data-answer="${blank.answer || ''}" autocomplete="off" dir="ltr">`
                );
            });
        }
        html += `<span class="code-text">${text}</span></div>`;
    });
    html += '</div>';

    container.innerHTML = html;
}

function checkFillBlanks() {
    const blanks = document.querySelectorAll('.room-code-blank');
    let correct = 0;
    let total = blanks.length;

    blanks.forEach(input => {
        const answer = input.dataset.answer;
        const value = input.value.trim();
        if (answer && value === answer) {
            input.classList.add('correct');
            input.classList.remove('incorrect');
            correct++;
        } else if (value) {
            input.classList.add('incorrect');
            input.classList.remove('correct');
        }
    });

    return { correct, total };
}

/* ---------- Code Submit Handler (teacher view) ---------- */

function handleCodeSubmit(data) {
    // Show student code submission to teacher
    const panel = document.getElementById('studentSubmissions');
    if (!panel) return;

    const entry = document.createElement('div');
    entry.className = 'student-code-submission';
    entry.innerHTML = `
        <div class="submission-header">
            <span class="submission-student">${data.student_name || 'طالب #' + data.student_id}</span>
            <span class="submission-time">${new Date().toLocaleTimeString('ar-EG')}</span>
        </div>
        <pre class="submission-code" dir="ltr">${escapeCodeHtml(data.code_content)}</pre>
    `;
    panel.insertBefore(entry, panel.firstChild);
}

function escapeCodeHtml(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
