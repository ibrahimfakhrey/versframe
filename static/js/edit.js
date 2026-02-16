// ─── Edit Mode Toggle ────────────────────────────────────────────────
const editToggle = document.getElementById('edit-toggle');
if (editToggle) {
    editToggle.addEventListener('click', () => {
        document.body.classList.toggle('edit-mode');
        const isEdit = document.body.classList.contains('edit-mode');
        editToggle.innerHTML = isEdit ? '✕ إغلاق التعديل' : '✏️ وضع التعديل';
    });
}

// ─── Toast Notification ──────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = 'toast ' + type + ' show';
    setTimeout(() => { toast.classList.remove('show'); }, 2500);
}

// ─── API Helper ──────────────────────────────────────────────────────
async function apiCall(url, method, body) {
    try {
        const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Request failed');
        return data;
    } catch (err) {
        showToast('خطأ: ' + err.message, 'error');
        throw err;
    }
}

// ─── Inline Editing ──────────────────────────────────────────────────
function startInlineEdit(btn) {
    const field = btn.closest('.editable-field');
    if (!field || field.querySelector('.inline-edit-container')) return;

    const textEl = field.querySelector('.editable-text');
    if (!textEl) return;

    const originalText = textEl.textContent.trim();
    const apiUrl = field.dataset.apiUrl;
    const fieldName = field.dataset.fieldName;

    textEl.style.display = 'none';
    btn.style.display = 'none';

    const container = document.createElement('div');
    container.className = 'inline-edit-container';

    const textarea = document.createElement('textarea');
    textarea.value = originalText;
    textarea.rows = Math.max(2, Math.ceil(originalText.length / 50));

    const actions = document.createElement('div');
    actions.className = 'inline-edit-actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'inline-save-btn';
    saveBtn.textContent = 'حفظ';
    saveBtn.onclick = async () => {
        const newVal = textarea.value.trim();
        if (newVal === originalText) {
            cancelEdit();
            return;
        }
        try {
            await apiCall(apiUrl, 'PUT', { [fieldName]: newVal });
            textEl.textContent = newVal;
            showToast('تم الحفظ بنجاح');
            cancelEdit();
        } catch (e) { /* toast already shown */ }
    };

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'inline-cancel-btn';
    cancelBtn.textContent = 'إلغاء';
    cancelBtn.onclick = cancelEdit;

    function cancelEdit() {
        container.remove();
        textEl.style.display = '';
        btn.style.display = '';
    }

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    container.appendChild(textarea);
    container.appendChild(actions);
    field.appendChild(container);
    textarea.focus();
}

// ─── Modal System ────────────────────────────────────────────────────
const modalOverlay = document.getElementById('modal-overlay');

function openModal(title, fields, onSave) {
    if (!modalOverlay) return;
    document.getElementById('modal-title').textContent = title;

    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    fields.forEach(f => {
        const group = document.createElement('div');
        group.className = 'form-group';

        const label = document.createElement('label');
        label.textContent = f.label;
        group.appendChild(label);

        let input;
        if (f.type === 'select') {
            input = document.createElement('select');
            f.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (opt.value === f.value) o.selected = true;
                input.appendChild(o);
            });
        } else if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.value = f.value || '';
            input.rows = 3;
        } else {
            input = document.createElement('input');
            input.type = f.type || 'text';
            input.value = f.value || '';
        }
        input.name = f.name;
        group.appendChild(input);
        body.appendChild(group);
    });

    document.getElementById('modal-save').onclick = () => {
        const formData = {};
        body.querySelectorAll('input, textarea, select').forEach(el => {
            formData[el.name] = el.value;
        });
        onSave(formData);
    };

    modalOverlay.classList.add('active');
}

function closeModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });
}

const modalCloseBtn = document.getElementById('modal-close');
if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);

const modalCancelBtn = document.getElementById('modal-cancel');
if (modalCancelBtn) modalCancelBtn.addEventListener('click', closeModal);

// ─── Bloom helpers ───────────────────────────────────────────────────
const bloomOptions = [
    { value: 'تذكر', label: 'تذكر (Remember)' },
    { value: 'فهم', label: 'فهم (Understand)' },
    { value: 'تطبيق', label: 'تطبيق (Apply)' },
    { value: 'تحليل', label: 'تحليل (Analyze)' },
    { value: 'تقييم', label: 'تقييم (Evaluate)' },
    { value: 'ابتكار', label: 'ابتكار (Create)' },
];
const bloomEnMap = { 'تذكر': 'Remember', 'فهم': 'Understand', 'تطبيق': 'Apply', 'تحليل': 'Analyze', 'تقييم': 'Evaluate', 'ابتكار': 'Create' };

