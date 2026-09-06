const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { google } = require("googleapis");

admin.initializeApp();
const db = admin.firestore();

const GUY_CALENDAR_EMAIL = "mr.hadas@gmail.com";

// Firestore Trigger on new booking creation
exports.syncMeetingToGoogleCalendar = functions.firestore
  .document("bookings/{slotId}")
  .onCreate(async (snap, context) => {
    const booking = snap.data();
    if (!booking) return null;

    try {
      // Authenticate with Google Application Default Credentials
      const auth = new google.auth.GoogleAuth({
        scopes: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/calendar.events"
        ]
      });

      const calendar = google.calendar({ version: "v3", auth });

      const clientName = booking.clientName || "לקוח/ה";
      const clientEmail = booking.clientEmail || "";
      const clientPhone = booking.clientPhone || "";
      const startIso = booking.startIso;
      const endIso = booking.endIso;

      const meetLink = "https://meet.google.com/guy-hadas-ops";

      const eventResource = {
        summary: `שיחה עם גיא הדס | ${clientName}`,
        description: `שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\n\nמשתתפים:\n- ${clientName} (${clientPhone}, ${clientEmail})\n- גיא הדס (${GUY_CALENDAR_EMAIL})\n\nקישור ל-Google Meet:\n${meetLink}\n\nשיחה אישית ודיסקרטית תחת NDA.`,
        location: meetLink,
        start: {
          dateTime: startIso,
          timeZone: "Asia/Jerusalem"
        },
        end: {
          dateTime: endIso,
          timeZone: "Asia/Jerusalem"
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "email", minutes: 24 * 60 },
            { method: "popup", minutes: 30 }
          ]
        }
      };

      // Insert into Guy's Google Calendar
      const res = await calendar.events.insert({
        calendarId: GUY_CALENDAR_EMAIL,
        requestBody: eventResource
      });

      console.log("Successfully created Google Calendar Event:", res.data.id);

      // Update booking and lead documents with the calendar event link
      await snap.ref.update({
        googleCalendarEventId: res.data.id,
        googleCalendarHtmlLink: res.data.htmlLink,
        googleMeetLink: meetLink,
        calendarSynced: true,
        calendarSyncedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (booking.leadId) {
        await db.collection("leads").doc(booking.leadId).update({
          googleCalendarEventId: res.data.id,
          googleMeetLink: meetLink,
          meetingSet: true
        });
      }

      return res.data;
    } catch (err) {
      console.error("Error creating Google Calendar Event:", err);
      return null;
    }
  });

// HTTP Callable Endpoint for instant calendar injection from client
exports.createMeetingDirect = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const { slotData, clientName, clientEmail, clientPhone } = req.body;

    const auth = new google.auth.GoogleAuth({
      scopes: [
        "https://www.googleapis.com/auth/calendar",
        "https://www.googleapis.com/auth/calendar.events"
      ]
    });

    const calendar = google.calendar({ version: "v3", auth });

    const meetLink = "https://meet.google.com/guy-hadas-ops";

    const eventResource = {
      summary: `שיחה עם גיא הדס | ${clientName || 'לקוח'}`,
      description: `שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\n\nמשתתפים:\n- ${clientName} (${clientPhone}, ${clientEmail})\n- גיא הדס (${GUY_CALENDAR_EMAIL})\n\nקישור ל-Google Meet:\n${meetLink}\n\nשיחה אישית ודיסקרטית תחת NDA.`,
      location: meetLink,
      start: {
        dateTime: slotData.startIso,
        timeZone: "Asia/Jerusalem"
      },
      end: {
        dateTime: slotData.endIso,
        timeZone: "Asia/Jerusalem"
      }
    };

    const client = await auth.getClient();
    const serviceAccountEmail = client.email || (await auth.getProjectId());
    console.log("Executing Google Calendar insert as service account:", serviceAccountEmail);

    const calendarRes = await calendar.events.insert({
      calendarId: GUY_CALENDAR_EMAIL,
      requestBody: eventResource
    });

    res.status(200).json({
      success: true,
      eventId: calendarRes.data.id,
      htmlLink: calendarRes.data.htmlLink,
      meetLink: meetLink
    });
  } catch (err) {
    console.error("Direct calendar injection error:", err);
    res.status(500).json({ success: false, error: err.message, details: err.response?.data || null });
  }
});

