document.addEventListener('DOMContentLoaded', function () {
    const app = new DashboardApp();
    app.init();
});

class DashboardApp {
    constructor() {
        this.db = new LocalDatabase();
        this.today = this.getBoliviaDateString();
        this.currentEditId = null;
    }

    init() {
        try {
            this.updateDateDisplay();
            this.renderStats();
            this.renderPrincipalView();
            this.setupEventListeners();
            this.initCustomPickers();

            // Start Clock and Limit Checker
            this.updateClock();
            setInterval(() => this.updateClock(), 1000);

            this.failPastPendingTasks();
            this.checkTaskLimits();
            setInterval(() => this.checkTaskLimits(), 60000);
        } catch (e) {
            console.error("Initialization Error:", e);
            alert("Error initializing dashboard: " + e.message);
        }
    }

    getBoliviaDateString() {
        const options = { timeZone: 'America/La_Paz', year: 'numeric', month: '2-digit', day: '2-digit' };
        const formatter = new Intl.DateTimeFormat('es-BO', options);
        const parts = formatter.formatToParts(new Date());
        const day = parts.find(p => p.type === 'day').value;
        const month = parts.find(p => p.type === 'month').value;
        const year = parts.find(p => p.type === 'year').value;
        return `${year}-${month}-${day}`;
    }

