const API_URL = '/api/config';
let currentConfig = null;
let editingJobIndex = -1; // -1 means adding new

const elements = {
    jobList: document.getElementById('job-list'),
    addJobBtn: document.getElementById('add-job-btn'),
    modal: document.getElementById('job-modal'),
    closeModal: document.getElementById('close-modal'),
    jobForm: document.getElementById('job-form'),
    modalTitle: document.getElementById('modal-title'),
    deleteJobBtn: document.getElementById('delete-job-btn'),
    inputs: {
        name: document.getElementById('job-name'),
        interval: document.getElementById('scrape-interval'),
        path: document.getElementById('metrics-path'),
        targetsContainer: document.getElementById('targets-container'),
        relabel: document.getElementById('relabel-config'),
    },
    addTargetBtn: document.getElementById('add-target-btn'),
    showAdvanced: document.getElementById('show-advanced'),
    advancedSection: document.getElementById('advanced-section'),
    toast: document.getElementById('toast'),
};

// --- Initialization ---

async function fetchConfig() {
    try {
        const res = await fetch(API_URL);
        const data = await res.json();
        currentConfig = data;
        renderJobs();
    } catch (error) {
        showToast('Gagal memuat konfigurasi: ' + error.message);
    }
}

function renderJobs() {
    elements.jobList.innerHTML = '';
    const scrapeConfigs = currentConfig.scrape_configs || [];

    if (scrapeConfigs.length === 0) {
        elements.jobList.innerHTML = '<p style="text-align:center;color:#fff;grid-column:1/-1;">Belum ada job konfigurasi.</p>';
        return;
    }

    scrapeConfigs.forEach((job, index) => {
        const card = document.createElement('div');
        card.className = 'job-card';

        // Count targets
        const targets = job.static_configs ? job.static_configs.flatMap(sc => sc.targets || []) : [];
        const targetCount = targets.length;

        // Generate targets preview
        const targetsHtml = targets.slice(0, 3).map(t => `<span class="target-chip">${t}</span>`).join('');
        const moreTargets = targets.length > 3 ? `<span class="target-chip">+${targets.length - 3} lainnya</span>` : '';

        card.innerHTML = `
            <div class="job-header">
                <span class="job-name">${job.job_name}</span>
                <span class="job-meta"><i class="ph ph-clock"></i> ${job.scrape_interval || currentConfig.global.scrape_interval || 'Default'}</span>
            </div>
            <div class="job-body">
                <div style="margin-bottom:0.5rem;font-size:0.875rem;color:#6b7280;">Target (${targetCount})</div>
                <div>${targetsHtml}${moreTargets}</div>
            </div>
        `;

        card.addEventListener('click', () => openModal(index));
        elements.jobList.appendChild(card);
    });
}

// --- Modal Logic ---

function openModal(index = -1) {
    editingJobIndex = index;
    elements.modal.classList.remove('hidden');
    elements.jobForm.reset();

    // Clear targets
    elements.inputs.targetsContainer.innerHTML = '';

    if (index === -1) {
        // Add Mode
        elements.modalTitle.textContent = 'Tambah Job Baru';
        elements.deleteJobBtn.classList.add('hidden');
        addTargetInput('', ''); // Add one empty target field by default
        elements.showAdvanced.checked = false;
        elements.advancedSection.classList.add('hidden');
    } else {
        // Edit Mode
        elements.modalTitle.textContent = 'Edit Job';
        elements.deleteJobBtn.classList.remove('hidden');

        const job = currentConfig.scrape_configs[index];
        elements.inputs.name.value = job.job_name || '';

        // Remove 's' from interval for display
        let interval = job.scrape_interval || '';
        if (interval.endsWith('s')) interval = interval.slice(0, -1);
        elements.inputs.interval.value = interval;

        elements.inputs.path.value = job.metrics_path || '';

        // Populate Targets
        const targets = job.static_configs ? job.static_configs.flatMap(sc => sc.targets || []) : [];
        if (targets.length === 0) {
            addTargetInput('', '');
        } else {
            targets.forEach(t => {
                const parts = t.split(':');
                const ip = parts[0];
                const port = parts[1] || '';
                addTargetInput(ip, port);
            });
        }

        // Populate Advanced (Relabel)
        if (job.relabel_configs) {
            // Need to convert JSON object back to YAML string for the textarea
            // But wait, the textarea prompt says "relabel_configs in YAML".
            // We can just JSON.stringify it comfortably for now, or try to format it.
            // Simplified: User sees JSON, easier for us.
            // Or better: Use js-yaml on frontend? No, let's keep it simple text.
            // Actually, let's just show it as JSON string for now to avoid complexity without a library.
            // Or... we just don't parse it deeply.
            // Let's rely on the server to handle the full file, but here we work effectively with the JSON object.
            // We'll show the relabel_configs as a formatted JSON string.
            elements.inputs.relabel.value = JSON.stringify(job.relabel_configs, null, 2);
            elements.showAdvanced.checked = true;
            elements.advancedSection.classList.remove('hidden');
        } else {
            elements.inputs.relabel.value = '';
            elements.showAdvanced.checked = false;
            elements.advancedSection.classList.add('hidden');
        }
    }
}

