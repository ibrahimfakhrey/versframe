/* === Curriculum Edit Mode (migrated from existing) === */

// Edit Mode Toggle
const editToggle = document.getElementById('edit-toggle');
if (editToggle) {
    editToggle.addEventListener('click', () => {
        document.body.classList.toggle('edit-mode');
        const isEdit = document.body.classList.contains('edit-mode');
        editToggle.innerHTML = isEdit ? '✕ إغلاق التعديل' : '✏️ وضع التعديل';
    });
}

// API Helper (uses global apiFetch if available, fallback)
async function apiCall(url, method, body) {
    if (typeof apiFetch === 'function' && method !== 'GET') {
        return apiFetch(url, {
            method,
            body: body ? JSON.stringify(body) : undefined,
        });
    }
    const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
}

// Inline Editing
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
        if (newVal === originalText) { cancelEdit(); return; }
        try {
            await apiCall(apiUrl, 'PUT', { [fieldName]: newVal });
            textEl.textContent = newVal;
            showToast('تم الحفظ بنجاح', 'success');
            cancelEdit();
        } catch (e) { /* toast shown */ }
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

// Edit Modal System
const modalOverlay = document.getElementById('modal-overlay');

function openEditModal(title, fields, onSave) {
    if (!modalOverlay) return;
    document.getElementById('modal-title').textContent = title;
    const body = document.getElementById('modal-body');
    body.innerHTML = '';

    fields.forEach(f => {
        const group = document.createElement('div');
        group.className = 'form-group';
        const label = document.createElement('label');
        label.className = 'form-label';
        label.textContent = f.label;
        group.appendChild(label);

        let input;
        if (f.type === 'select') {
            input = document.createElement('select');
            input.className = 'form-select';
            f.options.forEach(opt => {
                const o = document.createElement('option');
                o.value = opt.value;
                o.textContent = opt.label;
                if (opt.value === f.value) o.selected = true;
                input.appendChild(o);
            });
        } else if (f.type === 'textarea') {
            input = document.createElement('textarea');
            input.className = 'form-textarea';
            input.value = f.value || '';
            input.rows = 3;
        } else {
            input = document.createElement('input');
            input.className = 'form-input';
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

function closeEditModal() {
    if (modalOverlay) modalOverlay.classList.remove('active');
}

if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeEditModal();
    });
    const closeBtn = document.getElementById('modal-close');
    if (closeBtn) closeBtn.addEventListener('click', closeEditModal);
    const cancelBtn = document.getElementById('modal-cancel');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditModal);
}

// Bloom helpers
const bloomOptions = [
    { value: 'تذكر', label: 'تذكر (Remember)' },
    { value: 'فهم', label: 'فهم (Understand)' },
    { value: 'تطبيق', label: 'تطبيق (Apply)' },
    { value: 'تحليل', label: 'تحليل (Analyze)' },
    { value: 'تقييم', label: 'تقييم (Evaluate)' },
    { value: 'ابتكار', label: 'ابتكار (Create)' },
];
const bloomEnMap = { 'تذكر': 'Remember', 'فهم': 'Understand', 'تطبيق': 'Apply', 'تحليل': 'Analyze', 'تقييم': 'Evaluate', 'ابتكار': 'Create' };