// ─── Event Delegation: Objective Edit/Delete ─────────────────────────
document.addEventListener('click', (e) => {
    // Objective Edit button
    const editBtn = e.target.closest('.obj-edit-btn');
    if (editBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = editBtn.closest('.objective-card');
        if (!card) return;
        const objId = card.dataset.objId;
        const bloom = card.dataset.objBloom;
        const objective = card.dataset.objObjective;
        const outcome = card.dataset.objOutcome;

        openModal('تعديل الهدف', [
            { name: 'bloom', label: 'مستوى بلوم', type: 'select', options: bloomOptions, value: bloom },
            { name: 'objective', label: 'الهدف', type: 'textarea', value: objective },
            { name: 'outcome', label: 'المخرج', type: 'textarea', value: outcome },
        ], async (formData) => {
            try {
                await apiCall('/api/objective/' + objId, 'PUT', {
                    bloom: formData.bloom,
                    bloom_en: bloomEnMap[formData.bloom] || 'Remember',
                    objective: formData.objective,
                    outcome: formData.outcome,
                });
                showToast('تم تحديث الهدف');
                closeModal();
                setTimeout(() => location.reload(), 800);
            } catch (ex) { /* toast shown */ }
        });
        return;
    }

    // Objective Delete button
    const deleteBtn = e.target.closest('.obj-delete-btn');
    if (deleteBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = deleteBtn.closest('.objective-card');
        if (!card) return;
        const objId = card.dataset.objId;
        if (!confirm('هل تريد حذف هذا الهدف؟')) return;
        apiCall('/api/objective/' + objId, 'DELETE').then(() => {
            showToast('تم حذف الهدف');
            setTimeout(() => location.reload(), 800);
        }).catch(() => {});
        return;
    }

    // Skill Delete button
    const skillDelBtn = e.target.closest('.skill-delete-btn');
    if (skillDelBtn) {
        e.preventDefault();
        e.stopPropagation();
        const card = skillDelBtn.closest('.skill-card');
        if (!card) return;
        const skillId = card.dataset.skillId;
        if (!confirm('هل تريد حذف هذه المهارة؟')) return;
        apiCall('/api/skill/' + skillId, 'DELETE').then(() => {
            showToast('تم حذف المهارة');
            setTimeout(() => location.reload(), 800);
        }).catch(() => {});
        return;
    }
});

// ─── Objective: Add ──────────────────────────────────────────────────
function addObjective(trackId, levelId, unitId) {
    openModal('إضافة هدف جديد', [
        { name: 'bloom', label: 'مستوى بلوم', type: 'select', options: bloomOptions, value: 'تذكر' },
        { name: 'objective', label: 'الهدف', type: 'textarea', value: '' },
        { name: 'outcome', label: 'المخرج', type: 'textarea', value: '' },
    ], async (formData) => {
        try {
            await apiCall('/api/objective', 'POST', {
                track_id: trackId,
                level_id: levelId,
                unit_id: unitId,
                bloom: formData.bloom,
                bloom_en: bloomEnMap[formData.bloom] || 'Remember',
                objective: formData.objective,
                outcome: formData.outcome,
            });
            showToast('تمت إضافة الهدف');
            closeModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// ─── Skill: Add ──────────────────────────────────────────────────────
function addSkill(trackId, levelId, unitId) {
    openModal('إضافة مهارة جديدة', [
        { name: 'name', label: 'اسم المهارة', type: 'text', value: '' },
    ], async (formData) => {
        if (!formData.name.trim()) {
            showToast('الرجاء إدخال اسم المهارة', 'error');
            return;
        }
        try {
            await apiCall('/api/skill', 'POST', {
                track_id: trackId,
                level_id: levelId,
                unit_id: unitId,
                name: formData.name,
            });
            showToast('تمت إضافة المهارة');
            closeModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// ─── Unit: Add ───────────────────────────────────────────────────────
function addUnit(trackId, levelId) {
    openModal('إضافة وحدة جديدة', [
        { name: 'name', label: 'اسم الوحدة (عربي)', type: 'text', value: '' },
        { name: 'name_en', label: 'اسم الوحدة (إنجليزي)', type: 'text', value: '' },
        { name: 'description', label: 'الوصف', type: 'textarea', value: '' },
        { name: 'project_name', label: 'اسم المشروع', type: 'text', value: '' },
    ], async (formData) => {
        if (!formData.name.trim()) {
            showToast('الرجاء إدخال اسم الوحدة', 'error');
            return;
        }
        try {
            await apiCall('/api/unit', 'POST', {
                track_id: trackId,
                level_id: levelId,
                name: formData.name,
                name_en: formData.name_en,
                description: formData.description,
                project_name: formData.project_name,
            });
            showToast('تمت إضافة الوحدة');
            closeModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// ─── Unit: Delete ────────────────────────────────────────────────────
async function deleteUnit(trackId, levelId, unitId) {
    if (!confirm('هل تريد حذف هذه الوحدة؟ سيتم حذف جميع الأهداف والمهارات المرتبطة بها.')) return;
    try {
        await apiCall('/api/unit/' + trackId + '/' + levelId + '/' + unitId, 'DELETE');
        showToast('تم حذف الوحدة');
        setTimeout(() => {
            window.location.href = '/track/' + trackId + '/level/' + levelId;
        }, 800);
    } catch (e) { /* toast shown */ }
}
