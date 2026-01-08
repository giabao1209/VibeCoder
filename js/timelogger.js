/**
 * Time Logger Module - Manual toggle-based time tracking with task names
 */

const TimeLogger = {
    currentDate: new Date(),
    isRunning: false,
    startTime: null,
    elapsed: 0,
    logs: [],
    interval: null,
    currentTaskName: '',

    /**
     * Initialize the time logger module
     */
    init() {
        this.loadLogs();
        this.bindEvents();
        this.render();
    },

    /**
     * Load logs for current date
     */
    loadLogs() {
        const saved = Storage.getForDate(Storage.KEYS.TIME_LOGS, this.currentDate);
        this.logs = saved || [];
        this.updateTotalTime();
    },

    /**
     * Save logs for current date
     */
    saveLogs() {
        Storage.saveForDate(Storage.KEYS.TIME_LOGS, this.currentDate, this.logs);
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        document.getElementById('toggleLoggerBtn').addEventListener('click', () => this.toggle());
    },

    /**
     * Toggle the logger on/off
     */
    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
    },

    /**
     * Start tracking time
     */
    start() {
        const taskInput = document.getElementById('loggerTaskName');
        this.currentTaskName = taskInput.value.trim() || 'Untitled Session';
        
        this.isRunning = true;
        this.startTime = Date.now();
        this.elapsed = 0;
        
        // Disable input while running
        taskInput.disabled = true;
        taskInput.style.opacity = '0.6';
        
        this.updateToggleButton();
        
        this.interval = setInterval(() => {
            this.elapsed = Date.now() - this.startTime;
            this.render();
        }, 1000);
    },

    /**
     * Stop tracking and log the session
     */
    stop() {
        this.isRunning = false;
        clearInterval(this.interval);
        
        const taskInput = document.getElementById('loggerTaskName');
        taskInput.disabled = false;
        taskInput.style.opacity = '1';
        
        // Only log if at least 1 second elapsed
        if (this.elapsed >= 1000) {
            const log = {
                id: Date.now(),
                name: this.currentTaskName,
                startTime: new Date(this.startTime).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                endTime: new Date().toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                }),
                duration: this.elapsed
            };
            
            this.logs.unshift(log); // Add to beginning
            this.saveLogs();
        }

        this.elapsed = 0;
        this.startTime = null;
        this.currentTaskName = '';
        taskInput.value = '';
        
        this.updateToggleButton();
        this.updateTotalTime();
        this.render();
    },

    /**
     * Update toggle button state
     */
    updateToggleButton() {
        const btn = document.getElementById('toggleLoggerBtn');
        const icon = btn.querySelector('.toggle-icon');
        const text = btn.querySelector('.toggle-text');
        
        if (this.isRunning) {
            btn.classList.add('running');
            icon.textContent = '⏹';
            text.textContent = 'Stop';
        } else {
            btn.classList.remove('running');
            icon.textContent = '▶';
            text.textContent = 'Start';
        }
    },

    /**
     * Update total time display
     */
    updateTotalTime() {
        const total = this.logs.reduce((sum, log) => sum + log.duration, 0);
        const hours = Math.floor(total / 3600000);
        const minutes = Math.floor((total % 3600000) / 60000);
        
        document.getElementById('totalTime').textContent = `Total: ${hours}h ${minutes}m`;
    },

    /**
     * Format milliseconds to HH:MM:SS
     */
    formatTime(ms) {
        const seconds = Math.floor(ms / 1000) % 60;
        const minutes = Math.floor(ms / 60000) % 60;
        const hours = Math.floor(ms / 3600000);
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    },

    /**
     * Format duration for log entries
     */
    formatDuration(ms) {
        const minutes = Math.floor(ms / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);
        
        if (minutes > 0) {
            return `${minutes}m ${seconds}s`;
        }
        return `${seconds}s`;
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    },

    /**
     * Set current date and reload
     */
    setDate(date) {
        // If running, stop first
        if (this.isRunning) {
            this.stop();
        }
        
        this.currentDate = date;
        this.loadLogs();
        this.render();
    },

    /**
     * Render the logger display
     */
    render() {
        // Update current time display
        document.getElementById('loggerDisplay').textContent = this.formatTime(this.elapsed);

        // Update log entries
        const container = document.getElementById('logEntries');
        
        if (this.logs.length === 0) {
            container.innerHTML = '<div class="empty-state">No time logged yet today</div>';
            return;
        }

        container.innerHTML = this.logs.map(log => `
            <div class="log-entry">
                <span class="log-entry-name">${this.escapeHtml(log.name || 'Untitled')}</span>
                <div class="log-entry-details">
                    <span class="log-entry-time">${log.startTime} - ${log.endTime}</span>
                    <span class="log-entry-duration">${this.formatDuration(log.duration)}</span>
                </div>
            </div>
        `).join('');
    }
};

// Make available globally
window.TimeLogger = TimeLogger;

