document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const form = document.getElementById('diagnosisForm');
    const submitBtn = document.getElementById('submitBtn');
    const btnText = document.querySelector('.btn-text');
    const btnIcon = document.querySelector('.fa-wand-magic-sparkles');
    const spinner = document.querySelector('.spinner');

    const formCard = document.querySelector('.form-card');
    const resultsCard = document.getElementById('resultsCard');
    const resetBtn = document.getElementById('resetBtn');

    const consultationBanner = document.getElementById('consultationBanner');
    const recommendationTitle = document.getElementById('recommendationTitle');
    const recommendationText = document.getElementById('recommendationText');
    const conditionsContainer = document.getElementById('conditionsContainer');

    // Image upload elements
    const imageDropZone = document.getElementById('imageDropZone');
    const imageInput = document.getElementById('imageUpload');
    const imageUploadContent = document.getElementById('imageUploadContent');
    const imagePreviewGrid = document.getElementById('imagePreviewGrid');

    // Report upload elements
    const reportDropZone = document.getElementById('reportDropZone');
    const reportInput = document.getElementById('reportUpload');
    const reportUploadContent = document.getElementById('reportUploadContent');
    const reportList = document.getElementById('reportList');

    let uploadedImages = [];
    let uploadedReports = [];

    // ==========================================================
    // IMAGE UPLOAD HANDLING
    // ==========================================================
    setupDropZone(imageDropZone, imageInput, handleImageFiles);

    imageInput.addEventListener('change', function () {
        handleImageFiles(this.files);
    });

    function handleImageFiles(files) {
        for (const file of files) {
            if (uploadedImages.length >= 5) {
                alert('Maximum 5 images allowed.');
                break;
            }
            if (file.type.startsWith('image/')) {
                uploadedImages.push(file);
                addImagePreview(file);
            } else {
                alert(`"${file.name}" is not a valid image.`);
            }
        }
        toggleUploadUI(imageUploadContent, imagePreviewGrid, uploadedImages.length > 0);
    }

    function addImagePreview(file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            const wrapper = document.createElement('div');
            wrapper.className = 'preview-item';
            wrapper.innerHTML = `
                <img src="${reader.result}" alt="Preview">
                <button type="button" class="remove-btn" title="Remove image">
                    <i class="fa-solid fa-times"></i>
                </button>
            `;
            wrapper.querySelector('.remove-btn').addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const idx = uploadedImages.indexOf(file);
                if (idx > -1) uploadedImages.splice(idx, 1);
                wrapper.remove();
                if (uploadedImages.length === 0) {
                    toggleUploadUI(imageUploadContent, imagePreviewGrid, false);
                    imageInput.value = '';
                }
            });
            imagePreviewGrid.appendChild(wrapper);
        };
        reader.readAsDataURL(file);
    }

    // ==========================================================
    // REPORT / PDF UPLOAD HANDLING
    // ==========================================================
    setupDropZone(reportDropZone, reportInput, handleReportFiles);

    reportInput.addEventListener('change', function () {
        handleReportFiles(this.files);
    });

    function handleReportFiles(files) {
        for (const file of files) {
            if (uploadedReports.length >= 3) {
                alert('Maximum 3 reports allowed.');
                break;
            }
            const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
            if (validTypes.includes(file.type)) {
                uploadedReports.push(file);
                addReportItem(file);
            } else {
                alert(`"${file.name}" is not a valid report format. Use PDF, JPG, or PNG.`);
            }
        }
        toggleUploadUI(reportUploadContent, reportList, uploadedReports.length > 0);
    }

    function addReportItem(file) {
        const item = document.createElement('div');
        item.className = 'report-item';

        const icon = file.type === 'application/pdf' ? 'fa-file-pdf' : 'fa-file-image';
        const sizeKB = (file.size / 1024).toFixed(1);

        item.innerHTML = `
            <div class="report-info">
                <i class="fa-solid ${icon} report-icon"></i>
                <div>
                    <span class="report-name">${file.name}</span>
                    <span class="report-size">${sizeKB} KB</span>
                </div>
            </div>
            <button type="button" class="remove-btn-small" title="Remove report">
                <i class="fa-solid fa-times"></i>
            </button>
        `;

        item.querySelector('.remove-btn-small').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const idx = uploadedReports.indexOf(file);
            if (idx > -1) uploadedReports.splice(idx, 1);
            item.remove();
            if (uploadedReports.length === 0) {
                toggleUploadUI(reportUploadContent, reportList, false);
                reportInput.value = '';
            }
        });

        reportList.appendChild(item);
    }

    // ==========================================================
    // SHARED DRAG & DROP SETUP
    // ==========================================================
    function setupDropZone(zone, input, handler) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt =>
            zone.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); }, false)
        );
        ['dragenter', 'dragover'].forEach(evt =>
            zone.addEventListener(evt, () => zone.classList.add('drag-over'), false)
        );
        ['dragleave', 'drop'].forEach(evt =>
            zone.addEventListener(evt, () => zone.classList.remove('drag-over'), false)
        );
        zone.addEventListener('drop', (e) => handler(e.dataTransfer.files), false);
    }

    function toggleUploadUI(contentEl, previewEl, hasFiles) {
        contentEl.style.display = hasFiles ? 'none' : 'block';
        previewEl.style.display = hasFiles ? 'flex' : 'none';
    }

    // ==========================================================
    // FORM SUBMISSION — SEND TO AI BACKEND
    // ==========================================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const symptomsText = document.getElementById('symptoms').value.trim();

        if (!symptomsText && uploadedImages.length === 0 && uploadedReports.length === 0) {
            alert('Please enter symptoms, upload photos, or attach reports before analyzing.');
            return;
        }

        setLoadingState(true);

        const formData = new FormData();
        formData.append('symptoms', symptomsText);

        for (const img of uploadedImages) {
            formData.append('images', img);
        }
        for (const report of uploadedReports) {
            formData.append('reports', report);
        }

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                body: formData,
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.detail || errData.error || 'Analysis failed');
            }

            const data = await response.json();

            renderBanner(data.urgencyLevel, data.recommendationTitle, data.recommendationText);
            renderConditions(data.conditions);

            formCard.style.display = 'none';
            resultsCard.style.display = 'block';
            window.scrollTo({ top: resultsCard.offsetTop - 100, behavior: 'smooth' });
        } catch (error) {
            console.error('Analysis Error:', error);
            alert(`Analysis failed: ${error.message}. Please try again.`);
        } finally {
            setLoadingState(false);
        }
    });

    // ==========================================================
    // UI HELPERS
    // ==========================================================
    function setLoadingState(isLoading) {
        if (isLoading) {
            submitBtn.disabled = true;
            btnText.textContent = 'Analyzing with AI...';
            btnIcon.style.display = 'none';
            spinner.style.display = 'block';
        } else {
            submitBtn.disabled = false;
            btnText.textContent = 'Analyze with AI';
            btnIcon.style.display = 'inline-block';
            spinner.style.display = 'none';
        }
    }

    function renderBanner(level, title, text) {
        consultationBanner.className = 'consultation-banner ' + level;

        let iconHtml = '';
        if (level === 'error') {
            iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';
        } else if (level === 'warning') {
            iconHtml = '<i class="fa-solid fa-user-doctor"></i>';
        } else {
            iconHtml = '<i class="fa-solid fa-house-medical-circle-check"></i>';
        }

        consultationBanner.innerHTML = iconHtml + `
            <div class="banner-text">
                <h3>${escapeHtml(title)}</h3>
                <p>${escapeHtml(text)}</p>
            </div>
        `;
    }

    function renderConditions(conditions) {
        conditionsContainer.innerHTML = '';
        if (!conditions || conditions.length === 0) {
            conditionsContainer.innerHTML = '<p style="color: var(--text-secondary);">No specific conditions identified.</p>';
            return;
        }
        conditions.forEach((cond) => {
            const el = document.createElement('div');
            el.className = 'condition-item';
            el.innerHTML = `
                <div class="condition-header">
                    <span class="condition-name">${escapeHtml(cond.name)}</span>
                    <span class="match-probability">${escapeHtml(cond.prob)} Match</span>
                </div>
                <div class="condition-desc">${escapeHtml(cond.desc)}</div>
            `;
            conditionsContainer.appendChild(el);
        });
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // ==========================================================
    // RESET
    // ==========================================================
    resetBtn.addEventListener('click', () => {
        form.reset();
        uploadedImages = [];
        uploadedReports = [];
        imagePreviewGrid.innerHTML = '';
        reportList.innerHTML = '';
        imageInput.value = '';
        reportInput.value = '';
        toggleUploadUI(imageUploadContent, imagePreviewGrid, false);
        toggleUploadUI(reportUploadContent, reportList, false);
        resultsCard.style.display = 'none';
        formCard.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});
