/* === Slides Viewer + Teacher Sync === */

let slides = [];
let currentSlide = 0;
let slidesResourceId = null;

/* ---------- Initialize Slides ---------- */

async function initSlides(resourceId, slideUrls) {
    slidesResourceId = resourceId;
    const viewer = document.getElementById('slidesViewer');
    if (!viewer) return;

    if (slideUrls && slideUrls.length > 0) {
        slides = slideUrls.map((url, i) => ({
            url: url,
            index: i,
        }));
    } else {
        // Try loading from API
        try {
            const resp = await fetch(`/api/resources/${resourceId}/slides`);
            if (resp.ok) {
                const data = await resp.json();
                slides = (data.slides || []).map((s, i) => ({
                    url: s.url,
                    index: i,
                }));
            }
        } catch (e) {
            console.warn('Could not load slides from API:', e);
        }
    }

    if (slides.length === 0) {
        // Demo slides for development
        slides = [
            { url: '', index: 0, placeholder: true },
        ];
    }

    currentSlide = 0;
    renderSlideViewer(viewer);
    renderSlide();
}

function renderSlideViewer(viewer) {
    viewer.innerHTML = `
        <div class="slides-display" id="slideDisplay">
            <div class="slides-placeholder">
                <div style="font-size: 3rem; margin-bottom: 16px;">📊</div>
                <p>جاري تحميل الشرائح...</p>
            </div>
        </div>
        <div class="slides-nav">
            <button class="slides-nav-btn" id="prevSlideBtn" onclick="prevSlide()">
                <span>→</span> السابقة
            </button>
            <span class="slides-counter" id="slideCounter">1 / ${slides.length}</span>
            <button class="slides-nav-btn" id="nextSlideBtn" onclick="nextSlide()">
                التالية <span>←</span>
            </button>
        </div>
        <div class="slides-thumbnails" id="slideThumbnails"></div>
    `;

    // Render thumbnail strip
    renderThumbnails();
}

/* ---------- Slide Navigation ---------- */

function nextSlide() {
    if (currentSlide < slides.length - 1) {
        currentSlide++;
        renderSlide();
        // Sync to other users (teacher only)
        if (typeof IS_TEACHER !== 'undefined' && IS_TEACHER && typeof emitSlideChange === 'function') {
            emitSlideChange(SESSION_ID, currentSlide);
        }
    }
}

function prevSlide() {
    if (currentSlide > 0) {
        currentSlide--;
        renderSlide();
        if (typeof IS_TEACHER !== 'undefined' && IS_TEACHER && typeof emitSlideChange === 'function') {
            emitSlideChange(SESSION_ID, currentSlide);
        }
    }
}

function goToSlide(index) {
    if (index >= 0 && index < slides.length) {
        currentSlide = index;
        renderSlide();
        if (typeof IS_TEACHER !== 'undefined' && IS_TEACHER && typeof emitSlideChange === 'function') {
            emitSlideChange(SESSION_ID, currentSlide);
        }
    }
}

// Called by SocketIO when teacher changes slide
function setSlideIndex(index) {
    if (index >= 0 && index < slides.length) {
        currentSlide = index;
        renderSlide();
    }
}

/* ---------- Rendering ---------- */

function renderSlide() {
    const display = document.getElementById('slideDisplay');
    const counter = document.getElementById('slideCounter');
    if (!display) return;

    const slide = slides[currentSlide];

    if (slide && slide.url && !slide.placeholder) {
        display.innerHTML = `
            <img src="${slide.url}" alt="الشريحة ${currentSlide + 1}" class="slide-image"
                 onerror="this.parentElement.innerHTML='<div class=\\'slides-placeholder\\'><div style=\\'font-size:3rem;margin-bottom:16px;\\'>📊</div><p>خطأ في تحميل الشريحة</p></div>'"
            >
        `;
    } else {
        display.innerHTML = `
            <div class="slides-placeholder">
                <div style="font-size: 4rem; margin-bottom: 16px;">📊</div>
                <h3 style="margin-bottom: 8px;">الشريحة ${currentSlide + 1}</h3>
                <p style="opacity: 0.6;">محتوى الشريحة سيظهر هنا</p>
            </div>
        `;
    }

    if (counter) {
        counter.textContent = `${currentSlide + 1} / ${Math.max(slides.length, 1)}`;
    }

    // Update navigation button states
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');
    if (prevBtn) prevBtn.disabled = currentSlide === 0;
    if (nextBtn) nextBtn.disabled = currentSlide >= slides.length - 1;

    // Update active thumbnail
    updateThumbnails();
}

function renderThumbnails() {
    const container = document.getElementById('slideThumbnails');
    if (!container || slides.length <= 1) return;

    container.innerHTML = slides.map((slide, i) => `
        <button class="slide-thumb ${i === currentSlide ? 'active' : ''}" onclick="goToSlide(${i})">
            ${i + 1}
        </button>
    `).join('');
}

function updateThumbnails() {
    const thumbs = document.querySelectorAll('.slide-thumb');
    thumbs.forEach((thumb, i) => {
        thumb.classList.toggle('active', i === currentSlide);
    });
}

/* ---------- Keyboard Navigation ---------- */

document.addEventListener('keydown', (e) => {
    // Only handle if slides pane is visible
    const slidesPane = document.getElementById('slidesViewer');
    if (!slidesPane || slidesPane.offsetParent === null) return;

    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        // RTL: left = next, right = prev
        if (e.key === 'ArrowLeft') nextSlide();
        else prevSlide();
        e.preventDefault();
    }
});