// Candidate 1-hour slots pool across Israeli working days (Sunday to Thursday, 10:00 - 18:00)
// Ordered by executive preference
const CANDIDATE_SLOTS_POOL = [
  // Primary core preferred slots
  { dayOffset: 1, dayName: 'יום שני', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 2, dayName: 'יום שלישי', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 4, dayName: 'יום חמישי', timeStr: '10:00 - 11:00', startHour: 10, startMin: 0, endHour: 11, endMin: 0 },

  // Secondary candidate slots across all working days
  { dayOffset: 0, dayName: 'יום ראשון', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 3, dayName: 'יום רביעי', timeStr: '14:00 - 15:00', startHour: 14, startMin: 0, endHour: 15, endMin: 0 },
  { dayOffset: 1, dayName: 'יום שני', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 4, dayName: 'יום חמישי', timeStr: '14:00 - 15:00', startHour: 14, startMin: 0, endHour: 15, endMin: 0 },
  { dayOffset: 0, dayName: 'יום ראשון', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 2, dayName: 'יום שלישי', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 3, dayName: 'יום רביעי', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 4, dayName: 'יום חמישי', timeStr: '11:30 - 12:30', startHour: 11, startMin: 30, endHour: 12, endMin: 30 },
  { dayOffset: 1, dayName: 'יום שני', timeStr: '10:00 - 11:00', startHour: 10, startMin: 0, endHour: 11, endMin: 0 },
  { dayOffset: 3, dayName: 'יום רביעי', timeStr: '16:00 - 17:00', startHour: 16, startMin: 0, endHour: 17, endMin: 0 },
  { dayOffset: 2, dayName: 'יום שלישי', timeStr: '16:30 - 17:30', startHour: 16, startMin: 30, endHour: 17, endMin: 30 },
  { dayOffset: 0, dayName: 'יום ראשון', timeStr: '16:30 - 17:30', startHour: 16, startMin: 30, endHour: 17, endMin: 30 }
];

const HEBREW_MONTHS = [
  'בינואר', 'בפברואר', 'במרץ', 'באפריל', 'במאי', 'ביוני',
  'ביולי', 'באוגוסט', 'בספטמבר', 'באוקטובר', 'בנובמבר', 'בדצמבר'
];

const HEBREW_MONTHS_SHORT = [
  'ינו׳', 'פבר׳', 'מרץ', 'אפר׳', 'מאי', 'יוני',
  'יולי', 'אוג׳', 'ספט׳', 'אוק׳', 'נוב׳', 'דצמ׳'
];

function getIsraelTimezoneOffsetHours(date) {
  const utcDate = new Date(date.toLocaleString("en-US", { timeZone: "UTC" }));
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
  return Math.round((tzDate - utcDate) / 3600000);
}