    updateDateDisplay() {
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/La_Paz' };
        const dateStr = new Date().toLocaleDateString('es-BO', options);
        // Capitalize first letter
        document.getElementById('current-date').innerText = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    updateClock() {
        const options = { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'America/La_Paz', hour12: false };
        const timeStr = new Date().toLocaleTimeString('es-BO', options);
        const clockEl = document.getElementById('clock-display');
        if (clockEl) {
            clockEl.innerText = timeStr;
        }
    }

    /* --- Time Limit Logic --- */

    failPastPendingTasks() {
        const allTasks = this.db.getAllTasks();
        let changed = false;

        allTasks.forEach(task => {
            // If task is from a previous day and still pending, mark as failed
            if (task.date < this.today && task.status === 'pending') {
                task.status = 'failed';
                changed = true;
            }
        });

        if (changed) {
            this.db.saveTasks(allTasks);
        }
    }

    checkTaskLimits() {
        const allTasks = this.db.getAllTasks();
        // Filter tasks for today, keeping references to objects in allTasks
        const todayTasks = allTasks.filter(t => t.date === this.today);
        let changed = false;

        // Get current time in La Paz robustly
        const now = new Date();
        const options = { timeZone: 'America/La_Paz', hour: 'numeric', minute: 'numeric', hour12: false };
        const formatter = new Intl.DateTimeFormat('en-US', options);
        const parts = formatter.formatToParts(now);
        const currentHour = parseInt(parts.find(p => p.type === 'hour').value);
        const currentMinute = parseInt(parts.find(p => p.type === 'minute').value);
        const currentTimeVal = currentHour * 60 + currentMinute;

        todayTasks.forEach(task => {
            if (task.status === 'pending') {
                // Skip if no limit
                if (task.limits === 'Sin límite') return;

                const endTimeVal = this.parseEndTime(task.limits);
                if (endTimeVal !== null && currentTimeVal > endTimeVal) {
                    console.log(`Failing task ${task.title}: Current ${currentTimeVal} > Limit ${endTimeVal}`);
                    task.status = 'failed';
                    changed = true;
                }
            }
        });

        if (changed) {
            this.db.saveTasks(allTasks);
            this.renderStats();
            this.renderPrincipalView();
        }
    }

    parseEndTime(limitStr) {
        // Expected format: "HH:mm"
        if (!limitStr) return null;
        try {
            const parts = limitStr.split(':');
            if (parts.length === 2) {
                const hours = parseInt(parts[0]);
                const minutes = parseInt(parts[1]);
                return hours * 60 + minutes;
            }
        } catch (e) {
            console.error("Error parsing time limit:", limitStr);
        }
        return null;
    }

    renderStats() {
        const stats = this.db.getStats(this.today);
        document.querySelector('.stat-box-container:nth-child(1) .stat-box').innerText = stats.totalGain + '%';
        document.querySelector('.stat-box-container:nth-child(2) .stat-box').innerText = stats.todayGain + '%';
    }

    /* --- View Rendering --- */

    renderPrincipalView() {
        const pendingList = document.getElementById('principal-pending-list');
        const completedList = document.getElementById('principal-completed-list');

        pendingList.innerHTML = '';
        completedList.innerHTML = '';

        // Get daily tasks. If none exist for today, generate them from Mejoras templates.
        let dailyTasks = this.db.getDailyTasks(this.today);

        if (dailyTasks.length === 0) {
            // Check if we have templates
            const templates = this.db.getMejoras();
            if (templates.length > 0) {
                dailyTasks = this.db.generateDailyTasks(this.today);
            } else {
                // Seed defaults if absolutely nothing exists
                this.seedDefaults();
                dailyTasks = this.db.getDailyTasks(this.today);
            }
        }

        dailyTasks.forEach(task => {
            const card = this.createTaskCard(task, 'principal');
            if (task.status === 'pending') {
                pendingList.appendChild(card);
            } else {
                completedList.appendChild(card);
            }
        });
    }

    renderMejorasView() {
        const list = document.getElementById('mejoras-list');
        list.innerHTML = '';

        const mejoras = this.db.getMejoras();
        mejoras.forEach(mejora => {
            const card = this.createTaskCard(mejora, 'mejora');
            list.appendChild(card);
        });
    }

    createTaskCard(item, type) {
        const div = document.createElement('div');
        div.className = 'task-card';
        div.dataset.id = item.id;

        let actionBtn = '';
        let gainClass = '';
        let gainText = `${item.gain > 0 ? '+' : ''} ${item.gain}%`;

        if (type === 'principal') {
            if (item.status === 'pending') {
                actionBtn = `<button class="action-btn mark-btn">Marcar</button>`;
            } else if (item.status === 'completed') {
                actionBtn = `<button class="action-btn completed-btn">Completado</button>`;
                gainClass = 'green-text';
            } else {
                actionBtn = `<button class="action-btn failed-btn">Incumplido</button>`;
                gainClass = 'red-text';
            }
        } else {
            // Mejoras view
            actionBtn = `
                <div class="action-buttons">
                    <button class="edit-btn">Editar</button>
                    <button class="delete-btn">Eliminar</button>
                </div>
            `;
        }

        let limitDisplay = item.limits === 'Sin límite' ? 'Sin límite' : `Límite: ${item.limits}`;

        div.innerHTML = `
            <div class="task-info">
                <h3>${item.title}</h3>
                <p>${limitDisplay}</p>
            </div>
            <div class="task-gain ${gainClass}">${gainText}</div>
            ${actionBtn}
        `;

        return div;
    }

    /* --- Event Listeners --- */

    setupEventListeners() {
        // ... (existing listeners) ...
        // I need to be careful not to overwrite setupEventListeners if I'm just targeting createTaskCard.
        // The tool replaces the chunk. I should only target createTaskCard.
    }

    handleSaveMejora() {
        const title = document.getElementById('mejora-title').value;
        const gain = parseFloat(document.getElementById('mejora-gain').value);

        const noLimitCheck = document.getElementById('mejora-no-limit');
        const timeInput = document.getElementById('mejora-time-limit');

        let limits = '';
        if (noLimitCheck.checked) {
            limits = 'Sin límite';
        } else {
            limits = timeInput.value;
        }

        const data = { title, limits, gain };

        if (this.currentEditId) {
            this.db.updateMejora(parseFloat(this.currentEditId), data);
        } else {
            this.db.addMejora(data);
        }

        this.closeModal();
        this.renderMejorasView();
        this.db.syncDailyTasks(this.today);
    }

    /* --- Event Listeners --- */

    setupEventListeners() {
        // Navigation
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                // Update active state
                navItems.forEach(n => n.classList.remove('active'));
                item.classList.add('active');

                // Fix: Select the .text span, or fallback if not found (for safety)
                const textSpan = item.querySelector('.text');
                const text = textSpan ? textSpan.innerText : item.innerText;
                this.switchView(text.trim());
            });
        });

        // Dynamic Buttons (Delegation)
        document.addEventListener('click', (e) => {
            const target = e.target;
            const card = target.closest('.task-card');

            if (!card) return; // Safety check

            if (target.classList.contains('mark-btn')) {
                this.handleMarkTask(card.dataset.id);
            } else if (target.classList.contains('edit-btn')) {
                this.openModal(card.dataset.id);
            } else if (target.classList.contains('delete-btn')) {
                if (confirm('¿Estás seguro de eliminar esta mejora?')) {
                    this.handleDeleteMejora(card.dataset.id);
                }
            }
        });

        // Modal Controls
        document.getElementById('btn-new-mejora').addEventListener('click', () => this.openModal());
        document.getElementById('btn-cancel-modal').addEventListener('click', () => this.closeModal());

        // Sidebar Controls
        const sidebar = document.querySelector('.sidebar');
        const collapseBtn = document.querySelector('.collapse-btn');
        const mobileMenuBtn = document.querySelector('.mobile-menu-btn');

        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                sidebar.classList.toggle('collapsed');
                // Rotate arrow logic if needed, or handled by CSS
            });
        }

        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.toggle('active');
            });
        }

        // Close mobile sidebar when clicking outside
        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 768) {
                if (!sidebar.contains(e.target) && !mobileMenuBtn.contains(e.target) && sidebar.classList.contains('active')) {
                    sidebar.classList.remove('active');
                }
            }
        });

        // Form Submission
        document.getElementById('mejora-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSaveMejora();
        });
    }

    switchView(viewName) {
        const principalView = document.getElementById('view-principal');
        const mejorasView = document.getElementById('view-mejoras');

        // Handle icon or text match
        if (viewName.includes('Principal')) {
            principalView.style.display = 'block';
            mejorasView.style.display = 'none';
            this.renderPrincipalView();
        } else if (viewName.includes('Mejoras')) {
            principalView.style.display = 'none';
            mejorasView.style.display = 'block';
            this.renderMejorasView();
        }
    }

    /* --- Logic --- */

    handleMarkTask(id) {
        // ID is string in dataset, convert if needed or keep consistent.
        // Our DB uses numeric IDs mostly, let's parse.
        this.db.updateTaskStatus(parseFloat(id), 'completed', this.today);
        this.renderStats();
        this.renderPrincipalView();
    }

    handleDeleteMejora(id) {
        this.db.deleteMejora(parseFloat(id));
        this.renderMejorasView();
        // Optional: Remove from daily tasks if it was just added?
        // For now, keep history, just stop generating future ones.
    }

    /* --- Custom Time Picker Logic --- */

    initCustomPickers() {
        const times = [];
        // Generate 15 min intervals
        for (let h = 0; h < 24; h++) {
            for (let m = 0; m < 60; m += 15) {
                const hour = h.toString().padStart(2, '0');
                const minute = m.toString().padStart(2, '0');
                const ampm = h >= 12 ? 'PM' : 'AM';
                const displayHour = h % 12 || 12;
                const display = `${displayHour}:${minute} ${ampm}`;
                const value = `${hour}:${minute}`;
                times.push({ display, value });
            }
        }

        this.setupPicker('start', times);
        this.setupPicker('end', times);

        // Close dropdowns when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-time-picker')) {
                document.querySelectorAll('.time-dropdown').forEach(d => d.classList.remove('show'));
                document.querySelectorAll('.picker-trigger').forEach(t => t.classList.remove('active'));
            }
        });
    }

    setupPicker(type, times) {
        const container = document.getElementById(`picker-${type}-container`);
        const trigger = document.getElementById(`trigger-${type}`);
        const dropdown = document.getElementById(`dropdown-${type}`);
        const input = document.getElementById(`mejora-time-${type}`);

        // Populate options
        dropdown.innerHTML = times.map(t =>
            `<div class="time-option" data-value="${t.value}">${t.display}</div>`
        ).join('');

        // Toggle dropdown
        trigger.addEventListener('click', () => {
            if (container.classList.contains('disabled')) return;

            // Close others
            document.querySelectorAll('.time-dropdown').forEach(d => {
                if (d !== dropdown) d.classList.remove('show');
            });
            document.querySelectorAll('.picker-trigger').forEach(t => {
                if (t !== trigger) t.classList.remove('active');
            });

            dropdown.classList.toggle('show');
            trigger.classList.toggle('active');

            // Scroll to selected
            const selected = dropdown.querySelector(`.time-option[data-value="${input.value}"]`);
            if (selected) {
                selected.scrollIntoView({ block: 'center' });
            }
        });

        // Select option
        dropdown.addEventListener('click', (e) => {
            if (e.target.classList.contains('time-option')) {
                const value = e.target.dataset.value;
                const display = e.target.innerText;

                input.value = value;
                trigger.innerText = display;

                dropdown.classList.remove('show');
                trigger.classList.remove('active');

                // Highlight selected
                dropdown.querySelectorAll('.time-option').forEach(o => o.classList.remove('selected'));
                e.target.classList.add('selected');
            }
        });
    }

    setPickerValue(type, value) {
        const input = document.getElementById(`mejora-time-${type}`);
        const trigger = document.getElementById(`trigger-${type}`);
        const dropdown = document.getElementById(`dropdown-${type}`);

        // Find display text for value
        // We can reconstruct it or find in dropdown
        // Let's find in dropdown for simplicity
        const option = Array.from(dropdown.children).find(opt => opt.dataset.value === value);

        if (option) {
            input.value = value;
            trigger.innerText = option.innerText;
            // Update selected class
            Array.from(dropdown.children).forEach(c => c.classList.remove('selected'));
            option.classList.add('selected');
        } else {
            // If value not found, clear input and trigger
            input.value = '';
            Array.from(dropdown.children).forEach(c => c.classList.remove('selected'));
        }
    }

    /* --- Recurrence & End Date Logic --- */

    initRecurrenceControls() {
        // Day Buttons
        const dayBtns = document.querySelectorAll('.day-btn');
        dayBtns.forEach(btn => {
            btn.onclick = () => {
                btn.classList.toggle('active');
            };
        });

        // End Date Radios
        const radioNever = document.getElementById('end-never');
        const radioDate = document.getElementById('end-date-radio');
        const dateInput = document.getElementById('mejora-end-date');

        const toggleDate = () => {
            dateInput.disabled = !radioDate.checked;
            if (radioDate.checked) dateInput.focus();
        };

        radioNever.onchange = toggleDate;
        radioDate.onchange = toggleDate;
    }

    /* --- Modal Logic --- */

    openModal(id = null) {
        const modal = document.getElementById('mejora-modal');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('mejora-form');

        // Inputs
        const startContainer = document.getElementById('picker-start-container');
        const endContainer = document.getElementById('picker-end-container');
        const noLimitCheck = document.getElementById('mejora-no-limit');

        // Recurrence Inputs
        const dayBtns = document.querySelectorAll('.day-btn');
        const radioNever = document.getElementById('end-never');
        const radioDate = document.getElementById('end-date-radio');
        const dateInput = document.getElementById('mejora-end-date');

        this.currentEditId = id;

        // Ensure controls are init (idempotent-ish)
        this.initRecurrenceControls();

        // Checkbox Logic
        noLimitCheck.onchange = () => {
            const disabled = noLimitCheck.checked;
            if (disabled) {
                startContainer.classList.add('disabled');
                endContainer.classList.add('disabled');
                startContainer.style.opacity = '0.5';
                endContainer.style.opacity = '0.5';
            } else {
                startContainer.classList.remove('disabled');
                endContainer.classList.remove('disabled');
                startContainer.style.opacity = '1';
                endContainer.style.opacity = '1';
            }
        };

        if (id) {
            title.innerText = 'Editar Mejora';
            const mejora = this.db.getMejora(parseFloat(id));
            document.getElementById('mejora-title').value = mejora.title;
            document.getElementById('mejora-gain').value = mejora.gain;

            // Limits
            if (mejora.limits === 'Sin límite') {
                noLimitCheck.checked = true;
                noLimitCheck.onchange();
            } else {
                noLimitCheck.checked = false;
                noLimitCheck.onchange();
                if (mejora.limits && mejora.limits.includes(' - ')) {
                    const parts = mejora.limits.split(' - ');
                    this.setPickerValue('start', parts[0]);
                    this.setPickerValue('end', parts[1]);
                } else {
                    this.setPickerValue('start', '08:00');
                    this.setPickerValue('end', '09:00');
                }
            }

            // Recurrence
            dayBtns.forEach(btn => btn.classList.remove('active'));
            if (mejora.recurrence) {
                mejora.recurrence.forEach(dayIndex => {
                    const btn = document.querySelector(`.day-btn[data-day="${dayIndex}"]`);
                    if (btn) btn.classList.add('active');
                });
            } else {
                // Default all active if legacy
                dayBtns.forEach(btn => btn.classList.add('active'));
            }

            // End Date
            if (mejora.endDate) {
                radioDate.checked = true;
                dateInput.disabled = false;
                dateInput.value = mejora.endDate;
            } else {
                radioNever.checked = true;
                dateInput.disabled = true;
                dateInput.value = '';
            }

        } else {
            title.innerText = 'Nueva Mejora';
            form.reset();
            noLimitCheck.checked = false;
            noLimitCheck.onchange();
            this.setPickerValue('start', '08:00');
            this.setPickerValue('end', '09:00');

            // Default Recurrence: All days
            dayBtns.forEach(btn => btn.classList.add('active'));

            // Default End: Never
            radioNever.checked = true;
            dateInput.disabled = true;
        }

        modal.classList.add('active');
    }

    closeModal() {
        document.getElementById('mejora-modal').classList.remove('active');
        this.currentEditId = null;
    }

    handleSaveMejora() {
        const title = document.getElementById('mejora-title').value;
        const gain = parseFloat(document.getElementById('mejora-gain').value);

        const noLimitCheck = document.getElementById('mejora-no-limit');
        const startInput = document.getElementById('mejora-time-start');
        const endInput = document.getElementById('mejora-time-end');

        let limits = '';
        if (noLimitCheck.checked) {
            limits = 'Sin límite';
        } else {
            if (!startInput.value || !endInput.value) {
                alert("Por favor ingrese ambas horas (Inicio y Fin)");
                return;
            }
            limits = `${startInput.value} - ${endInput.value}`;
        }

        // Recurrence
        const recurrence = [];
        document.querySelectorAll('.day-btn.active').forEach(btn => {
            recurrence.push(parseInt(btn.dataset.day));
        });

        // End Date
        let endDate = null;
        if (document.getElementById('end-date-radio').checked) {
            endDate = document.getElementById('mejora-end-date').value;
            if (!endDate) {
                alert("Por favor seleccione una fecha de finalización");
                return;
            }
        }

        const data = { title, limits, gain, recurrence, endDate };

        if (this.currentEditId) {
            this.db.updateMejora(parseFloat(this.currentEditId), data);
        } else {
            this.db.addMejora(data);
        }

        this.closeModal();
        this.renderMejorasView();
        this.db.syncDailyTasks(this.today);
    }

    seedDefaults() {
        const defaults = [
            { title: 'Estudiar Estadistica', limits: 'Limites: 8:00 - 9:00', gain: 0.5 },
            { title: 'Leer Libro', limits: 'Limites: 20:00 - 21:00', gain: 1.0 }
        ];
        defaults.forEach(d => this.db.addMejora(d));
        this.db.generateDailyTasks(this.today);
    }
}

