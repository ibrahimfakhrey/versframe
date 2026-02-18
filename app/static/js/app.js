/* === Shalaby Verse - Global Utilities === */

// CSRF token helper
function getCsrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) return meta.content;
    const input = document.querySelector('input[name="csrf_token"]');
    if (input) return input.value;
    return '';
}

// Fetch helper with CSRF
async function apiFetch(url, options = {}) {
    const defaults = {
        headers: {
            'Content-Type': 'application/json',
            'X-CSRFToken': getCsrfToken(),
        },
    };
    const config = { ...defaults, ...options };
    if (options.headers) {
        config.headers = { ...defaults.headers, ...options.headers };
    }
    try {
        const response = await fetch(url, config);
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
            throw new Error('حدث خطأ في الاتصال');
        }
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'حدث خطأ');
        }
        return data;
    } catch (err) {
        if (err.message !== 'حدث خطأ في الاتصال') {
            showToast(err.message, 'error');
        }
        throw err;
    }
}

// Toast notification
function showToast(message, type = 'info', duration = 3000) {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-10px)';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Modal helpers
function openModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.add('active');
}

function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove('active');
}

// Close modal on overlay click
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-overlay')) {
        e.target.classList.remove('active');
    }
});

// Close modal on Escape
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
    }
});

// Format date for Arabic display
function formatDateAr(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

function formatTimeAr(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const h = d.getHours() % 12 || 12;
    const m = d.getMinutes().toString().padStart(2, '0');
    const period = d.getHours() >= 12 ? 'م' : 'ص';
    return `${h}:${m} ${period}`;
}

// Time ago
function timeAgo(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = Math.floor((now - d) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff/60)} دقيقة`;
    if (diff < 86400) return `منذ ${Math.floor(diff/3600)} ساعة`;
    if (diff < 604800) return `منذ ${Math.floor(diff/86400)} يوم`;
    return formatDateAr(dateStr);
}

// Confirm dialog
function confirmAction(message) {
    return confirm(message);
}

// Dropdown toggle
function toggleDropdown(id) {
    const menu = document.getElementById(id);
    if (menu) menu.classList.toggle('show');
}

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown')) {
        document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
    }
});

// Notification bell
async function toggleNotifications() {
    try {
        const data = await apiFetch('/api/notifications');
        // Update count
        const countEl = document.getElementById('notifCount');
        if (countEl) {
            if (data.unread > 0) {
                countEl.textContent = data.unread;
                countEl.style.display = 'flex';
            } else {
                countEl.style.display = 'none';
            }
        }
    } catch (e) {
        // silent
    }
}

// Load notification count on page load
document.addEventListener('DOMContentLoaded', () => {
    toggleNotifications();
});

// Animated counter
function animateCounter(element, target, duration = 1000) {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
        start += step;
        if (start >= target) {
            element.textContent = Math.round(target).toLocaleString('ar-EG');
            clearInterval(timer);
        } else {
            element.textContent = Math.round(start).toLocaleString('ar-EG');
        }
    }, 16);
}

// Intersection Observer for scroll animations
const scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('animate-fade');
            scrollObserver.unobserve(entry.target);
        }
    });
}, { threshold: 0.1 });

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.animate-on-scroll').forEach(el => {
        scrollObserver.observe(el);
    });
});
