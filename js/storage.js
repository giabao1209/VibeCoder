/**
 * Storage Module - LocalStorage wrapper for diary-style data
 */

const Storage = {
  KEYS: {
    TASKS: "vibecoder_tasks",
    POMODORO: "vibecoder_pomodoro",
    TIME_LOGS: "vibecoder_timelogs",
  },

  /**
   * Get today's date as a string key (YYYY-MM-DD)
   */
  getDateKey(date = new Date()) {
    return date.toISOString().split("T")[0];
  },

  /**
   * Format date for display
   */
  formatDateDisplay(date) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const dateStr = this.getDateKey(date);
    const todayStr = this.getDateKey(today);
    const yesterdayStr = this.getDateKey(yesterday);

    if (dateStr === todayStr) return "Today";
    if (dateStr === yesterdayStr) return "Yesterday";

    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  },

  /**
   * Get all data for a specific key
   */
  getAll(key) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : {};
    } catch (e) {
      console.error("Error reading from localStorage:", e);
      return {};
    }
  },

  /**
   * Save all data for a specific key
   */
  saveAll(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.error("Error saving to localStorage:", e);
    }
  },

  /**
   * Get data for a specific date
   */
  getForDate(key, date) {
    const all = this.getAll(key);
    const dateKey = this.getDateKey(date);
    return all[dateKey] || null;
  },

  /**
   * Save data for a specific date
   */
  saveForDate(key, date, data) {
    const all = this.getAll(key);
    const dateKey = this.getDateKey(date);
    all[dateKey] = data;
    this.saveAll(key, all);
  },

  /**
   * Get all dates that have data (for navigation)
   */
  getAvailableDates(key) {
    const all = this.getAll(key);
    return Object.keys(all).sort();
  },
};

// Make available globally
window.Storage = Storage;