class LocalDatabase {
    constructor() {
        this.keyMejoras = 'blancoLeonMejoras'; // Templates
        this.keyTasks = 'blancoLeonTasks';     // Daily Instances

        if (!localStorage.getItem(this.keyMejoras)) localStorage.setItem(this.keyMejoras, JSON.stringify([]));
        if (!localStorage.getItem(this.keyTasks)) localStorage.setItem(this.keyTasks, JSON.stringify([]));
    }

    /* --- Mejoras (Templates) --- */
    getMejoras() {
        return JSON.parse(localStorage.getItem(this.keyMejoras));
    }

    getMejora(id) {
        return this.getMejoras().find(m => m.id === id);
    }

    addMejora(data) {
        const list = this.getMejoras();
        const newItem = { ...data, id: Date.now() };
        list.push(newItem);
        localStorage.setItem(this.keyMejoras, JSON.stringify(list));
        return newItem;
    }

    updateMejora(id, data) {
        const list = this.getMejoras();
        const index = list.findIndex(m => m.id === id);
        if (index !== -1) {
            list[index] = { ...list[index], ...data };
            localStorage.setItem(this.keyMejoras, JSON.stringify(list));
        }
    }

    deleteMejora(id) {
        const list = this.getMejoras();
        // Compare as strings to ensure matching despite type differences
        const newList = list.filter(m => String(m.id) !== String(id));
        localStorage.setItem(this.keyMejoras, JSON.stringify(newList));
    }

