/* global Module, config */

Module.register("MMM-SchoolLunch", {
  defaults: {
    title: "School Lunch",

    // Mailbox to read. Gmail needs an app password (see README).
    // You can also set SCHOOL_LUNCH_IMAP_USER / SCHOOL_LUNCH_IMAP_PASSWORD
    // as environment variables instead of putting them here.
    imap: { host: "imap.gmail.com", port: 993, secure: true, user: "", password: "" },
    mailbox: "INBOX",
    from: "", // part of the sender address, e.g. "lunch@school.org"
    subject: "", // word(s) in the subject, e.g. "lunch menu"
    searchDays: 21, // how far back to look for the menu email
    weekOffset: 0, // set to 1 if the email arrives mid-week for NEXT week

    // Parsing (see README). Newsletters need startAfter/endBefore.
    startAfter: "", // regex; only read the email from the first matching line on
    endBefore: "", // regex; stop reading at the first matching line
    stopPatterns: [], // regex strings; a matching line ends the current day
    ignorePatterns: [], // regex strings; matching lines are dropped
    blankLineEndsDay: false,
    splitInline: true, // "Monday: A, B, C" becomes three items
    splitOr: false, // "Pizza or Quesadilla" becomes "Pizza" / "or Quesadilla"
    debug: false, // log the email text and parse result to the MagicMirror console

    // Display
    layout: "vertical", // "vertical" (sidebar) or "horizontal" (top/bottom bar)
    dayFormat: "short", // "short" = Mon, "long" = Monday
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

    // Move the "today" highlight after midnight
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

    if (!this.menu) {
      wrapper.className += " dimmed light small";
      wrapper.textContent = this.error || "Loading lunch menu…";
      return wrapper;
    }

    const loc = config.locale || config.language || "en";
    const [y, m, d] = this.menu.weekStart.split("-").map(Number);
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const days = document.createElement("div");
    days.className = `sl-days ${this.config.layout}`;

    this.menu.days.forEach((items, i) => {
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

      if (items.length) {
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

    // Footer: which week this is, plus any problems refreshing
    const weekEnd = new Date(y, m - 1, d + 7);
    const note = document.createElement("div");
    note.className = "sl-note xsmall dimmed light";
    note.textContent = `Week of ${new Date(y, m - 1, d).toLocaleDateString(loc, { month: "short", day: "numeric" })}`;
    if (startOfToday >= weekEnd) note.textContent += " · waiting for the new menu";
    if (this.error) note.textContent += " · couldn't refresh";
    wrapper.appendChild(note);

    return wrapper;
  }
});