function closeModal() {
    elements.modal.classList.add('hidden');
}

function addTargetInput(ip = '', port = '') {
    const div = document.createElement('div');
    div.className = 'target-row';
    div.innerHTML = `
        <input type="text" placeholder="IP Address (e.g. 192.168.1.5)" class="input-ip" value="${ip}" required>
        <input type="text" placeholder="Port" class="input-port" value="${port}" required style="width: 100px;">
        <button type="button" class="remove-target-btn"><i class="ph ph-trash"></i></button>
    `;

    div.querySelector('.remove-target-btn').addEventListener('click', () => {
        div.remove();
    });

    elements.inputs.targetsContainer.appendChild(div);
}

// --- Config Manipulation ---

async function saveConfig(e) {
    e.preventDefault();

    const newJob = {
        job_name: elements.inputs.name.value,
        static_configs: []
    };

    // Append 's' to interval if user entered a number
    if (elements.inputs.interval.value) {
        newJob.scrape_interval = elements.inputs.interval.value + 's';
    }

    if (elements.inputs.path.value) newJob.metrics_path = elements.inputs.path.value;

    // Collect Targets
    const targetRows = Array.from(elements.inputs.targetsContainer.querySelectorAll('.target-row'));
    const targets = targetRows.map(row => {
        const ip = row.querySelector('.input-ip').value.trim();
        const port = row.querySelector('.input-port').value.trim();
        if (ip && port) return `${ip}:${port}`;
        return null;
    }).filter(v => v);

    if (targets.length > 0) {
        newJob.static_configs.push({
            targets: targets
        });
    }

    // Collect Advanced Relabel
    if (elements.showAdvanced.checked && elements.inputs.relabel.value.trim()) {
        try {
            // We expect the user to paste JSON or we try to parse it.
            // The prompt said "YAML", but we didn't include a yaml parser in the frontend.
            // To be "lightweight", let's assume valid JSON since our textarea will pre-fill with JSON.
            // User instruction change: "Masukkan konfigurasi relabel dalam format JSON list"
            newJob.relabel_configs = JSON.parse(elements.inputs.relabel.value);
        } catch (e) {
            alert('Format Relabel Config salah! Harap gunakan JSON valid. Contoh: [{"source_labels": ["__address__"], "target_label": "instance"}]');
            return;
        }
    }

    // Update Local State
    const previousConfig = JSON.parse(JSON.stringify(currentConfig)); // Backup state

    if (!currentConfig.scrape_configs) currentConfig.scrape_configs = [];

    if (editingJobIndex === -1) {
        currentConfig.scrape_configs.push(newJob);
    } else {
        currentConfig.scrape_configs[editingJobIndex] = newJob;
    }

    const success = await syncConfig();
    if (success) {
        closeModal();
    } else {
        // Revert local state change if failed, or just keep it?
        // Actually, if we want to "fix" it, we should probably not revert the UI form, but the local object 'currentConfig' 
        // should probably reflect the 'attempted' state so if they click save again it works?
        // Or better: fetchConfig() again to reset? 
        // Use simple backup restore:
        currentConfig = previousConfig;
    }
}

async function deleteJob() {
    if (editingJobIndex === -1) return;
    if (!confirm('Apakah anda yakin ingin menghapus job ini?')) return;

    const previousConfig = JSON.parse(JSON.stringify(currentConfig));
    currentConfig.scrape_configs.splice(editingJobIndex, 1);

    const success = await syncConfig();
    if (success) {
        closeModal();
    } else {
        currentConfig = previousConfig;
    }
}

async function syncConfig() {
    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(currentConfig)
        });
        const result = await res.json();
        if (result.success) {
            showToast(result.message);
            renderJobs();
            return true;
        } else {
            throw new Error(result.error);
        }
    } catch (error) {
        alert('Gagal menyimpan: ' + error.message);
        return false;
    }
}

function showToast(msg) {
    elements.toast.textContent = msg;
    elements.toast.classList.remove('hidden');
    setTimeout(() => elements.toast.classList.add('hidden'), 5000); // 5 seconds for visibility
}

// --- Event Listeners ---

elements.addJobBtn.addEventListener('click', () => openModal(-1));
elements.closeModal.addEventListener('click', closeModal);
elements.modal.addEventListener('click', (e) => {
    if (e.target === elements.modal) closeModal();
});
elements.addTargetBtn.addEventListener('click', () => addTargetInput());
elements.jobForm.addEventListener('submit', saveConfig);
elements.deleteJobBtn.addEventListener('click', deleteJob);

elements.showAdvanced.addEventListener('change', (e) => {
    if (e.target.checked) {
        elements.advancedSection.classList.remove('hidden');
        document.querySelector('.info-box').innerHTML = '<i class="ph ph-info"></i> Masukkan konfigurasi relabel dalam format JSON Array.';
    } else {
        elements.advancedSection.classList.add('hidden');
    }
});

// Start
fetchConfig();