    /* --- Tasks (Daily) --- */
    getAllTasks() {
        return JSON.parse(localStorage.getItem(this.keyTasks));
    }

    getDailyTasks(dateStr) {
        return this.getAllTasks().filter(t => t.date === dateStr);
    }

    generateDailyTasks(dateStr) {
        const templates = this.getMejoras();
        const tasks = this.getAllTasks();

        // Determine day of week for dateStr
        // dateStr is YYYY-MM-DD. 
        // Create date object in local time (append time to avoid UTC shift issues)
        const dateObj = new Date(`${dateStr}T12:00:00`);
        const dayIndex = dateObj.getDay(); // 0=Sun, 1=Mon...

        const newTasks = templates.filter(t => {
            // Check Recurrence (if defined)
            if (t.recurrence && !t.recurrence.includes(dayIndex)) {
                return false;
            }
            // Check End Date (if defined)
            if (t.endDate && dateStr > t.endDate) {
                return false;
            }
            return true;
        }).map(t => ({
            id: Date.now() + Math.random(),
            templateId: t.id,
            title: t.title,
            limits: t.limits,
            gain: t.gain,
            status: 'pending',
            date: dateStr,
            dateCompleted: null
        }));

        const updatedTasks = [...tasks, ...newTasks];
        localStorage.setItem(this.keyTasks, JSON.stringify(updatedTasks));
        return newTasks;
    }

