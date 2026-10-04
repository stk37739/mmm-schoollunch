"use strict";

const NodeHelper = require("node_helper");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { parseMenu, resolveWeekStart, ymd } = require("./parser");

module.exports = NodeHelper.create({
  socketNotificationReceived(notification, config) {
    if (notification === "SCHOOL_LUNCH_FETCH") this.fetchMenu(config);
  },

  async fetchMenu(config) {
    if (this.busy) return;
    this.busy = true;

    const imap = config.imap || {};
    const client = new ImapFlow({
      host: imap.host,
      port: imap.port || 993,
      secure: imap.secure !== false,
      auth: {
        user: imap.user || process.env.SCHOOL_LUNCH_IMAP_USER,
        pass: imap.password || process.env.SCHOOL_LUNCH_IMAP_PASSWORD
      },
      logger: false
    });
    client.on("error", (err) => console.error("[MMM-SchoolLunch] IMAP:", err.message));

    try {
      await client.connect();
      const lock = await client.getMailboxLock(config.mailbox || "INBOX");
      let result = null;

      try {
        const query = { since: new Date(Date.now() - config.searchDays * 86400000) };
        if (config.from) query.from = config.from;
        if (config.subject) query.subject = config.subject;

        const uids = ((await client.search(query, { uid: true })) || []).sort((a, b) => b - a);
        if (config.debug) console.log(`[MMM-SchoolLunch] ${uids.length} matching email(s)`);

        // Newest first; skip anything that doesn't look like a menu
        for (const uid of uids.slice(0, 5)) {
          const msg = await client.fetchOne(String(uid), { source: true, internalDate: true }, { uid: true });
          const mail = await simpleParser(msg.source);
          const parsed = parseMenu(mail.text || "", config);

          if (config.debug) {
            console.log(`[MMM-SchoolLunch] "${mail.subject}" -> found ${parsed.found} day(s)`);
            console.log("----- email text as the module sees it -----\n" + (mail.text || "").slice(0, 20000));
            console.log("----- parsed -----\n" + JSON.stringify(parsed, null, 2));
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
          `No lunch menu found in the last ${config.searchDays} days. Check the from/subject settings.`
        );
      }
    } catch (err) {
      console.error("[MMM-SchoolLunch]", err);
      this.sendSocketNotification("SCHOOL_LUNCH_ERROR", `Couldn't read email: ${err.responseText || err.message}`);
    } finally {
      if (client.usable) await client.logout().catch(() => {});
      this.busy = false;
    }
  }
});