// Event Delegation
document.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.obj-edit-btn');
    if (editBtn) {
        e.preventDefault();
        const card = editBtn.closest('.objective-card');
        if (!card) return;
        openEditModal('تعديل الهدف', [
            { name: 'bloom', label: 'مستوى بلوم', type: 'select', options: bloomOptions, value: card.dataset.objBloom },
            { name: 'objective', label: 'الهدف', type: 'textarea', value: card.dataset.objObjective },
            { name: 'outcome', label: 'المخرج', type: 'textarea', value: card.dataset.objOutcome },
        ], async (formData) => {
            try {
                await apiCall('/api/objective/' + card.dataset.objId, 'PUT', {
                    bloom: formData.bloom, bloom_en: bloomEnMap[formData.bloom] || 'Remember',
                    objective: formData.objective, outcome: formData.outcome,
                });
                showToast('تم تحديث الهدف', 'success');
                closeEditModal();
                setTimeout(() => location.reload(), 800);
            } catch (ex) { /* toast shown */ }
        });
        return;
    }

    const deleteBtn = e.target.closest('.obj-delete-btn');
    if (deleteBtn) {
        e.preventDefault();
        const card = deleteBtn.closest('.objective-card');
        if (!card || !confirm('هل تريد حذف هذا الهدف؟')) return;
        apiCall('/api/objective/' + card.dataset.objId, 'DELETE').then(() => {
            showToast('تم حذف الهدف', 'success');
            setTimeout(() => location.reload(), 800);
        }).catch(() => {});
        return;
    }

    const skillDelBtn = e.target.closest('.skill-delete-btn');
    if (skillDelBtn) {
        e.preventDefault();
        const card = skillDelBtn.closest('.skill-card');
        if (!card || !confirm('هل تريد حذف هذه المهارة؟')) return;
        apiCall('/api/skill/' + card.dataset.skillId, 'DELETE').then(() => {
            showToast('تم حذف المهارة', 'success');
            setTimeout(() => location.reload(), 800);
        }).catch(() => {});
    }
});

// Add objective
function addObjective(trackId, levelId, unitId) {
    openEditModal('إضافة هدف جديد', [
        { name: 'bloom', label: 'مستوى بلوم', type: 'select', options: bloomOptions, value: 'تذكر' },
        { name: 'objective', label: 'الهدف', type: 'textarea', value: '' },
        { name: 'outcome', label: 'المخرج', type: 'textarea', value: '' },
    ], async (formData) => {
        try {
            await apiCall('/api/objective', 'POST', {
                track_id: trackId, level_id: levelId, unit_id: unitId,
                bloom: formData.bloom, bloom_en: bloomEnMap[formData.bloom] || 'Remember',
                objective: formData.objective, outcome: formData.outcome,
            });
            showToast('تمت إضافة الهدف', 'success');
            closeEditModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// Add skill
function addSkill(trackId, levelId, unitId) {
    openEditModal('إضافة مهارة جديدة', [
        { name: 'name', label: 'اسم المهارة', type: 'text', value: '' },
    ], async (formData) => {
        if (!formData.name.trim()) { showToast('الرجاء إدخال اسم المهارة', 'error'); return; }
        try {
            await apiCall('/api/skill', 'POST', {
                track_id: trackId, level_id: levelId, unit_id: unitId, name: formData.name,
            });
            showToast('تمت إضافة المهارة', 'success');
            closeEditModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// Add unit
function addUnit(trackId, levelId) {
    openEditModal('إضافة وحدة جديدة', [
        { name: 'name', label: 'اسم الوحدة (عربي)', type: 'text', value: '' },
        { name: 'name_en', label: 'اسم الوحدة (إنجليزي)', type: 'text', value: '' },
        { name: 'description', label: 'الوصف', type: 'textarea', value: '' },
        { name: 'project_name', label: 'اسم المشروع', type: 'text', value: '' },
    ], async (formData) => {
        if (!formData.name.trim()) { showToast('الرجاء إدخال اسم الوحدة', 'error'); return; }
        try {
            await apiCall('/api/unit', 'POST', {
                track_id: trackId, level_id: levelId,
                name: formData.name, name_en: formData.name_en,
                description: formData.description, project_name: formData.project_name,
            });
            showToast('تمت إضافة الوحدة', 'success');
            closeEditModal();
            setTimeout(() => location.reload(), 800);
        } catch (e) { /* toast shown */ }
    });
}

// Delete unit
async function deleteUnit(trackId, levelId, unitId) {
    if (!confirm('هل تريد حذف هذه الوحدة؟ سيتم حذف جميع الأهداف والمهارات المرتبطة بها.')) return;
    try {
        await apiCall('/api/unit/' + trackId + '/' + levelId + '/' + unitId, 'DELETE');
        showToast('تم حذف الوحدة', 'success');
        setTimeout(() => { window.location.href = '/track/' + trackId + '/level/' + levelId; }, 800);
    } catch (e) { /* toast shown */ }
}