    syncDailyTasks(dateStr) {
        const templates = this.getMejoras();
        const allTasks = this.getAllTasks();
        const todayTasks = allTasks.filter(t => t.date === dateStr);

        const dateObj = new Date(`${dateStr}T12:00:00`);
        const dayIndex = dateObj.getDay();

        const missingTemplates = templates.filter(tpl => {
            // Check if already exists
            if (todayTasks.some(t => t.templateId === tpl.id)) return false;

            // Check Recurrence
            if (tpl.recurrence && !tpl.recurrence.includes(dayIndex)) return false;

            // Check End Date
            if (tpl.endDate && dateStr > tpl.endDate) return false;

            return true;
        });

        if (missingTemplates.length > 0) {
            const newTasks = missingTemplates.map(t => ({
                id: Date.now() + Math.random(),
                templateId: t.id,
                title: t.title,
                limits: t.limits,
                gain: t.gain,
                status: 'pending',
                date: dateStr,
                dateCompleted: null
            }));
            localStorage.setItem(this.keyTasks, JSON.stringify([...allTasks, ...newTasks]));
        }
    }

    saveTasks(tasks) {
        localStorage.setItem(this.keyTasks, JSON.stringify(tasks));
    }

    updateTaskStatus(id, status, dateStr) {
        const tasks = this.getAllTasks();
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.status = status;
            task.dateCompleted = dateStr;
            this.saveTasks(tasks);
        }
    }

    getStats(todayStr) {
        const tasks = this.getAllTasks();

        const totalGain = tasks
            .filter(t => t.status === 'completed')
            .reduce((sum, t) => sum + t.gain, 0);

        const todayGain = tasks
            .filter(t => t.status === 'completed' && t.date === todayStr)
            .reduce((sum, t) => sum + t.gain, 0);

        return {
            totalGain: parseFloat(totalGain.toFixed(2)),
            todayGain: parseFloat(todayGain.toFixed(2))
        };
    }
}
