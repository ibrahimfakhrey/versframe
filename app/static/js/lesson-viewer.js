/**
 * Shalaby Verse - Lesson Viewer
 * Handles chapter tabs, quiz checking, glossary toggle
 */
(function() {
    'use strict';

    document.addEventListener('DOMContentLoaded', function() {
        initChapterTabs();
        initQuizzes();
        initGlossary();
    });

    function initChapterTabs() {
        var tabs = document.querySelectorAll('.sv-chapter-tab');
        var chapters = document.querySelectorAll('.sv-chapter-content');

        if (!tabs.length) return;

        tabs.forEach(function(tab) {
            tab.addEventListener('click', function() {
                var target = this.getAttribute('data-chapter');

                // Update active tab
                tabs.forEach(function(t) { t.classList.remove('active'); });
                this.classList.add('active');

                // Show target chapter
                chapters.forEach(function(ch) {
                    ch.style.display = ch.getAttribute('data-chapter') === target ? 'block' : 'none';
                });
            });
        });
    }

    function initQuizzes() {
        document.querySelectorAll('.sv-quiz-form').forEach(function(form) {
            form.addEventListener('submit', function(e) {
                e.preventDefault();

                var correctAnswer = this.getAttribute('data-correct');
                var selected = this.querySelector('input[name="answer"]:checked');

                if (!selected) {
                    showQuizFeedback(this, 'اختر إجابة أولاً', 'warning');
                    return;
                }

                if (selected.value === correctAnswer) {
                    showQuizFeedback(this, 'إجابة صحيحة! أحسنت', 'success');
                    this.querySelector('[type="submit"]').disabled = true;
                } else {
                    showQuizFeedback(this, 'إجابة خاطئة، حاول مرة أخرى', 'error');
                }
            });
        });
    }

    function showQuizFeedback(form, message, type) {
        var existing = form.querySelector('.sv-quiz-feedback');
        if (existing) existing.remove();

        var div = document.createElement('div');
        div.className = 'sv-quiz-feedback sv-quiz-feedback--' + type;
        div.textContent = message;
        form.appendChild(div);

        if (type !== 'success') {
            setTimeout(function() { div.remove(); }, 3000);
        }
    }

    function initGlossary() {
        var toggleBtn = document.querySelector('.sv-glossary-toggle');
        var panel = document.querySelector('.sv-glossary-panel');

        if (!toggleBtn || !panel) return;

        toggleBtn.addEventListener('click', function() {
            var isOpen = panel.style.display !== 'none';
            panel.style.display = isOpen ? 'none' : 'block';
            this.textContent = isOpen ? 'عرض المصطلحات' : 'إخفاء المصطلحات';
        });
    }
})();
