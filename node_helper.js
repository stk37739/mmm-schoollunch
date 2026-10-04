"use strict";

const NodeHelper = require("node_helper");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { parseMenu, resolveWeekStart, ymd } = require("./parser");

module.exports = NodeHelper.create({
  socketNotificationReceived(notification, config) {
    if (notification === "SCHOOL_LUNCH_FETCH") {
      this.fetchMenu(config).catch((err) => {
        console.error("[MMM-SchoolLunch] Unhandled fetch error:", err);
        this.sendSocketNotification("SCHOOL_LUNCH_ERROR", "Internal error checking email");
        this.busy = false;
      });
    }
  },

  async fetchMenu(config) {
    if (this.busy) return;
    this.busy = true;

    const imap = config.imap || {};
    const user = imap.user || process.env.SCHOOL_LUNCH_IMAP_USER;
    const pass = imap.password || process.env.SCHOOL_LUNCH_IMAP_PASSWORD;

    if (!user || !pass) {
      this.sendSocketNotification(
        "SCHOOL_LUNCH_ERROR",
        "IMAP credentials missing. Set user/password in config.js or environment variables."
      );
      this.busy = false;
      return;
    }

    const client = new ImapFlow({
      host: imap.host || "imap.gmail.com",
      port: Number(imap.port) || 993,
      secure: imap.secure !== false,
      auth: { user, pass },
      logger: false,
      clientInfo: { name: "MagicMirror-SchoolLunch" }
    });

    client.on("error", (err) => {
      console.error("[MMM-SchoolLunch] IMAP Client Error:", err ? err.message : err);
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock(config.mailbox || "INBOX");
      let result = null;

      try {
        const query = { since: new Date(Date.now() - (config.searchDays || 21) * 86400000) };
        if (config.from) query.from = config.from;
        if (config.subject) query.subject = config.subject;

        const searchResults = await client.search(query, { uid: true });
        const uids = (searchResults || []).sort((a, b) => b - a);

        if (config.debug) {
          console.log(`[MMM-SchoolLunch] Found ${uids.length} matching email(s)`);
        }

        for (const uid of uids.slice(0, 5)) {
          const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          if (!msg || !msg.source) continue;

          const mail = await simpleParser(msg.source);
          const parsed = parseMenu(mail.text || mail.html || "", config);

          if (config.debug) {
            console.log(`[MMM-SchoolLunch] "${mail.subject}" -> found ${parsed.found} day(s)`);
          }

          if (parsed.found < 2) continue;

          const received = mail.date || msg.internalDate || new Date();
          result = {
            days: parsed.days,
            weekStart: ymd(resolveWeekStart(parsed, received, config.weekOffset || 0)),
            subject: mail.subject || "",
            received: received.toISOString()
          };
          break;
        }
      } finally {
        lock.release();
      }

      if (result) {
        this.sendSocketNotification("SCHOOL_LUNCH_DATA", result);
      } else {
        this.sendSocketNotification(
          "SCHOOL_LUNCH_ERROR",
          `No lunch menu found in the last ${config.searchDays || 21} days.`
        );
      }
    } catch (err) {
      console.error("[MMM-SchoolLunch] Error running fetchMenu:", err);
      const msg = err && (err.responseText || err.message) ? (err.responseText || err.message) : "Failed to connect to email";
      this.sendSocketNotification("SCHOOL_LUNCH_ERROR", `IMAP Error: ${msg}`);
    } finally {
      try {
        if (client.usable) await client.logout();
      } catch (e) {
        // ignore logout errors
      }
      this.busy = false;
    }
  }
});
