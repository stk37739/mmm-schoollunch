/* global Module, config */

Module.register("MMM-SchoolLunch", {
  defaults: {
    title: "School Lunch",
    imap: { host: "imap.gmail.com", port: 993, secure: true, user: "", password: "" },
    mailbox: "INBOX",
    from: "",
    subject: "",
    searchDays: 21,
    weekOffset: 0,
    startAfter: "",
    endBefore: "",
    stopPatterns: [],
    ignorePatterns: [],
    blankLineEndsDay: false,
    splitInline: true,
    splitOr: false,
    debug: false,
    layout: "vertical",
    dayFormat: "short",
    highlightToday: true,
    hidePastDays: false,
    updateInterval: 60 * 60 * 1000,
    animationSpeed: 1000
  },

  getStyles() {
    return ["MMM-SchoolLunch.css"];
  },

  start() {
    this.menu = null;
    this.error = null;
    this.today = new Date().toDateString();

    this.refresh();
    setInterval(() => this.refresh(), this.config.updateInterval);

    setInterval(() => {
      const now = new Date().toDateString();
      if (now !== this.today) {
        this.today = now;
        this.updateDom(this.config.animationSpeed);
      }
    }, 60 * 1000);
  },

  refresh() {
    this.sendSocketNotification("SCHOOL_LUNCH_FETCH", this.config);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "SCHOOL_LUNCH_DATA") {
      this.menu = payload;
      this.error = null;
    } else if (notification === "SCHOOL_LUNCH_ERROR") {
      this.error = payload;
    } else {
      return;
    }
    this.updateDom(this.config.animationSpeed);
  },

  getHeader() {
    return this.data.header || this.config.title;
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "schoollunch";

    if (this.error && !this.menu) {
      wrapper.className += " dimmed light small";
      wrapper.textContent = typeof this.error === "string" ? this.error : "Error loading menu";
      return wrapper;
    }

    if (!this.menu || !this.menu.weekStart) {
      wrapper.className += " dimmed light small";
      wrapper.textContent = "Loading lunch menu…";
      return wrapper;
    }

    const loc = config.locale || config.language || "en";
    const parts = (this.menu.weekStart || "").split("-").map(Number);
    if (parts.length < 3 || parts.some(isNaN)) {
      wrapper.className += " dimmed light small";
      wrapper.textContent = "Invalid menu date format";
      return wrapper;
    }

    const [y, m, d] = parts;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const days = document.createElement("div");
    days.className = `sl-days ${this.config.layout}`;

    (this.menu.days || []).forEach((items, i) => {
      const date = new Date(y, m - 1, d + i);
      const isToday = date.getTime() === startOfToday.getTime();
      const isPast = date < startOfToday;
      if (isPast && this.config.hidePastDays) return;

      const day = document.createElement("div");
      day.className = "sl-day";
      if (isToday && this.config.highlightToday) day.className += " today";
      if (isPast) day.className += " past";

      const name = document.createElement("div");
      name.className = "sl-name small";
      name.textContent = date.toLocaleDateString(loc, { weekday: this.config.dayFormat });
      const dateEl = document.createElement("span");
      dateEl.className = "sl-date dimmed";
      dateEl.textContent = " " + date.toLocaleDateString(loc, { month: "numeric", day: "numeric" });
      name.appendChild(dateEl);
      day.appendChild(name);

      if (Array.isArray(items) && items.length) {
        const list = document.createElement("ul");
        list.className = "sl-items small";
        items.forEach((text) => {
          const li = document.createElement("li");
          li.textContent = text;
          list.appendChild(li);
        });
        day.appendChild(list);
      } else {
        const none = document.createElement("div");
        none.className = "sl-empty xsmall dimmed";
        none.textContent = "No menu listed";
        day.appendChild(none);
      }
      days.appendChild(day);
    });
    wrapper.appendChild(days);

    const weekEnd = new Date(y, m - 1, d + 7);
    const note = document.createElement("div");
    note.className = "sl-note xsmall dimmed light";
    note.textContent = `Week of ${new Date(y, m - 1, d).toLocaleDateString(loc, { month: "short", day: "numeric" })}`;
    if (startOfToday >= weekEnd) note.textContent += " · waiting for new menu";
    if (this.error) note.textContent += " · couldn't refresh";
    wrapper.appendChild(note);

    return wrapper;
  }
});
