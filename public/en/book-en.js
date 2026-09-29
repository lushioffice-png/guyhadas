/**
 * Strategic Operations & Growth Advisory - Meeting Booking Logic (English funnel)
 * Integrated with Cloud Firestore (guyhadas-e38c4) & Google Calendar (mr.hadas@gmail.com)
 *
 * This is the English counterpart of /public/book.js. It shares the same
 * Firestore "bookings"/"leads" collections and the same backend Cloud
 * Functions (getAvailableSlots / createMeetingDirect / sendEmailDirect) as
 * the Hebrew flow - Guy has one calendar, not two. The backend
 * getAvailableSlots function returns its day names / week labels / date
 * strings in Hebrew (shared code, not worth forking just for display
 * strings), so after syncing real availability from it we DISCARD those
 * Hebrew text fields and recompute the display strings client-side in
 * English from the raw startIso/endIso timestamps it returns. That keeps
 * the live Google Calendar accuracy without touching the backend or
 * leaking Hebrew text into this page.
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

// Candidate 1-hour slots pool across Israeli working days (Sunday to Thursday, 10:00 - 18:00)
// Ordered by executive preference. Must stay in sync with public/book.js -
// dayOffset/time values are the shared source of truth for slot generation.
const CANDIDATE_SLOTS_POOL = [
  // Primary core preferred slots
  { dayOffset: 1, dayName: 'Monday', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 2, dayName: 'Tuesday', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 4, dayName: 'Thursday', timeStr: '10:00 - 11:00', startHour: 10, startMin: 0, endHour: 11, endMin: 0 },

  // Secondary candidate slots across all working days
  { dayOffset: 0, dayName: 'Sunday', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 3, dayName: 'Wednesday', timeStr: '14:00 - 15:00', startHour: 14, startMin: 0, endHour: 15, endMin: 0 },
  { dayOffset: 1, dayName: 'Monday', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 4, dayName: 'Thursday', timeStr: '14:00 - 15:00', startHour: 14, startMin: 0, endHour: 15, endMin: 0 },
  { dayOffset: 0, dayName: 'Sunday', timeStr: '15:00 - 16:00', startHour: 15, startMin: 0, endHour: 16, endMin: 0 },
  { dayOffset: 2, dayName: 'Tuesday', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 3, dayName: 'Wednesday', timeStr: '11:00 - 12:00', startHour: 11, startMin: 0, endHour: 12, endMin: 0 },
  { dayOffset: 4, dayName: 'Thursday', timeStr: '11:30 - 12:30', startHour: 11, startMin: 30, endHour: 12, endMin: 30 },
  { dayOffset: 1, dayName: 'Monday', timeStr: '10:00 - 11:00', startHour: 10, startMin: 0, endHour: 11, endMin: 0 },
  { dayOffset: 3, dayName: 'Wednesday', timeStr: '16:00 - 17:00', startHour: 16, startMin: 0, endHour: 17, endMin: 0 },
  { dayOffset: 2, dayName: 'Tuesday', timeStr: '16:30 - 17:30', startHour: 16, startMin: 30, endHour: 17, endMin: 30 },
  { dayOffset: 0, dayName: 'Sunday', timeStr: '16:30 - 17:30', startHour: 16, startMin: 30, endHour: 17, endMin: 30 }
];

const ENGLISH_MONTHS_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const ENGLISH_MONTHS_SHORT_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const ENGLISH_WEEKDAY_NAMES = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
];

// Default, position-based week labels (see file header note on why this is
// simpler than the backend's Hebrew weekLabel logic).
const DEFAULT_WEEK_LABELS_EN = ["Next week", "In 2 weeks", "In 3 weeks"];

// --- JEWISH HOLIDAYS & EREV CHAG CALENDAR (2025 - 2028) ---
// Major holidays, Yom Tov, Erev Chag, and National Memorial/Independence days
// are blocked. Chol HaMoed and minor fast days ARE OPEN for booking.
// Labels are internal only (never rendered in this UI - only the dates are
// used, as a lookup key for filtering) and are kept in Hebrew, identical to
// public/book.js, so the two files' holiday calendars never drift apart.
const JEWISH_HOLIDAYS = {
  // 2025
  "2025-03-14": "פורים", "2025-03-15": "שושן פורים",
  "2025-04-12": "ערב פסח", "2025-04-13": "פסח א׳",
  "2025-04-19": "שביעי של פסח",
  "2025-04-30": "יום הזכרון", "2025-05-01": "יום העצמאות",
  "2025-06-01": "ערב שבועות", "2025-06-02": "חג שבועות",
  "2025-08-02": "ערב תשעה באב", "2025-08-03": "צום תשעה באב",
  "2025-09-22": "ערב ראש השנה", "2025-09-23": "ראש השנה א׳", "2025-09-24": "ראש השנה ב׳",
  "2025-10-01": "ערב יום כיפור", "2025-10-02": "יום כיפור",
  "2025-10-06": "ערב סוכות", "2025-10-07": "סוכות א׳",
  "2025-10-13": "ערב שמחת תורה (הושענא רבה)", "2025-10-14": "שמחת תורה",

  // 2026
  "2026-03-03": "פורים", "2026-03-04": "שושן פורים",
  "2026-04-01": "ערב פסח", "2026-04-02": "פסח א׳",
  "2026-04-08": "שביעי של פסח",
  "2026-04-21": "יום הזכרון", "2026-04-22": "יום העצמאות",
  "2026-05-21": "ערב שבועות", "2026-05-22": "חג שבועות",
  "2026-07-22": "ערב תשעה באב", "2026-07-23": "צום תשעה באב",
  "2026-09-11": "ערב ראש השנה", "2026-09-12": "ראש השנה א׳", "2026-09-13": "ראש השנה ב׳",
  "2026-09-20": "ערב יום כיפור", "2026-09-21": "יום כיפור",
  "2026-09-25": "ערב סוכות", "2026-09-26": "סוכות א׳",
  "2026-10-02": "ערב שמחת תורה (הושענא רבה)", "2026-10-03": "שמחת תורה",

  // 2027
  "2027-03-23": "פורים", "2027-03-24": "שושן פורים",
  "2027-04-21": "ערב פסח", "2027-04-22": "פסח א׳",
  "2027-04-28": "שביעי של פסח",
  "2027-05-11": "יום הזכרון", "2027-05-12": "יום העצמאות",
  "2027-06-10": "ערב שבועות", "2027-06-11": "חג שבועות",
  "2027-08-11": "ערב תשעה באב", "2027-08-12": "צום תשעה באב",
  "2027-10-01": "ערב ראש השנה", "2027-10-02": "ראש השנה א׳", "2027-10-03": "ראש השנה ב׳",
  "2027-10-10": "ערב יום כיפור", "2027-10-11": "יום כיפור",
  "2027-10-15": "ערב סוכות", "2027-10-16": "סוכות א׳",
  "2027-10-22": "ערב שמחת תורה (הושענא רבה)", "2027-10-23": "שמחת תורה",

  // 2028
  "2028-03-12": "פורים", "2028-03-13": "שושן פורים",
  "2028-04-11": "פסח א׳", "2028-04-17": "שביעי של פסח",
  "2028-05-01": "יום הזכרון", "2028-05-02": "יום העצמאות",
  "2028-05-30": "ערב שבועות", "2028-05-31": "חג שבועות",
  "2028-07-31": "ערב תשעה באב", "2028-08-01": "צום תשעה באב",
  "2028-09-20": "ערב ראש השנה", "2028-09-21": "ראש השנה א׳", "2028-09-22": "ראש השנה ב׳",
  "2028-09-29": "ערב יום כיפור", "2028-09-30": "יום כיפור",
  "2028-10-04": "ערב סוכות", "2028-10-05": "סוכות א׳",
  "2028-10-11": "ערב שמחת תורה (הושענא רבה)", "2028-10-12": "שמחת תורה"
};

function getISODateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getJewishHolidayName(d) {
  return JEWISH_HOLIDAYS[getISODateKey(d)] || null;
}

let bookedIntervals = [];

async function init() {
  // 1. Get Lead ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  currentLeadId = urlParams.get('id') || urlParams.get('leadId');

  if (currentLeadId) {
    try {
      const leadSnap = await getDoc(doc(db, "leads", currentLeadId));
      if (leadSnap.exists()) {
        currentLeadData = leadSnap.data();
        if (currentLeadData.fullName) {
          bookingGreeting.textContent = `Hi ${currentLeadData.fullName}, let's pick a time for our call`;
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

  // 3. Immediately generate 3 upcoming available weeks (guaranteed 3 available slots each, holidays excluded)
  generateUpcomingWeeks();

  // 4. Render initial interface
  renderWeekTabs();
  renderSlotsForCurrentWeek();

  // 5. Connect and sync live availability with Google Calendar (mr.hadas@gmail.com) in background
  syncGoogleCalendarAvailableSlots();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Fetch already taken slots
async function fetchBookedSlots() {
  try {
    const querySnapshot = await getDocs(collection(db, "bookings"));
    bookedSlots.clear();
    bookedIntervals = [];
    querySnapshot.forEach(docSnap => {
      bookedSlots.add(docSnap.id);
      const data = docSnap.data();
      if (data.startIso && data.endIso) {
        bookedIntervals.push({
          start: new Date(data.startIso).getTime(),
          end: new Date(data.endIso).getTime(),
          slotId: docSnap.id
        });
      }
    });
  } catch (err) {
    console.warn("Error fetching bookings:", err);
  }
}

// Generate upcoming weeks strictly excluding Jewish holidays
// Guarantees 3 active working weeks with 3 available slots each!
function generateUpcomingWeeks() {
  weeksData = [];
  const now = new Date();

  // Calculate Next Sunday (Start of next week)
  const currentDay = now.getDay(); // 0 = Sun, 1 = Mon...
  const daysUntilNextSunday = (7 - currentDay) % 7 || 7;

  const nextSunday = new Date(now);
  nextSunday.setDate(now.getDate() + daysUntilNextSunday);
  nextSunday.setHours(0, 0, 0, 0);

  let weekOffset = 0;

  // Find 3 weeks with available non-holiday slots (lookahead up to 8 weeks)
  while (weeksData.length < 3 && weekOffset < 8) {
    const weekStart = new Date(nextSunday);
    weekStart.setDate(nextSunday.getDate() + (weekOffset * 7));

    const weekEndThursday = new Date(weekStart);
    weekEndThursday.setDate(weekStart.getDate() + 4);

    const startDayNum = weekStart.getDate();
    const endDayNum = weekEndThursday.getDate();
    const monthIndex = weekEndThursday.getMonth();
    const dateRangeLabel = `${startDayNum} - ${endDayNum} ${ENGLISH_MONTHS_NAMES[monthIndex]}`;
    const dateRangeShort = `${startDayNum}-${endDayNum} ${ENGLISH_MONTHS_SHORT_NAMES[monthIndex]}`;

    let weekLabel = DEFAULT_WEEK_LABELS_EN[weeksData.length] || dateRangeShort;
    if (weekOffset > weeksData.length) {
      // We skipped a holiday week, so show a clear date label instead
      weekLabel = dateRangeShort;
    }

    const slots = [];
    const usedDays = new Set();

    // Pass 1: Try distinct non-holiday days
    for (const cand of CANDIDATE_SLOTS_POOL) {
      if (slots.length >= 3) break;
      if (usedDays.has(cand.dayOffset)) continue;

      const slotDate = new Date(weekStart);
      slotDate.setDate(weekStart.getDate() + cand.dayOffset);

      // Skip Jewish holiday / Erev Chag
      if (getJewishHolidayName(slotDate)) continue;

      const startDateTime = new Date(slotDate);
      startDateTime.setHours(cand.startHour, cand.startMin, 0, 0);

      const endDateTime = new Date(slotDate);
      endDateTime.setHours(cand.endHour, cand.endMin, 0, 0);

      const startMs = startDateTime.getTime();
      const endMs = endDateTime.getTime();

      const dateKey = formatDateKey(slotDate);
      const slotId = `slot_${dateKey}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;
      const slotIdAlt = `slot_${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;

      const isBooked = bookedSlots.has(slotId) || bookedSlots.has(slotIdAlt) || bookedIntervals.some(b => startMs < b.end && endMs > b.start);

      if (!isBooked) {
        slots.push({
          slotId,
          dayName: cand.dayName,
          dayOffset: cand.dayOffset,
          dateKey,
          dateStr: formatDateEnglish(slotDate),
          timeStr: cand.timeStr,
          startDateTime,
          endDateTime,
          startIso: startDateTime.toISOString(),
          endIso: endDateTime.toISOString(),
          isBooked: false
        });
        usedDays.add(cand.dayOffset);
      }
    }

    // Pass 2: If we still need slots to reach 3, allow second slot on open non-holiday days
    if (slots.length < 3) {
      for (const cand of CANDIDATE_SLOTS_POOL) {
        if (slots.length >= 3) break;

        const slotDate = new Date(weekStart);
        slotDate.setDate(weekStart.getDate() + cand.dayOffset);

        if (getJewishHolidayName(slotDate)) continue;

        const startDateTime = new Date(slotDate);
        startDateTime.setHours(cand.startHour, cand.startMin, 0, 0);

        const endDateTime = new Date(slotDate);
        endDateTime.setHours(cand.endHour, cand.endMin, 0, 0);

        const startMs = startDateTime.getTime();
        const endMs = endDateTime.getTime();

        const dateKey = formatDateKey(slotDate);
        const slotId = `slot_${dateKey}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;
        const slotIdAlt = `slot_${slotDate.getFullYear()}-${String(slotDate.getMonth() + 1).padStart(2, '0')}-${String(slotDate.getDate()).padStart(2, '0')}_${String(cand.startHour).padStart(2, '0')}${String(cand.startMin).padStart(2, '0')}`;

        const isBooked = bookedSlots.has(slotId) || bookedSlots.has(slotIdAlt) || bookedIntervals.some(b => startMs < b.end && endMs > b.start);
        const alreadyAdded = slots.some(s => s.startDateTime.getTime() === startMs);

        if (!isBooked && !alreadyAdded) {
          slots.push({
            slotId,
            dayName: cand.dayName,
            dayOffset: cand.dayOffset,
            dateKey,
            dateStr: formatDateEnglish(slotDate),
            timeStr: cand.timeStr,
            startDateTime,
            endDateTime,
            startIso: startDateTime.toISOString(),
            endIso: endDateTime.toISOString(),
            isBooked: false
          });
        }
      }
    }

    // If the week has at least 1 slot, add to active weeks
    if (slots.length > 0) {
      slots.sort((a, b) => a.startDateTime - b.startDateTime);
      weeksData.push({
        weekIndex: weeksData.length,
        weekLabel,
        dateRangeLabel,
        dateRangeShort,
        slots
      });
    }

    weekOffset++;
  }
}

// Sync live availability from the shared Google Calendar API Cloud Function.
// The function's response text fields (dayName, dateStr, weekLabel, ...) are
// Hebrew - we keep only the ISO timestamps and recompute English display
// strings from them (see file header note).
async function syncGoogleCalendarAvailableSlots() {
  try {
    const apiUrl = "https://us-central1-guyhadas-e38c4.cloudfunctions.net/getAvailableSlots";
    const res = await fetch(apiUrl, { method: "GET" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();

    if (data.success && Array.isArray(data.weeks) && data.weeks.length > 0) {
      weeksData = data.weeks.map((w, weekIndex) => {
        const slots = w.slots.map(s => {
          const startDateTime = new Date(s.startIso);
          const endDateTime = new Date(s.endIso);
          return {
            ...s,
            dayName: ENGLISH_WEEKDAY_NAMES[startDateTime.getDay()],
            dateStr: formatDateEnglish(startDateTime),
            startDateTime,
            endDateTime,
            isBooked: false
          };
        });

        const { weekLabel, dateRangeLabel, dateRangeShort } = computeWeekDisplayEnglish(weekIndex, slots);

        return {
          weekIndex,
          weekLabel,
          dateRangeLabel,
          dateRangeShort,
          slots
        };
      });

      // Re-render tabs and current week slots with verified Google Calendar availability
      renderWeekTabs();
      renderSlotsForCurrentWeek();
      console.log("Verified slots synced directly with Google Calendar (mr.hadas@gmail.com)");
    }
  } catch (err) {
    console.warn("Using offline/Firestore slot availability fallback:", err.message);
  }
}

// Recompute an English week label / date range purely from that week's own
// slot dates, ignoring the backend's Hebrew text fields entirely.
function computeWeekDisplayEnglish(weekIndex, slots) {
  if (!slots || slots.length === 0) {
    return { weekLabel: DEFAULT_WEEK_LABELS_EN[weekIndex] || '', dateRangeLabel: '', dateRangeShort: '' };
  }
  const times = slots.map(s => s.startDateTime.getTime());
  const minD = new Date(Math.min(...times));
  const maxD = new Date(Math.max(...times));
  const dateRangeLabel = `${minD.getDate()} - ${maxD.getDate()} ${ENGLISH_MONTHS_NAMES[maxD.getMonth()]}`;
  const dateRangeShort = `${minD.getDate()}-${maxD.getDate()} ${ENGLISH_MONTHS_SHORT_NAMES[maxD.getMonth()]}`;
  const weekLabel = DEFAULT_WEEK_LABELS_EN[weekIndex] || dateRangeShort;
  return { weekLabel, dateRangeLabel, dateRangeShort };
}

function renderWeekTabs() {
  weekTabsContainer.innerHTML = weeksData.map((week, idx) => {
    return `
      <button class="week-tab-btn ${idx === selectedWeekIndex ? 'active' : ''}" data-idx="${idx}" type="button">
        <span class="tab-title">${escapeHtml(week.weekLabel)}</span>
        <span class="tab-dates">${escapeHtml(week.dateRangeShort || '')}</span>
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
      <div class="slot-card available" data-slot-id="${slot.slotId}">
        <div class="slot-card-header">
          <div class="slot-day-meta">
            <h3 class="slot-day-name">${escapeHtml(slot.dayName)}</h3>
            <span class="slot-date-str">${escapeHtml(slot.dateStr)}</span>
          </div>
          <span class="open-badge">Available</span>
        </div>

        <div class="slot-time-badge">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${escapeHtml(slot.timeStr)}</span>
        </div>

        <span class="slot-duration">Call duration: 60 minutes (free of charge)</span>

        <button class="btn btn-primary btn-slot-select book-slot-action-btn" data-slot-id="${slot.slotId}">
          <span>Select this time</span>
          <span style="font-size: 1.1em;">➡️</span>
        </button>
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
      btn.textContent = 'Scheduling...';

      await bookSlot(slot);
    });
  });
}

async function bookSlot(slot) {
  const clientName = currentLeadData?.fullName || 'the client';
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
    // 1. Lock slot in 'bookings' collection (shared with the Hebrew flow)
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
    alert('There was an error scheduling the meeting. Please try again.');
    renderSlotsForCurrentWeek();
  }
}

function showConfirmedScreen(slotData) {
  bookingCard.classList.add('hidden');
  introCard.classList.add('hidden');

  const clientName = currentLeadData?.fullName || 'the client';
  const clientEmail = currentLeadData?.email || '';
  const clientPhone = currentLeadData?.phone || '';

  summaryDatetime.textContent = `${slotData.dayName}, ${slotData.dateStr} | at ${slotData.timeStr}`;
  summaryAttendees.textContent = `${clientName} & Guy Hadas (${GUY_CALENDAR_EMAIL})`;

  // Configure Google Calendar Link
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);
  const googleDates = `${toGoogleCalendarFormat(startDate)}/${toGoogleCalendarFormat(endDate)}`;

  const eventTitle = encodeURIComponent(`Personal Call: ${clientName} & Guy Hadas`);
  const eventDetails = encodeURIComponent(`A personal one-hour call with Guy Hadas (Executive Operations & Execution).\n\nAttendees:\n- ${clientName} (phone: ${clientPhone}, email: ${clientEmail})\n- Guy Hadas (phone: +972 52-594-9682, email: ${GUY_CALENDAR_EMAIL})\n\nHow we'll connect:\nGuy will contact you directly at ${clientPhone || 'your phone number'} at the time of the call, or via a dedicated video link sent ahead of the meeting.\n\nA personal, discreet conversation under NDA.`);
  const eventLocation = encodeURIComponent(clientPhone ? `Personal call with Guy Hadas (${clientPhone})` : `Personal call with Guy Hadas`);

  // Direct Google Calendar Add Event URL
  const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${googleDates}&details=${eventDetails}&location=${eventLocation}&add=${GUY_CALENDAR_EMAIL}${clientEmail ? ',' + clientEmail : ''}`;
  googleCalBtn.href = googleCalUrl;

  // Send automated meeting confirmation email
  sendBookingConfirmationEmail(slotData, clientName, clientEmail, clientPhone, googleCalUrl);

  // Configure .ics download
  downloadIcsBtn.onclick = () => downloadIcsFile(slotData, clientName, clientPhone);

  bookingConfirmedCard.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Automated Meeting Confirmation Email with an English HTML Template
async function sendBookingConfirmationEmail(slotData, clientName, clientEmail, clientPhone, googleCalUrl) {
  if (!clientEmail) return;

  const subject = `Guy Hadas | Meeting confirmed for ${slotData.dayName}, ${slotData.dateStr} at ${slotData.timeStr}`;

  const htmlBody = `
<!DOCTYPE html>
<html lang="en" dir="ltr">
<head>
<meta charset="UTF-8">
</head>
<body style="margin: 0; padding: 20px 0; background-color: #0F172A; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Heebo', Arial, sans-serif; direction: ltr; text-align: left;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid #E2E8F0;">

    <!-- Header -->
    <div style="background: #0B132B; padding: 32px 28px; text-align: center; border-bottom: 3px solid #10B981;">
      <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: 800; letter-spacing: 0.5px;">Guy Hadas</h1>
      <p style="color: #94A3B8; margin: 6px 0 0; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px;">Executive Operations &amp; Execution</p>
    </div>

    <!-- Body Content -->
    <div style="padding: 36px 32px; color: #1E293B; line-height: 1.8; font-size: 16px;">

      <!-- Success Badge -->
      <div style="display: inline-block; background: #ECFDF5; color: #047857; font-weight: 700; font-size: 14px; padding: 6px 16px; border-radius: 20px; border: 1px solid #A7F3D0; margin-bottom: 20px;">
        ✓ Meeting confirmed and on the calendar
      </div>

      <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 16px;">Hi ${clientName},</h2>

      <p style="margin: 0 0 20px; color: #334155;">
        Our personal call is confirmed. Here are the full details:
      </p>

      <!-- Meeting Details Card -->
      <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 22px; margin: 24px 0;">
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>📅 Date:</strong> ${slotData.dayName}, ${slotData.dateStr}
        </div>
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>⏰ Time:</strong> ${slotData.timeStr} (60 minutes)
        </div>
        <div style="margin-bottom: 12px; font-size: 16px; color: #0F172A;">
          <strong>👤 Attendees:</strong> ${clientName} &amp; Guy Hadas
        </div>
        <div style="font-size: 16px; color: #0F172A;">
          <strong>📞 How we'll connect:</strong> a direct call with Guy Hadas${clientPhone ? ` (at: <strong>${clientPhone}</strong>)` : ''}, or via a dedicated link sent ahead of the meeting.
        </div>
      </div>

      <!-- Action Buttons -->
      <div style="text-align: center; margin: 28px 0 16px;">
        <a href="${googleCalUrl}" target="_blank" style="display: block; background: #059669; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 15px 24px; border-radius: 8px; box-shadow: 0 4px 14px rgba(5,150,105,0.25);">
          📅 Add to your Google Calendar
        </a>
      </div>

      <p style="margin: 24px 0 0; color: #64748B; font-size: 14px;">
        If you'd like to update or reschedule, just reply directly to this email or reach me on WhatsApp at <strong>+972 52-594-9682</strong>.
      </p>

      <p style="margin: 24px 0 0; color: #1E293B; font-weight: 600;">
        Best,<br>
        <span style="font-size: 18px; color: #0F172A; font-weight: 800;">Guy Hadas</span><br>
        <span style="font-size: 13px; color: #64748B;">Executive Operations &amp; Execution</span><br>
        <span style="font-size: 13px; color: #64748B;">+972 52-594-9682 | mr.hadas@gmail.com</span>
      </p>
    </div>

    <!-- Footer -->
    <div style="background: #F1F5F9; padding: 18px 24px; text-align: center; font-size: 12px; color: #64748B; border-top: 1px solid #E2E8F0;">
      🔒 A personal, discreet conversation under a full non-disclosure agreement (NDA).
    </div>

  </div>
</body>
</html>
  `;

  // Generate standard iCalendar REQUEST invite string for automatic calendar insertion
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);
  const locationText = clientPhone ? `Personal call with Guy Hadas (${clientPhone})` : `Personal call with Guy Hadas`;

  const icsInviteString = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Guy Hadas//Executive Operations Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsFormat(startDate)}`,
    `DTEND:${toIcsFormat(endDate)}`,
    `DTSTAMP:${toIcsFormat(new Date())}`,
    `UID:${slotData.slotId}@guyhadas.xyz`,
    `SEQUENCE:0`,
    `SUMMARY:Personal Call: ${clientName} & Guy Hadas`,
    `DESCRIPTION:A personal one-hour call with Guy Hadas (Executive Operations & Execution).\\nHow we'll connect: Guy will contact you directly at ${clientPhone || 'your phone number'}, or via a dedicated link sent ahead of the call.`,
    `LOCATION:${locationText}`,
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
        text: `Hi ${clientName},\n\nOur call is confirmed and on the calendar:\nDate: ${slotData.dayName}, ${slotData.dateStr} at ${slotData.timeStr}\nHow we'll connect: Guy Hadas will call you at the scheduled time${clientPhone ? ` at ${clientPhone}` : ''}, or via a dedicated link sent ahead of the meeting.\n\nBest,\nGuy Hadas\n+972 52-594-9682`,
        icsContent: icsInviteString
      })
    });
    console.log("Direct white-label meeting confirmation email with calendar invite sent to:", clientEmail);
  } catch (err) {
    console.warn("Could not send direct meeting email:", err);
  }
}

// Generate .ics calendar file
function downloadIcsFile(slotData, clientName, clientPhone) {
  const startDate = new Date(slotData.startIso);
  const endDate = new Date(slotData.endIso);
  const locationText = clientPhone ? `Personal call with Guy Hadas (${clientPhone})` : `Personal call with Guy Hadas`;

  const icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Guy Hadas//Executive Advisory Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `DTSTART:${toIcsFormat(startDate)}`,
    `DTEND:${toIcsFormat(endDate)}`,
    `DTSTAMP:${toIcsFormat(new Date())}`,
    `UID:${slotData.slotId}@guyhadas.xyz`,
    `SUMMARY:Personal Call: ${clientName} & Guy Hadas`,
    `DESCRIPTION:A personal one-hour call with Guy Hadas (Executive Operations & Execution).\\nHow we'll connect: a direct call with Guy Hadas (+972 52-594-9682).`,
    `LOCATION:${locationText}`,
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

function formatDateEnglish(d) {
  const day = d.getDate();
  return `${day} ${ENGLISH_MONTHS_NAMES[d.getMonth()]} ${d.getFullYear()}`;
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
