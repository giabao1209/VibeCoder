/**
 * VibeCoder - Main App Initialization
 */

const App = {
    currentDate: new Date(),

    /**
     * Initialize the app
     */
    init() {
        this.initDateNavigation();
        this.updateDateDisplay();
        
        // Initialize all modules
        Tasks.init();
        Pomodoro.init();
        TimeLogger.init();
        Calendar.init();

        // Register Service Worker for PWA
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('./sw.js')
                .then(() => console.log('✅ Service Worker registered'))
                .catch(err => console.log('SW registration failed:', err));
        }

        console.log('🚀 VibeCoder initialized!');
    },

    /**
     * Initialize date navigation
     */
    initDateNavigation() {
        document.getElementById('prevDay').addEventListener('click', () => this.navigateDate(-1));
        document.getElementById('nextDay').addEventListener('click', () => this.navigateDate(1));
    },

    /**
     * Navigate to previous/next day
     */
    navigateDate(delta) {
        this.currentDate = new Date(this.currentDate);
        this.currentDate.setDate(this.currentDate.getDate() + delta);
        
        // Don't allow future dates
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        if (this.currentDate > today) {
            this.currentDate = new Date();
        }

        this.updateDateDisplay();
        this.syncModules();
    },

    /**
     * Update date display in header
     */
    updateDateDisplay() {
        const display = document.getElementById('currentDate');
        display.textContent = Storage.formatDateDisplay(this.currentDate);
        
        // Disable next button if today
        const nextBtn = document.getElementById('nextDay');
        const today = new Date();
        const isToday = Storage.getDateKey(this.currentDate) === Storage.getDateKey(today);
        nextBtn.style.opacity = isToday ? '0.3' : '1';
        nextBtn.style.pointerEvents = isToday ? 'none' : 'auto';
    },

    /**
     * Sync all modules to current date
     */
    syncModules() {
        Tasks.setDate(this.currentDate);
        Pomodoro.setDate(this.currentDate);
        TimeLogger.setDate(this.currentDate);
    }
};

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// Make available globally
window.App = App;
