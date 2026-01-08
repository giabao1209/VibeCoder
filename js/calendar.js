/**
 * Calendar Module - Date picker for navigating to past days
 */

const Calendar = {
    currentMonth: new Date(),
    selectedDate: new Date(),
    isOpen: false,

    /**
     * Initialize the calendar module
     */
    init() {
        this.bindEvents();
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        document.getElementById('openCalendarBtn').addEventListener('click', () => this.open());
        document.getElementById('closeCalendarBtn').addEventListener('click', () => this.close());
        document.getElementById('prevMonth').addEventListener('click', () => this.navigateMonth(-1));
        document.getElementById('nextMonth').addEventListener('click', () => this.navigateMonth(1));
        document.getElementById('goToTodayBtn').addEventListener('click', () => this.goToToday());
        
        // Close on overlay click
        document.getElementById('calendarModal').addEventListener('click', (e) => {
            if (e.target.id === 'calendarModal') this.close();
        });
        
        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen) this.close();
        });
    },

    /**
     * Open the calendar modal
     */
    open() {
        this.isOpen = true;
        this.selectedDate = new Date(App.currentDate);
        this.currentMonth = new Date(App.currentDate);
        document.getElementById('calendarModal').classList.add('active');
        this.render();
    },

    /**
     * Close the calendar modal
     */
    close() {
        this.isOpen = false;
        document.getElementById('calendarModal').classList.remove('active');
    },

    /**
     * Navigate to previous/next month
     */
    navigateMonth(delta) {
        this.currentMonth.setMonth(this.currentMonth.getMonth() + delta);
        this.render();
    },

    /**
     * Go to today and select it
     */
    goToToday() {
        const today = new Date();
        App.currentDate = today;
        App.updateDateDisplay();
        App.syncModules();
        this.close();
    },

    /**
     * Select a date
     */
    selectDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        today.setHours(23, 59, 59, 999);
        
        // Don't allow future dates
        if (date > today) return;
        
        App.currentDate = date;
        App.updateDateDisplay();
        App.syncModules();
        this.close();
    },

    /**
     * Check if a date has data
     */
    hasData(dateStr) {
        const taskDates = Storage.getAvailableDates(Storage.KEYS.TASKS);
        const pomodoroDates = Storage.getAvailableDates(Storage.KEYS.POMODORO);
        const logDates = Storage.getAvailableDates(Storage.KEYS.TIME_LOGS);
        
        return taskDates.includes(dateStr) || 
               pomodoroDates.includes(dateStr) || 
               logDates.includes(dateStr);
    },

    /**
     * Render the calendar
     */
    render() {
        const today = new Date();
        const todayStr = Storage.getDateKey(today);
        const selectedStr = Storage.getDateKey(this.selectedDate);
        
        // Update month display
        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                           'July', 'August', 'September', 'October', 'November', 'December'];
        document.getElementById('calendarMonth').textContent = 
            `${monthNames[this.currentMonth.getMonth()]} ${this.currentMonth.getFullYear()}`;
        
        // Get first day of month and total days
        const firstDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 1);
        const lastDay = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, 0);
        const startDayOfWeek = firstDay.getDay();
        const daysInMonth = lastDay.getDate();
        
        // Get previous month's last days
        const prevMonth = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), 0);
        const prevMonthDays = prevMonth.getDate();
        
        // Build calendar grid
        const grid = document.getElementById('calendarGrid');
        
        // Keep headers
        let html = `
            <div class="cal-header">Sun</div>
            <div class="cal-header">Mon</div>
            <div class="cal-header">Tue</div>
            <div class="cal-header">Wed</div>
            <div class="cal-header">Thu</div>
            <div class="cal-header">Fri</div>
            <div class="cal-header">Sat</div>
        `;
        
        // Previous month days
        for (let i = startDayOfWeek - 1; i >= 0; i--) {
            const day = prevMonthDays - i;
            const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() - 1, day);
            const dateStr = Storage.getDateKey(date);
            const hasData = this.hasData(dateStr);
            
            html += `<div class="cal-day other-month ${hasData ? 'has-data' : ''}" 
                         onclick="Calendar.selectDate('${dateStr}')">${day}</div>`;
        }
        
        // Current month days
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth(), day);
            const dateStr = Storage.getDateKey(date);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === Storage.getDateKey(App.currentDate);
            const isFuture = date > today;
            const hasData = this.hasData(dateStr);
            
            let classes = 'cal-day';
            if (isToday) classes += ' today';
            if (isSelected) classes += ' selected';
            if (isFuture) classes += ' future';
            if (hasData) classes += ' has-data';
            
            html += `<div class="${classes}" onclick="Calendar.selectDate('${dateStr}')">${day}</div>`;
        }
        
        // Next month days (fill remaining cells)
        const totalCells = 42; // 6 rows × 7 days
        const usedCells = startDayOfWeek + daysInMonth;
        const remainingCells = totalCells - usedCells;
        
        for (let day = 1; day <= remainingCells; day++) {
            const date = new Date(this.currentMonth.getFullYear(), this.currentMonth.getMonth() + 1, day);
            const dateStr = Storage.getDateKey(date);
            const isFuture = date > today;
            
            html += `<div class="cal-day other-month ${isFuture ? 'future' : ''}" 
                         onclick="Calendar.selectDate('${dateStr}')">${day}</div>`;
        }
        
        grid.innerHTML = html;
    }
};

// Make available globally
window.Calendar = Calendar;
