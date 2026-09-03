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

      const attendees = [{ email: GUY_CALENDAR_EMAIL, responseStatus: "accepted" }];
      if (clientEmail) {
        attendees.push({ email: clientEmail });
      }

      const eventResource = {
        summary: `שיחה עם גיא הדס | ${clientName}`,
        description: `שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\n\nמשתתפים:\n- ${clientName} (${clientPhone}, ${clientEmail})\n- גיא הדס (${GUY_CALENDAR_EMAIL})\n\nשיחה אישית ודיסקרטית תחת NDA.`,
        start: {
          dateTime: startIso,
          timeZone: "Asia/Jerusalem"
        },
        end: {
          dateTime: endIso,
          timeZone: "Asia/Jerusalem"
        },
        attendees: attendees,
        conferenceData: {
          createRequest: {
            requestId: `meet_${context.params.slotId}_${Date.now()}`,
            conferenceSolutionKey: { type: "hangoutsMeet" }
          }
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
        conferenceDataVersion: 1,
        sendUpdates: "all",
        requestBody: eventResource
      });

      console.log("Successfully created Google Calendar Event:", res.data.id);

      const meetLink = res.data.hangoutLink || (res.data.conferenceData?.entryPoints?.find(e => e.entryPointType === "video")?.uri) || "https://meet.google.com/guy-hadas-ops";

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

    const attendees = [{ email: GUY_CALENDAR_EMAIL, responseStatus: "accepted" }];
    if (clientEmail) attendees.push({ email: clientEmail });

    const eventResource = {
      summary: `שיחה עם גיא הדס | ${clientName || 'לקוח'}`,
      description: `שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\n\nמשתתפים:\n- ${clientName} (${clientPhone}, ${clientEmail})\n- גיא הדס (${GUY_CALENDAR_EMAIL})\n\nשיחה אישית ודיסקרטית תחת NDA.`,
      start: {
        dateTime: slotData.startIso,
        timeZone: "Asia/Jerusalem"
      },
      end: {
        dateTime: slotData.endIso,
        timeZone: "Asia/Jerusalem"
      },
      attendees: attendees,
      conferenceData: {
        createRequest: {
          requestId: `meet_${slotData.slotId}_${Date.now()}`,
          conferenceSolutionKey: { type: "hangoutsMeet" }
        }
      }
    };

    const calendarRes = await calendar.events.insert({
      calendarId: GUY_CALENDAR_EMAIL,
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: eventResource
    });

    const meetLink = calendarRes.data.hangoutLink || "https://meet.google.com/guy-hadas-ops";

    res.status(200).json({
      success: true,
      eventId: calendarRes.data.id,
      htmlLink: calendarRes.data.htmlLink,
      meetLink: meetLink
    });
  } catch (err) {
    console.error("Direct calendar injection error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