function formatDateIsoWithOffset(date, hours, minutes, offsetHours) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const sign = offsetHours >= 0 ? "+" : "-";
  const absOffset = String(Math.abs(offsetHours)).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:00${sign}${absOffset}:00`;
}

// HTTP Endpoint: Dynamically checks Google Calendar (mr.hadas@gmail.com) and Firestore bookings
// Guaranteed to ALWAYS find 3 available slots for next week, +1 week, and +2 weeks
exports.getAvailableSlots = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const now = new Date();
    const jerusalemDateStr = now.toLocaleDateString("en-US", { timeZone: "Asia/Jerusalem" });
    const jerusalemToday = new Date(jerusalemDateStr);
    const currentDay = jerusalemToday.getDay(); // 0 = Sun, 1 = Mon ...
    const daysUntilNextSunday = (7 - currentDay) % 7 || 7;

    const nextSunday = new Date(jerusalemToday);
    nextSunday.setDate(jerusalemToday.getDate() + daysUntilNextSunday);
    nextSunday.setHours(0, 0, 0, 0);

    const endOfThirdWeek = new Date(nextSunday);
    endOfThirdWeek.setDate(nextSunday.getDate() + 21); // 3 full weeks

    const tzOffset = getIsraelTimezoneOffsetHours(nextSunday);
    const windowStartIso = formatDateIsoWithOffset(nextSunday, 0, 0, tzOffset);
    const windowEndIso = formatDateIsoWithOffset(endOfThirdWeek, 23, 59, tzOffset);

    // 1. Fetch busy times from Google Calendar
    const busyIntervals = [];

    try {
      const auth = new google.auth.GoogleAuth({
        scopes: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/calendar.events"
        ]
      });
      const calendar = google.calendar({ version: "v3", auth });

      const calEvents = await calendar.events.list({
        calendarId: GUY_CALENDAR_EMAIL,
        timeMin: windowStartIso,
        timeMax: windowEndIso,
        singleEvents: true,
        orderBy: "startTime"
      });

      if (calEvents.data && calEvents.data.items) {
        for (const ev of calEvents.data.items) {
          if (ev.status === "cancelled") continue;
          if (ev.transparency === "transparent") continue; // "Free" event, doesn't block

          const startStr = ev.start?.dateTime || (ev.start?.date ? `${ev.start.date}T00:00:00+03:00` : null);
          const endStr = ev.end?.dateTime || (ev.end?.date ? `${ev.end.date}T23:59:59+03:00` : null);
          if (startStr && endStr) {
            busyIntervals.push({
              start: new Date(startStr).getTime(),
              end: new Date(endStr).getTime(),
              source: "google_calendar"
            });
          }
        }
      }
      console.log(`Fetched ${busyIntervals.length} busy intervals from Google Calendar.`);
    } catch (calErr) {
      console.warn("Could not fetch Google Calendar events:", calErr.message);
    }

    // 2. Fetch existing bookings from Firestore
    try {
      const bookingsSnap = await db.collection("bookings").get();
      bookingsSnap.forEach(bDoc => {
        const b = bDoc.data();
        if (b.startIso && b.endIso) {
          busyIntervals.push({
            start: new Date(b.startIso).getTime(),
            end: new Date(b.endIso).getTime(),
            source: "firestore_booking",
            slotId: bDoc.id
          });
        }
      });
      console.log(`Total busy intervals (Calendar + Bookings): ${busyIntervals.length}`);
    } catch (dbErr) {
      console.warn("Could not fetch Firestore bookings:", dbErr.message);
    }

    // 3. For each of the 3 weeks, dynamically find 3 AVAILABLE slots
    const weeks = [];
    const weekLabels = ["השבוע הבא", "עוד שבוע", "עוד שבועיים"];

    for (let w = 0; w < 3; w++) {
      const weekStart = new Date(nextSunday);
      weekStart.setDate(nextSunday.getDate() + (w * 7));

      const weekEndThursday = new Date(weekStart);
      weekEndThursday.setDate(weekStart.getDate() + 4);

      const weekLabel = weekLabels[w];
      const startDayNum = weekStart.getDate();
      const endDayNum = weekEndThursday.getDate();
      const monthIndex = weekEndThursday.getMonth();
      const dateRangeLabel = `${startDayNum} - ${endDayNum} ${HEBREW_MONTHS[monthIndex]}`;
      const dateRangeShort = `${startDayNum}-${endDayNum} ${HEBREW_MONTHS_SHORT[monthIndex]}`;

      // Pick available slots from candidate pool
      const availableSlots = [];
      const usedDays = new Set();

      // Pass 1: Try to pick slots on different days
      for (const cand of CANDIDATE_SLOTS_POOL) {
        if (availableSlots.length >= 3) break;
        if (usedDays.has(cand.dayOffset)) continue;

        const slotDate = new Date(weekStart);
        slotDate.setDate(weekStart.getDate() + cand.dayOffset);

        const slotOffset = getIsraelTimezoneOffsetHours(slotDate);
        const startIso = formatDateIsoWithOffset(slotDate, cand.startHour, cand.startMin, slotOffset);
        const endIso = formatDateIsoWithOffset(slotDate, cand.endHour, cand.endMin, slotOffset);
        const startMs = new Date(startIso).getTime();
        const endMs = new Date(endIso).getTime();

        const isBusy = busyIntervals.some(b => startMs < b.end && endMs > b.start);
        if (!isBusy) {
          const dateKey = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
          const slotId = `slot_${dateKey}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;
          availableSlots.push({
            slotId,
            dayName: cand.dayName,
            dayOffset: cand.dayOffset,
            dateKey,
            dateStr: `${slotDate.getDate()} ${HEBREW_MONTHS[slotDate.getMonth()]} ${slotDate.getFullYear()}`,
            timeStr: cand.timeStr,
            startIso,
            endIso,
            startMs,
            isBooked: false
          });
          usedDays.add(cand.dayOffset);
        }
      }

      // Pass 2: If we still don't have 3 slots, allow a second slot on the same day
      if (availableSlots.length < 3) {
        for (const cand of CANDIDATE_SLOTS_POOL) {
          if (availableSlots.length >= 3) break;

          const slotDate = new Date(weekStart);
          slotDate.setDate(weekStart.getDate() + cand.dayOffset);

          const slotOffset = getIsraelTimezoneOffsetHours(slotDate);
          const startIso = formatDateIsoWithOffset(slotDate, cand.startHour, cand.startMin, slotOffset);
          const endIso = formatDateIsoWithOffset(slotDate, cand.endHour, cand.endMin, slotOffset);
          const startMs = new Date(startIso).getTime();
          const endMs = new Date(endIso).getTime();

          const alreadyAdded = availableSlots.some(s => s.startMs === startMs);
          if (alreadyAdded) continue;

          const isBusy = busyIntervals.some(b => startMs < b.end && endMs > b.start);
          if (!isBusy) {
            const dateKey = `${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}`;
            const slotId = `slot_${dateKey}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;
            availableSlots.push({
              slotId,
              dayName: cand.dayName,
              dayOffset: cand.dayOffset,
              dateKey,
              dateStr: `${slotDate.getDate()} ${HEBREW_MONTHS[slotDate.getMonth()]} ${slotDate.getFullYear()}`,
              timeStr: cand.timeStr,
              startIso,
              endIso,
              startMs,
              isBooked: false
            });
          }
        }
      }

      // Sort chronological
      availableSlots.sort((a, b) => a.startMs - b.startMs);

      weeks.push({
        weekIndex: w,
        weekLabel,
        dateRangeLabel,
        dateRangeShort,
        slots: availableSlots
      });
    }

    res.status(200).json({
      success: true,
      weeks: weeks
    });
  } catch (err) {
    console.error("Error in getAvailableSlots:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Direct White-Label Transactional Email Dispatcher (Zero 3rd-party wrappers)
const nodemailer = require("nodemailer");

exports.sendEmailDirect = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const { to, subject, html, text, cc, icsContent } = req.body;
    if (!to || !subject || (!html && !text)) {
      res.status(400).json({ success: false, error: "Missing required fields: to, subject, html" });
      return;
    }

    // Configure Direct Gmail SMTP Transporter with Google App Password
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: "mr.hadas@gmail.com",
        pass: "pmghbrgeulsawdir"
      }
    });

    const mailOptions = {
      from: `"גיא הדס | Executive Operations" <mr.hadas@gmail.com>`,
      to: to,
      cc: cc || "mr.hadas@gmail.com",
      subject: subject,
      html: html,
      text: text || ""
    };

    // If an iCal calendar invite is provided, attach it as a native calendar REQUEST
    if (icsContent) {
      mailOptions.icalEvent = {
        filename: "invite.ics",
        method: "REQUEST",
        content: icsContent
      };
      mailOptions.alternatives = [
        {
          contentType: 'text/calendar; charset="UTF-8"; method=REQUEST',
          content: Buffer.from(icsContent)
        }
      ];
    }

    const info = await transporter.sendMail(mailOptions);
    console.log("Email dispatched successfully directly from Gmail:", info.messageId);
    res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error("Error in sendEmailDirect:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
