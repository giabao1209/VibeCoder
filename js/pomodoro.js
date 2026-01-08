/**
 * Pomodoro Module - Timer with work/break cycles
 */

const Pomodoro = {
    currentDate: new Date(),
    isRunning: false,
    isBreak: false,
    timeLeft: 25 * 60, // seconds
    totalTime: 25 * 60,
    sessions: 0,
    interval: null,

    /**
     * Initialize the Pomodoro module
     */
    init() {
        this.loadState();
        this.bindEvents();
        this.render();
    },

    /**
     * Load state for current date
     */
    loadState() {
        const saved = Storage.getForDate(Storage.KEYS.POMODORO, this.currentDate);
        if (saved) {
            this.sessions = saved.sessions || 0;
        } else {
            this.sessions = 0;
        }
        this.updateSessionCounter();
    },

    /**
     * Save state for current date
     */
    saveState() {
        Storage.saveForDate(Storage.KEYS.POMODORO, this.currentDate, {
            sessions: this.sessions
        });
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        document.getElementById('startPauseBtn').addEventListener('click', () => this.toggleTimer());
        document.getElementById('resetBtn').addEventListener('click', () => this.reset());
        document.getElementById('skipBtn').addEventListener('click', () => this.skip());
        
        // Settings inputs
        document.getElementById('workMinutes').addEventListener('change', (e) => {
            if (!this.isRunning && !this.isBreak) {
                this.totalTime = parseInt(e.target.value) * 60;
                this.timeLeft = this.totalTime;
                this.render();
            }
        });
    },

    /**
     * Toggle timer start/pause
     */
    toggleTimer() {
        if (this.isRunning) {
            this.pause();
        } else {
            this.start();
        }
    },

    /**
     * Start the timer
     */
    start() {
        this.isRunning = true;
        this.updateStartButton();
        
        this.interval = setInterval(() => {
            this.timeLeft--;
            
            if (this.timeLeft <= 0) {
                this.complete();
            } else {
                this.render();
            }
        }, 1000);
    },

    /**
     * Pause the timer
     */
    pause() {
        this.isRunning = false;
        clearInterval(this.interval);
        this.updateStartButton();
    },

    /**
     * Reset the timer
     */
    reset() {
        this.pause();
        this.isBreak = false;
        this.timeLeft = parseInt(document.getElementById('workMinutes').value) * 60;
        this.totalTime = this.timeLeft;
        this.updatePanelMode();
        this.render();
    },

    /**
     * Skip to next phase
     */
    skip() {
        this.complete();
    },

    /**
     * Complete current phase
     */
    complete() {
        this.pause();
        this.playNotification();

        if (this.isBreak) {
            // Break completed, back to work
            this.isBreak = false;
            this.timeLeft = parseInt(document.getElementById('workMinutes').value) * 60;
            this.totalTime = this.timeLeft;
        } else {
            // Work completed, increment session and start break
            this.sessions++;
            this.saveState();
            this.updateSessionCounter();
            
            this.isBreak = true;
            this.timeLeft = parseInt(document.getElementById('breakMinutes').value) * 60;
            this.totalTime = this.timeLeft;
        }

        this.updatePanelMode();
        this.render();
    },

    /**
     * Play notification sound
     */
    playNotification() {
        const audio = document.getElementById('notificationSound');
        if (audio) {
            audio.currentTime = 0;
            audio.play().catch(() => {}); // Ignore autoplay errors
        }
    },

    /**
     * Update the start/pause button
     */
    updateStartButton() {
        const btn = document.getElementById('startPauseBtn');
        if (this.isRunning) {
            btn.textContent = '⏸ Pause';
            btn.classList.add('running');
        } else {
            btn.textContent = '▶ Start';
            btn.classList.remove('running');
        }
    },

    /**
     * Update session counter display
     */
    updateSessionCounter() {
        document.getElementById('sessionCounter').textContent = `Session: ${this.sessions}`;
    },

    /**
     * Update panel mode (work/break)
     */
    updatePanelMode() {
        const panel = document.querySelector('.pomodoro-panel');
        const label = document.getElementById('timerLabel');
        
        if (this.isBreak) {
            panel.classList.add('break-mode');
            label.textContent = 'Break Time';
        } else {
            panel.classList.remove('break-mode');
            label.textContent = 'Focus Time';
        }
    },

    /**
     * Set current date and reload
     */
    setDate(date) {
        this.currentDate = date;
        this.loadState();
    },

    /**
     * Render the timer display
     */
    render() {
        // Update time display
        const minutes = Math.floor(this.timeLeft / 60);
        const seconds = this.timeLeft % 60;
        document.getElementById('timerDisplay').textContent = 
            `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

        // Update progress ring
        const progress = document.getElementById('timerProgress');
        const circumference = 2 * Math.PI * 90; // radius = 90
        const offset = circumference * (1 - this.timeLeft / this.totalTime);
        progress.style.strokeDasharray = circumference;
        progress.style.strokeDashoffset = offset;
    }
};

// Make available globally
window.Pomodoro = Pomodoro;
