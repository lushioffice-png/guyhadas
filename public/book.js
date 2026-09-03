/**
 * Strategic Operations & Growth Advisory - Meeting Booking Logic
 * Integrated with Cloud Firestore (guyhadas-e38c4) & Google Calendar (mr.hadas@gmail.com)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  getDocs, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyAtlRFde2oI4KkiAwK8DIOT5Yyq68rqm1A",
  authDomain: "guyhadas-e38c4.firebaseapp.com",
  projectId: "guyhadas-e38c4",
  storageBucket: "guyhadas-e38c4.firebasestorage.app",
  messagingSenderId: "83424733373",
  appId: "1:83424733373:web:c7bdc188962b7df3edafd4",
  measurementId: "G-5WBBDT3CR2"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const GUY_CALENDAR_EMAIL = "mr.hadas@gmail.com";

// State
let currentLeadId = null;
let currentLeadData = null;
let bookedSlots = new Set();
let selectedWeekIndex = 0;
let weeksData = [];

// DOM Elements
const bookingGreeting = document.getElementById('booking-greeting');
const weekTabsContainer = document.getElementById('week-tabs');
const slotsLoading = document.getElementById('slots-loading');
const slotsGrid = document.getElementById('slots-grid');
const noSlotsMsg = document.getElementById('no-slots-msg');
const bookingCard = document.getElementById('booking-card');
const introCard = document.getElementById('intro-card');

const bookingConfirmedCard = document.getElementById('booking-confirmed-card');
const summaryDatetime = document.getElementById('summary-datetime');
const summaryAttendees = document.getElementById('summary-attendees');
const googleCalBtn = document.getElementById('google-cal-btn');
const downloadIcsBtn = document.getElementById('download-ics-btn');

// Default 3 Weekly Slots Template (Day of week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 0=Sun)
// Guy's 3 designated weekly 1-hour slots:
const DEFAULT_SLOT_TEMPLATES = [
  { dayOffset: 1, dayName: 'יום שני', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 2, dayName: 'יום שלישי', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 4, dayName: 'יום חמישי', timeStr: '10:00 - 11:00', startHour: 10, startMin: 0, endHour: 11, endMin: 0 }
];

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Get Lead ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentLeadId = urlParams.get('id') || urlParams.get('leadId');

  if (currentLeadId) {
    try {
      const leadSnap = await getDoc(doc(db, "leads", currentLeadId));
      if (leadSnap.exists()) {
        currentLeadData = leadSnap.data();
        if (currentLeadData.fullName) {
          bookingGreeting.textContent = `היי ${currentLeadData.fullName}, בוא נבחר מועד לשיחה`;
        }

        // Check if lead already booked
        if (currentLeadData.meetingSlot && currentLeadData.status === 'meeting_set') {
          showConfirmedScreen(currentLeadData.meetingSlot);
          return;
        }
      }
    } catch (err) {
      console.warn("Could not load lead info:", err);
    }
  }

  // 2. Fetch all booked slots from DB
  await fetchBookedSlots();

  // 3. Generate 3 upcoming available weeks (STRICTLY starting from NEXT week)
  generateUpcomingWeeks();

  // 4. Render Week Tabs and Slots
  renderWeekTabs();
  renderSlotsForCurrentWeek();
});

// Fetch already taken slots
async function fetchBookedSlots() {
  try {
    const querySnapshot = await getDocs(collection(db, "bookings"));
    bookedSlots.clear();
    querySnapshot.forEach(docSnap => {
      bookedSlots.add(docSnap.id);
    });
  } catch (err) {
    console.warn("Error fetching bookings:", err);
  }
}

// Generate next 3 upcoming weeks (Starting from Next Sunday)
function generateUpcomingWeeks() {
  weeksData = [];
  const now = new Date();
  
  // Calculate Next Sunday (Start of next week)
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon...
  const daysUntilNextSunday = (7 - currentDay) % 7 || 7;
  
  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilNextSunday);
  nextSunday.setHours(0, 0, 0, 0);

  // Generate 3 consecutive weeks
  for (let w = 0; w < 3; w++) {
    const weekStart = new Date(nextSunday);
    weekStart.setDate(nextSunday.getDate() + (w * 7));

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 5); // through Thursday/Friday

    const weekLabel = w === 0 
      ? `השבוע הבא (${formatDateShort(weekStart)})`
      : `עוד ${w + 1} שבועות (${formatDateShort(weekStart)})`;

    // 3 slots for this week
    const slots = DEFAULT_SLOT_TEMPLATES.map(tmpl => {
      const slotDate = new Date(weekStart);
      slotDate.setDate(weekStart.getDate() + tmpl.dayOffset);
      
      const startDateTime = new Date(slotDate);
      startDateTime.setHours(tmpl.startHour, tmpl.startMin, 0, 0);

      const endDateTime = new Date(slotDate);
      endDateTime.setHours(tmpl.endHour, tmpl.endMin, 0, 0);

      const dateKey = formatDateKey(slotDate);
      const slotId = `slot_${dateKey}_${String(tmpl.startHour).padStart(2, '0')}${String(tmpl.startMin).padStart(2, '0')}`;
      const isBooked = bookedSlots.has(slotId);

      return {
        slotId,
        dayName: tmpl.dayName,
        dateKey,
        dateStr: formatDateHebrew(slotDate),
        timeStr: tmpl.timeStr,
        startDateTime,
        endDateTime,
        isBooked
      };
    });

    weeksData.push({
      weekIndex: w,
      weekLabel,
      slots
    });
  }
}

function renderWeekTabs() {
  weekTabsContainer.innerHTML = weeksData.map((week, idx) => {
    return `
      <button class="week-tab-btn ${idx === selectedWeekIndex ? 'active' : ''}" data-idx="${idx}">
        ${escapeHtml(week.weekLabel)}
      </button>
    `;
  }).join('');

  document.querySelectorAll('.week-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedWeekIndex = parseInt(btn.getAttribute('data-idx'), 10);
      document.querySelectorAll('.week-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderSlotsForCurrentWeek();
    });
  });
}

function renderSlotsForCurrentWeek() {
  slotsLoading.classList.add('hidden');
  const currentWeek = weeksData[selectedWeekIndex];

  if (!currentWeek || currentWeek.slots.length === 0) {
    slotsGrid.classList.add('hidden');
    noSlotsMsg.classList.remove('hidden');
    return;
  }

  noSlotsMsg.classList.add('hidden');
  slotsGrid.classList.remove('hidden');

  slotsGrid.innerHTML = currentWeek.slots.map(slot => {
    return `
      <div class="slot-card ${slot.isBooked ? 'booked' : 'available'}" data-slot-id="${slot.slotId}">
        <h3 class="slot-day-name">${escapeHtml(slot.dayName)}</h3>
        <span class="slot-date-str">${escapeHtml(slot.dateStr)}</span>
        <div class="slot-time-badge">${escapeHtml(slot.timeStr)}</div>
        <span class="slot-duration">משך: 60 דקות (ללא עלות)</span>

        ${slot.isBooked 
          ? `<span class="booked-label">🔒 נתפס</span>`
          : `<button class="btn btn-primary btn-slot-select book-slot-action-btn" data-slot-id="${slot.slotId}">בחר מועד זה</button>`
        }
      </div>
    `;
  }).join('');

  attachSlotBookEvents();
}

function attachSlotBookEvents() {
  document.querySelectorAll('.book-slot-action-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const slotId = btn.getAttribute('data-slot-id');
      const currentWeek = weeksData[selectedWeekIndex];
      const slot = currentWeek.slots.find(s => s.slotId === slotId);
      if (!slot || slot.isBooked) return;

      btn.disabled = true;
      btn.textContent = 'משבץ ביומן...';

      await bookSlot(slot);
    });
  });
}

async function bookSlot(slot) {
  const clientName = currentLeadData?.fullName || 'לקוח/ה';
  const clientPhone = currentLeadData?.phone || '';
  const clientEmail = currentLeadData?.email || '';

  const slotData = {
    slotId: slot.slotId,
    dayName: slot.dayName,
    dateStr: slot.dateStr,
    timeStr: slot.timeStr,
    startIso: slot.startDateTime.toISOString(),
    endIso: slot.endDateTime.toISOString(),
    bookedAt: new Date().toISOString()
  };

  try {
    // 1. Lock slot in 'bookings' collection
    await setDoc(doc(db, "bookings", slot.slotId), {
      leadId: currentLeadId || 'direct',
      clientName,
      clientPhone,
      clientEmail,
      dayName: slot.dayName,
      dateStr: slot.dateStr,
      timeStr: slot.timeStr,
      startIso: slotData.startIso,
      endIso: slotData.endIso,
      createdAt: serverTimestamp()
    });

    // 2. Update Lead document
    if (currentLeadId) {
      await updateDoc(doc(db, "leads", currentLeadId), {
        meetingSlot: slotData,
        status: 'meeting_set'
      });
    }

    // 3. Trigger direct Google Calendar API Background Injection (Silent)
    try {
      const functionUrl = "https://us-central1-guyhadas-e38c4.cloudfunctions.net/createMeetingDirect";
      fetch(functionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotData, clientName, clientEmail, clientPhone })
      }).then(res => res.json()).then(data => {
        console.log("Direct Google Calendar Event created silently in background:", data);
      }).catch(e => console.warn("Background calendar API note:", e));
    } catch (e) {
      console.warn("Background calendar call error:", e);
    }

    // 4. Show Confirmed Screen
    showConfirmedScreen(slotData);

  } catch (err) {
    console.error("Error booking slot:", err);
    alert('חלה שגיאה בשיבוץ המועד. אנא נסה שוב.');
    renderSlotsForCurrentWeek();
  }
}

function showConfirmedScreen(slotData) {
  bookingCard.classList.add('hidden');
  introCard.classList.add('hidden');

  const clientName = currentLeadData?.fullName || 'לקוח/ה';
  const clientEmail = currentLeadData?.email || '';
  const clientPhone = currentLeadData?.phone || '';

  summaryDatetime.textContent = `${slotData.dayName}, ${slotData.dateStr} | בשעות ${slotData.timeStr}`;
  summaryAttendees.textContent = `${clientName} & גיא הדס (${GUY_CALENDAR_EMAIL})`;

  // Configure Google Calendar Link
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);
  const googleDates = `${toGoogleCalendarFormat(startDate)}/${toGoogleCalendarFormat(endDate)}`;
  
  const meetLink = "https://meet.google.com/guy-hadas-ops";
  const eventTitle = encodeURIComponent(`שיחה עם גיא הדס`);
  const eventDetails = encodeURIComponent(`שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\n\nמשתתפים:\n- ${clientName} (${clientPhone}, ${clientEmail})\n- גיא הדס (${GUY_CALENDAR_EMAIL})\n\nקישור לשיחת וידאו (Google Meet):\n${meetLink}\n\nשיחה אישית ודיסקרטית תחת NDA.`);
  const eventLocation = encodeURIComponent(`Google Meet: ${meetLink}`);

  // Direct Google Calendar Add Event URL
  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${googleDates}&details=${eventDetails}&location=${eventLocation}&add=${GUY_CALENDAR_EMAIL}${clientEmail ? ',' + clientEmail : ''}`;
  googleCalBtn.href = googleCalUrl;

  // Send automated luxury meeting confirmation email
  sendBookingConfirmationEmail(slotData, clientName, clientEmail, clientPhone, meetLink, googleCalUrl);

  // Configure .ics download
  downloadIcsBtn.onclick = () => downloadIcsFile(slotData, clientName, meetLink);

  bookingConfirmedCard.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Automated Meeting Confirmation Email with Luxury Hebrew HTML Template
async function sendBookingConfirmationEmail(slotData, clientName, clientEmail, clientPhone, meetLink, googleCalUrl) {
  if (!clientEmail) return;

  const subject = `גיא הדס | אישור פגישה ל-${slotData.dayName}, ${slotData.dateStr} בשעה ${slotData.timeStr}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
<meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 20px 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Heebo', Arial, sans-serif; direction: rtl; text-align: right;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">
    
    <!-- Header -->
    <div style="background: #0B132B; padding: 32px 28px; text-align: center; border-bottom: 3px solid #10B981;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">גיא הדס</h1>
      <p style="color: #94A3B8; margin: 6px 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Executive Operations &amp; Execution</p>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px 32px; color: #1E293B; line-height: 1.8; font-size: 16px;">
      
      <!-- Success Badge -->
      <div style="display: inline-block; background: #ECFDF5; color: #047857; font-weight: 700; font-size: 14px; padding: 6px 16px; border-radius: 20px; border: 1px solid #A7F3D0; margin-bottom: 20px;">
        ✓ הפגישה נקבעה ונרשמה ביומן
      </div>

      <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 16px;">היי ${clientName},</h2>
      
      <p style="margin: 0 0 20px; color: #334155;">
        הפגישה האישית בינינו נקבעה בהצלחה. להלן פרטי השיחה המלאים:
      </p>

      <!-- Meeting Details Card -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 22px; margin: 24px 0;">
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>📅 מועד:</strong> ${slotData.dayName}, ${slotData.dateStr}
        </div>
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>⏰ שעה:</strong> ${slotData.timeStr} (60 דקות)
        </div>
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>👤 משתתפים:</strong> ${clientName} &amp; גיא הדס
        </div>
        <div style="font-size: 16px; color: #0F172A;">
          <strong>📍 פלטפורמה:</strong> שיחת וידאו ב-Google Meet
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${meetLink}" target="_blank" style="display: block; background: #0F172A; color: #ffffff; font-size: 15px; font-weight: 700; text-decoration: none; padding: 14px 24px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 4px 14px rgba(15,23,42,0.2);">
          📹 כניסה ל-Google Meet (${meetLink})
        </a>
        <a href="${googleCalUrl}" target="_blank" style="display: block; background: #FFFFFF; color: #0F172A; font-size: 15px; font-weight: 700; text-decoration: none; padding: 13px 24px; border-radius: 8px; border: 1px solid #CBD5E1;">
          📅 הוסף ישירות ל-Google Calendar שלך
        </a>
      </div>

      <p style="margin: 24px 0 0; color: #64748B; font-size: 14px;">
        במידה ותרצה לעדכן או לשנות מועד, תוכל להשיב ישירות למייל זה או בוואטסאפ ל-<strong>052-594-9682</strong>.
      </p>

      <p style="margin: 24px 0 0; color: #1E293B; font-weight: 600;">
        בברכה אישית,<br>
        <span style="font-size: 18px; color: #0F172A; font-weight: 800;">גיא הדס</span><br>
        <span style="font-size: 13px; color: #64748B;">Executive Operations &amp; Execution</span><br>
        <span style="font-size: 13px; color: #64748B;">052-594-9682 | mr.hadas@gmail.com</span>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #F1F5F9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0;">
      🔒 שיחה אישית ודיסקרטית תחת הסכם סודיות מלא (NDA).
    </div>

  </div>
</body>
</html>
  `;

  // Generate standard iCalendar REQUEST invite string for automatic calendar insertion
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);

  const icsInviteString = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Guy Hadas//Executive Operations Booking//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsFormat(startDate)}`,
    `DTEND:${toIcsFormat(endDate)}`,
    `DTSTAMP:${toIcsFormat(new Date())}`,
    `UID:${slotData.slotId}@guyhadas.xyz`,
    `SEQUENCE:0`,
    `SUMMARY:שיחה עם גיא הדס`,
    `DESCRIPTION:שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\\nלינק ישיר ל-Google Meet: ${meetLink}`,
    `LOCATION:${meetLink}`,
    `ORGANIZER;CN=Guy Hadas:mailto:${GUY_CALENDAR_EMAIL}`,
    `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Guy Hadas:mailto:${GUY_CALENDAR_EMAIL}`,
    clientEmail ? `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${clientName}:mailto:${clientEmail}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean).join('\r\n');

  try {
    await fetch("https://us-central1-guyhadas-e38c4.cloudfunctions.net/sendEmailDirect", {
      method: "POST",
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: clientEmail,
        cc: GUY_CALENDAR_EMAIL,
        subject: subject,
        html: htmlBody,
        text: `היי ${clientName},\n\nהפגישה בינינו נקבעה בהצלחה ביומן:\nמועד: ${slotData.dayName}, ${slotData.dateStr} בשעה ${slotData.timeStr}\nקישור Google Meet: ${meetLink}\n\nבברכה,\nגיא הדס\n052-594-9682`,
        icsContent: icsInviteString
      })
    });
    console.log("Direct white-label meeting confirmation email with calendar invite sent to:", clientEmail);
  } catch (err) {
    console.warn("Could not send direct meeting email:", err);
  }
}

// Generate .ics calendar file
function downloadIcsFile(slotData, clientName, meetLink) {
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Guy Hadas//Executive Advisory Booking//HE',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsFormat(startDate)}`,
    `DTEND:${toIcsFormat(endDate)}`,
    `DTSTAMP:${toIcsFormat(new Date())}`,
    `UID:${slotData.slotId}@guyhadas.xyz`,
    `SUMMARY:שיחה עם גיא הדס`,
    `DESCRIPTION:שיחה אישית בת שעה עם גיא הדס (Executive Operations & Execution).\\nלינק ל-Google Meet: ${meetLink}`,
    `LOCATION:${meetLink}`,
    `ORGANIZER;CN=Guy Hadas:MAILTO:${GUY_CALENDAR_EMAIL}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `meeting_${slotData.slotId}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// Helpers
function formatDateShort(d) {
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateKey(d) {
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateHebrew(d) {
  const day = d.getDate();
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return `${day} ב${months[d.getMonth()]} ${d.getFullYear()}`;
}

function toGoogleCalendarFormat(d) {
  return d.toISOString().replace(/-|:|\.\d+/g, '');
}

function toIcsFormat(d) {
  return d.toISOString().replace(/-|:|\.\d+/g, '');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
