/**
 * Tasks Module - Daily task diary with tick/untick system
 */

const Tasks = {
    currentDate: new Date(),
    tasks: [],

    /**
     * Initialize the tasks module
     */
    init() {
        this.loadTasks();
        this.bindEvents();
        this.render();
    },

    /**
     * Load tasks for current date
     */
    loadTasks() {
        const saved = Storage.getForDate(Storage.KEYS.TASKS, this.currentDate);
        this.tasks = saved || [];
    },

    /**
     * Save tasks for current date
     */
    saveTasks() {
        Storage.saveForDate(Storage.KEYS.TASKS, this.currentDate, this.tasks);
    },

    /**
     * Bind event listeners
     */
    bindEvents() {
        const input = document.getElementById('taskInput');
        const addBtn = document.getElementById('addTaskBtn');
        const carryBtn = document.getElementById('carryTasksBtn');

        // Add task on button click
        addBtn.addEventListener('click', () => this.addTask());

        // Add task on Enter key
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.addTask();
        });

        // Carry unfinished tasks
        carryBtn.addEventListener('click', () => this.carryUnfinishedTasks());
    },

    /**
     * Add a new task
     */
    addTask() {
        const input = document.getElementById('taskInput');
        const text = input.value.trim();
        
        if (!text) return;

        const task = {
            id: Date.now(),
            text: text,
            completed: false,
            createdAt: new Date().toISOString()
        };

        this.tasks.push(task);
        this.saveTasks();
        this.render();
        
        input.value = '';
        input.focus();
    },

    /**
     * Toggle task completion
     */
    toggleTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (task) {
            task.completed = !task.completed;
            this.saveTasks();
            this.render();
        }
    },

    /**
     * Delete a task
     */
    deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveTasks();
        this.render();
    },

    /**
     * Carry unfinished tasks from previous day to today
     */
    carryUnfinishedTasks() {
        const today = new Date();
        const todayKey = Storage.getDateKey(today);
        const currentKey = Storage.getDateKey(this.currentDate);
        
        // Only allow carrying to today
        if (currentKey === todayKey) {
            // Find previous day with tasks
            const allDates = Storage.getAvailableDates(Storage.KEYS.TASKS);
            const prevDates = allDates.filter(d => d < todayKey);
            
            if (prevDates.length === 0) {
                alert('No previous tasks to carry over!');
                return;
            }

            const prevDate = prevDates[prevDates.length - 1];
            const prevTasks = Storage.getForDate(Storage.KEYS.TASKS, new Date(prevDate)) || [];
            const unfinished = prevTasks.filter(t => !t.completed);
            
            if (unfinished.length === 0) {
                alert('All previous tasks were completed! 🎉');
                return;
            }

            // Add unfinished tasks to today
            unfinished.forEach(task => {
                const newTask = {
                    ...task,
                    id: Date.now() + Math.random(),
                    createdAt: new Date().toISOString()
                };
                this.tasks.push(newTask);
            });

            this.saveTasks();
            this.render();
            alert(`Carried ${unfinished.length} task(s) from ${prevDate}`);
        } else {
            alert('Navigate to today to carry tasks!');
        }
    },

    /**
     * Set current date and reload
     */
    setDate(date) {
        this.currentDate = date;
        this.loadTasks();
        this.render();
    },

    /**
     * Render the task list
     */
    render() {
        const list = document.getElementById('taskList');
        const counter = document.getElementById('taskCounter');
        
        // Update counter
        const completed = this.tasks.filter(t => t.completed).length;
        counter.textContent = `${completed}/${this.tasks.length}`;

        // Render tasks
        if (this.tasks.length === 0) {
            list.innerHTML = '<li class="empty-state">No tasks yet. Add one above!</li>';
            return;
        }

        list.innerHTML = this.tasks.map(task => `
            <li class="task-item ${task.completed ? 'completed' : ''}" data-id="${task.id}">
                <div class="task-checkbox ${task.completed ? 'checked' : ''}" 
                     onclick="Tasks.toggleTask(${task.id})"></div>
                <span class="task-text">${this.escapeHtml(task.text)}</span>
                <button class="task-delete" onclick="Tasks.deleteTask(${task.id})">✕</button>
            </li>
        `).join('');
    },

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

// Make available globally
window.Tasks = Tasks;
