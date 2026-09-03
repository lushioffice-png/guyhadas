/**
 * Strategic Operations & Growth Advisory - Admin Management Script
 * Integrated with Cloud Firestore (guyhadas-e38c4)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  orderBy 
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

// Authentication Passcode (Initial default: guy2026)
const ADMIN_PASSCODE = "guy2026";
const AUTH_KEY = "guy_admin_authenticated";

// State
let allLeads = [];
let allQuestions = [];
let unsubscribeLeads = null;

// DOM Elements
const loginModal = document.getElementById('login-modal');
const loginForm = document.getElementById('login-form');
const adminPasswordInput = document.getElementById('admin-password');
const loginError = document.getElementById('login-error');
const adminApp = document.getElementById('admin-app');
const logoutBtn = document.getElementById('logout-btn');

const statTotal = document.getElementById('stat-total');
const statNew = document.getElementById('stat-new');
const statPrep = document.getElementById('stat-prep');
const leadsTabCount = document.getElementById('leads-tab-count');

const leadSearch = document.getElementById('lead-search');
const statusFilter = document.getElementById('status-filter');
const leadsList = document.getElementById('leads-list');
const leadsLoading = document.getElementById('leads-loading');
const leadsEmpty = document.getElementById('leads-empty');
const exportCsvBtn = document.getElementById('export-csv-btn');
const refreshLeadsBtn = document.getElementById('refresh-leads-btn');

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');

const questionsList = document.getElementById('questions-list');
const addQuestionBtn = document.getElementById('add-question-btn');
const questionModal = document.getElementById('question-modal');
const questionForm = document.getElementById('question-form');
const closeQuestionModalBtn = document.getElementById('close-question-modal-btn');
const cancelQuestionBtn = document.getElementById('cancel-question-btn');
const editQuestionId = document.getElementById('edit-question-id');
const questionText = document.getElementById('question-text');
const questionType = document.getElementById('question-type');
const questionPlaceholder = document.getElementById('question-placeholder');
const questionRequired = document.getElementById('question-required');
const questionModalTitle = document.getElementById('question-modal-title');

const answersModal = document.getElementById('answers-modal');
const modalLeadName = document.getElementById('modal-lead-name');
const answersModalContent = document.getElementById('answers-modal-content');
const closeAnswersModalBtn = document.getElementById('close-answers-modal-btn');
const confirmAnswersModalBtn = document.getElementById('confirm-answers-modal-btn');

const toast = document.getElementById('toast');

// --- 1. AUTHENTICATION LOGIC ---
function checkAuth() {
  const isAuth = sessionStorage.getItem(AUTH_KEY) === 'true';
  if (isAuth) {
    loginModal.classList.add('hidden');
    adminApp.classList.remove('hidden');
    initDashboard();
  } else {
    loginModal.classList.remove('hidden');
    adminApp.classList.add('hidden');
  }
}

if (loginForm) {
  loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const entered = adminPasswordInput.value.trim();
    if (entered === ADMIN_PASSCODE) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      loginError.classList.remove('visible');
      loginForm.reset();
      checkAuth();
      showToast('התחברת בהצלחה למערכת');
    } else {
      loginError.classList.add('visible');
      adminPasswordInput.focus();
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    if (unsubscribeLeads) unsubscribeLeads();
    checkAuth();
    showToast('התנתקת מהמערכת');
  });
}

// --- 2. TABS SWITCHING ---
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const targetTab = btn.getAttribute('data-tab');
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanes.forEach(p => p.classList.remove('active'));
    tabPanes.forEach(p => p.classList.add('hidden'));

    btn.classList.add('active');
    const pane = document.getElementById(targetTab);
    if (pane) {
      pane.classList.remove('hidden');
      pane.classList.add('active');
    }
  });
});

// --- 3. INIT DASHBOARD ---
function initDashboard() {
  listenToLeads();
  loadIntakeQuestions();
}

// --- 4. LEADS LISTENING & RENDERING ---
function listenToLeads() {
  leadsLoading.classList.remove('hidden');
  leadsEmpty.classList.add('hidden');

  try {
    const leadsQuery = query(collection(db, "leads"));
    if (unsubscribeLeads) unsubscribeLeads();

    unsubscribeLeads = onSnapshot(leadsQuery, (snapshot) => {
      leadsLoading.classList.add('hidden');
      allLeads = [];

      snapshot.forEach(docSnap => {
        allLeads.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });

      // Sort newest first
      allLeads.sort((a, b) => {
        const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.clientDate || a.timestamp || 0).getTime();
        const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.clientDate || b.timestamp || 0).getTime();
        return timeB - timeA;
      });

      updateStats();
      renderLeads();
    }, (err) => {
      console.error("Error listening to leads:", err);
      leadsLoading.classList.add('hidden');
      showToast('שגיאה בטעינת לידים');
    });
  } catch (err) {
    console.error("Firestore init error:", err);
  }
}

function updateStats() {
  const total = allLeads.length;
  const newCount = allLeads.filter(l => l.status === 'new' || !l.status).length;
  const prepCount = allLeads.filter(l => l.status === 'prep_done' || (l.intakeAnswers && Object.keys(l.intakeAnswers).length > 0)).length;
  const meetingsCount = allLeads.filter(l => l.status === 'meeting_set' || l.meetingSlot).length;

  statTotal.textContent = total;
  statNew.textContent = newCount;
  statPrep.textContent = prepCount;
  const statMeetingsEl = document.getElementById('stat-meetings');
  if (statMeetingsEl) statMeetingsEl.textContent = meetingsCount;
  leadsTabCount.textContent = total;
  const meetingsTabCount = document.getElementById('meetings-tab-count');
  if (meetingsTabCount) meetingsTabCount.textContent = meetingsCount;

  renderMeetings();
}

function renderMeetings() {
  const meetingsList = document.getElementById('meetings-list');
  if (!meetingsList) return;

  const meetingLeads = allLeads.filter(l => l.meetingSlot);

  if (meetingLeads.length === 0) {
    meetingsList.innerHTML = `
      <div class="empty-box">
        <div class="empty-icon">📅</div>
        <h3>אין שיחות מתואמות ביומן כרגע</h3>
        <p>ברגע שלקוח ימלא את שאלון ההכנה ויבחר מועד לשיחה, הפגישה תופיע כאן עם קישור ישיר ליומן.</p>
      </div>
    `;
    return;
  }

  meetingsList.innerHTML = meetingLeads.map(lead => {
    const slot = lead.meetingSlot;
    const cleanPhone = (lead.phone || '').replace(/[^\d+]/g, '');
    const clientEmail = lead.email || '';

    const startDate = new Date(slot.startIso);
    const endDate = new Date(slot.endIso);
    const googleDates = `${startDate.toISOString().replace(/-|:|\.\d+/g, '')}/${endDate.toISOString().replace(/-|:|\.\d+/g, '')}`;
    const eventTitle = encodeURIComponent(`שיחה עם גיא הדס: ${lead.fullName}`);
    const eventDetails = encodeURIComponent(`שיחה אישית עם גיא הדס.\nלקוח: ${lead.fullName} (${lead.phone}, ${lead.email})\nעסק: ${lead.business}`);
    const googleCalUrl = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${googleDates}&details=${eventDetails}&location=Google+Meet&add=mr.hadas@gmail.com${clientEmail ? ',' + clientEmail : ''}`;

    return `
      <div class="lead-card status-meeting_set" style="border-right: 4px solid #10B981;">
        <div class="lead-person">
          <strong class="lead-name">📅 ${escapeHtml(slot.dayName)}, ${escapeHtml(slot.dateStr)}</strong>
          <span style="font-size: 1.1rem; font-weight: 800; color: #047857; margin-top: 4px;">⏰ ${escapeHtml(slot.timeStr)}</span>
        </div>

        <div class="lead-contact">
          <strong class="lead-business">👤 ${escapeHtml(lead.fullName)} (${escapeHtml(lead.business || 'עסק')})</strong>
          <span class="lead-phone" dir="ltr">📞 ${escapeHtml(lead.phone)} ${lead.email ? '• ✉️ ' + escapeHtml(lead.email) : ''}</span>
        </div>

        <div class="lead-business-box">
          <span class="lead-challenge"><strong>אתגר:</strong> ${escapeHtml(lead.challenge || 'ללא פירוט')}</span>
        </div>

        <div class="lead-status-box">
          <a href="${googleCalUrl}" target="_blank" class="btn btn-primary btn-sm" style="background: #1A73E8;">
            📅 פתח ב-Google Calendar
          </a>
          ${lead.intakeAnswers ? `<button class="btn btn-outline btn-sm view-answers-btn" data-id="${lead.id}">📋 צפה בשאלון</button>` : ''}
        </div>

        <div class="lead-actions-cell">
          <a href="tel:${cleanPhone}" class="btn-icon" title="חיוג">📞</a>
          <a href="https://wa.me/${cleanPhone}" target="_blank" class="btn-icon" title="וואטסאפ">💬</a>
        </div>
      </div>
    `;
  }).join('');

  attachLeadEvents();
}

function renderLeads() {
  const searchTerm = (leadSearch.value || '').trim().toLowerCase();
  const filterVal = statusFilter.value;

  const filtered = allLeads.filter(lead => {
    // Status Filter
    if (filterVal !== 'all') {
      const currentStatus = lead.status || 'new';
      if (currentStatus !== filterVal) return false;
    }

    // Search term
    if (searchTerm) {
      const name = (lead.fullName || '').toLowerCase();
      const phone = (lead.phone || '').toLowerCase();
      const email = (lead.email || '').toLowerCase();
      const business = (lead.business || '').toLowerCase();
      const challenge = (lead.challenge || '').toLowerCase();
      return name.includes(searchTerm) || phone.includes(searchTerm) || email.includes(searchTerm) || business.includes(searchTerm) || challenge.includes(searchTerm);
    }

    return true;
  });

  if (filtered.length === 0) {
    leadsList.innerHTML = '';
    leadsEmpty.classList.remove('hidden');
    return;
  }

  leadsEmpty.classList.add('hidden');
  leadsList.innerHTML = filtered.map(lead => createLeadCardHtml(lead)).join('');

  // Attach event handlers
  attachLeadEvents();
}

function createLeadCardHtml(lead) {
  const status = lead.status || 'new';
  const hasPrepAnswers = lead.intakeAnswers && Object.keys(lead.intakeAnswers).length > 0;
  const hasMeeting = lead.meetingSlot;
  const cleanPhone = (lead.phone || '').replace(/[^\d+]/g, '');
  const dateFormatted = lead.clientDate || (lead.createdAt?.toDate ? lead.createdAt.toDate().toLocaleString('he-IL') : 'תאריך לא זמין');

  // Intake URL for this lead
  const prepUrl = `${window.location.origin}/prep.html?id=${lead.id}`;
  const whatsappMsg = encodeURIComponent(`היי ${lead.fullName}, שמחתי לקבל את פנייתך באתר. לקראת השיחה האישית בינינו, אשמח שתמלא שאלון הכנה קצר וממוקד (2 דקות): ${prepUrl}`);

  return `
    <div class="lead-card status-${status}" data-id="${lead.id}">
      
      <!-- 1. Person Details -->
      <div class="lead-person">
        <strong class="lead-name">${escapeHtml(lead.fullName || 'ללא שם')}</strong>
        <span class="lead-date">🕒 ${escapeHtml(dateFormatted)}</span>
        ${lead.email ? `<span style="font-size: 0.8rem; color: #475569;" dir="ltr">✉️ ${escapeHtml(lead.email)}</span>` : ''}
      </div>

      <!-- 2. Contact & Quick Actions -->
      <div class="lead-contact">
        <span class="lead-phone" dir="ltr">${escapeHtml(lead.phone || '')}</span>
        <div class="lead-contact-actions">
          <a href="tel:${cleanPhone}" class="btn btn-call-sm btn-sm" title="חיוג ישיר לטלפון">📞 התקשר</a>
          <a href="https://wa.me/${cleanPhone}?text=${whatsappMsg}" target="_blank" class="btn btn-whatsapp-sm btn-sm" title="שליחת וואטסאפ עם קישור לשאלון">💬 וואטסאפ</a>
          <button class="btn btn-outline btn-sm open-email-modal-btn" data-id="${lead.id}" title="העתק נוסח מייל לליד">✉️ מייל</button>
        </div>
      </div>

      <!-- 3. Business & Challenge -->
      <div class="lead-business-box">
        <strong class="lead-business">🏢 ${escapeHtml(lead.business || 'לא צוין')}</strong>
        <p class="lead-challenge" title="${escapeHtml(lead.challenge || '')}">${escapeHtml(lead.challenge || 'ללא פירוט אתגר')}</p>
        ${hasMeeting ? `<div style="font-size: 0.8rem; color: #047857; font-weight: 700; margin-top: 4px;">📅 פגישה: ${escapeHtml(lead.meetingSlot.dayName)}, ${escapeHtml(lead.meetingSlot.dateStr)} (${escapeHtml(lead.meetingSlot.timeStr)})</div>` : ''}
      </div>

      <!-- 4. Status & Intake Questionnaire Badge -->
      <div class="lead-status-box">
        <select class="status-dropdown" data-id="${lead.id}">
          <option value="new" ${status === 'new' ? 'selected' : ''}>🟢 חדש</option>
          <option value="contacted" ${status === 'contacted' ? 'selected' : ''}>💬 נוצר קשר</option>
          <option value="prep_done" ${status === 'prep_done' ? 'selected' : ''}>📝 שאלון מולא</option>
          <option value="meeting_set" ${status === 'meeting_set' ? 'selected' : ''}>📅 נקבעה שיחה</option>
          <option value="completed" ${status === 'completed' ? 'selected' : ''}>✓ הושלם</option>
        </select>

        ${hasPrepAnswers 
          ? `<span class="lead-prep-badge done view-answers-btn" data-id="${lead.id}">📋 שאלון מולא (הצג תשובות)</span>`
          : `<span class="lead-prep-badge pending copy-prep-btn" data-id="${lead.id}" title="לחץ להעתקת קישור השאלון">🔗 העתק קישור לשאלון</span>`
        }
      </div>

      <!-- 5. Actions -->
      <div class="lead-actions-cell">
        <button class="btn-icon delete delete-lead-btn" data-id="${lead.id}" title="מחיקת ליד">🗑️</button>
      </div>

    </div>
  `;
}

function attachLeadEvents() {
  // Status Dropdown Change
  document.querySelectorAll('.status-dropdown').forEach(select => {
    select.addEventListener('change', async (e) => {
      const leadId = e.target.getAttribute('data-id');
      const newStatus = e.target.value;
      try {
        await updateDoc(doc(db, "leads", leadId), { status: newStatus });
        showToast('סטטוס הליד עודכן');
      } catch (err) {
        console.error("Error updating status:", err);
        showToast('שגיאה בעדכון הסטטוס');
      }
    });
  });

  // View Answers Modal
  document.querySelectorAll('.view-answers-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const leadId = btn.getAttribute('data-id');
      const lead = allLeads.find(l => l.id === leadId);
      if (lead) openAnswersModal(lead);
    });
  });

  // Copy Prep Link
  document.querySelectorAll('.copy-prep-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const leadId = btn.getAttribute('data-id');
      const prepUrl = `${window.location.origin}/prep.html?id=${leadId}`;
      navigator.clipboard.writeText(prepUrl).then(() => {
        showToast('הקישור האישי לשאלון הועתק ללוח!');
      }).catch(() => {
        prompt('העתק את הקישור לשאלון:', prepUrl);
      });
    });
  });

  // Email Draft Modal
  document.querySelectorAll('.open-email-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const leadId = btn.getAttribute('data-id');
      const lead = allLeads.find(l => l.id === leadId);
      if (lead) openEmailModal(lead);
    });
  });

  // Delete Lead
  document.querySelectorAll('.delete-lead-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const leadId = btn.getAttribute('data-id');
      const lead = allLeads.find(l => l.id === leadId);
      if (confirm(`האם אתה בטוח שברצונך למחוק את הליד של ${lead?.fullName || ''}?`)) {
        try {
          await deleteDoc(doc(db, "leads", leadId));
          showToast('הליד נמחק בהצלחה');
        } catch (err) {
          console.error("Error deleting lead:", err);
          showToast('שגיאה במחיקת הליד');
        }
      }
    });
  });
}

function openEmailModal(lead) {
  const prepUrl = `${window.location.origin}/prep.html?id=${lead.id}`;
  const subject = `גיא הדס | לקראת השיחה האישית בינינו`;
  const body = `היי ${lead.fullName},

שמחתי לקבל את פנייתך באתר.

כדי שאוכל להפיק את המקסימום מהשיחה (שעה ללא עלות) ולהגיע איתך ישר לתכל'ס, הכנתי שאלון קצר וממוקד (2 דקות):
${prepUrl}

בסיום השאלון תוכל לבחור ישירות מועד שנוח לך לשיחה מתוך הסלוטים הפנויים ביומן שלי.

בברכה אישית,
גיא הדס
Executive Operations & Execution
052-594-9682 | mr.hadas@gmail.com`;

  const emailModal = document.getElementById('email-modal');
  const subjectBox = document.getElementById('email-subject-box');
  const bodyBox = document.getElementById('email-body-box');
  const copyBtn = document.getElementById('copy-email-btn');
  const closeBtn = document.getElementById('close-email-modal-btn');
  const closeFooterBtn = document.getElementById('close-email-btn');

  if (subjectBox) subjectBox.value = subject;
  if (bodyBox) bodyBox.value = body;
  if (emailModal) emailModal.classList.remove('hidden');

  if (copyBtn) {
    copyBtn.onclick = () => {
      const fullText = `נושא: ${subject}\n\n${body}`;
      navigator.clipboard.writeText(fullText).then(() => {
        showToast('נוסח המייל הועתק ללוח!');
      }).catch(() => {
        prompt('העתק את המייל:', fullText);
      });
    };
  }

  if (closeBtn) closeBtn.onclick = () => emailModal.classList.add('hidden');
  if (closeFooterBtn) closeFooterBtn.onclick = () => emailModal.classList.add('hidden');
}

// Search & Filter Events
if (leadSearch) leadSearch.addEventListener('input', renderLeads);
if (statusFilter) statusFilter.addEventListener('change', renderLeads);
if (refreshLeadsBtn) refreshLeadsBtn.addEventListener('click', () => {
  listenToLeads();
  showToast('הלידים רועננו');
});

// Export CSV
if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    if (allLeads.length === 0) {
      alert('אין לידים לייצוא.');
      return;
    }

    let csv = '\uFEFFשם מלא,טלפון,עסק,אתגר,סטטוס,תאריך פנייה,שאלון מולא\n';
    allLeads.forEach(l => {
      const hasPrep = l.intakeAnswers && Object.keys(l.intakeAnswers).length > 0 ? 'כן' : 'לא';
      const cleanChallenge = (l.challenge || '').replace(/"/g, '""');
      csv += `"${l.fullName || ''}","${l.phone || ''}","${l.business || ''}","${cleanChallenge}","${l.status || 'new'}","${l.clientDate || ''}","${hasPrep}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_export_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('קובץ CSV הורד בהצלחה');
  });
}

// --- 5. INTAKE ANSWERS MODAL ---
function openAnswersModal(lead) {
  modalLeadName.textContent = `תשובות שאלון הכנה - ${lead.fullName} (${lead.business || ''})`;
  const answers = lead.intakeAnswers || {};

  if (Object.keys(answers).length === 0) {
    answersModalContent.innerHTML = `<p class="empty-text">טרם נמסרו תשובות לשאלון ההכנה.</p>`;
  } else {
    answersModalContent.innerHTML = Object.entries(answers).map(([questionText, answerVal]) => {
      return `
        <div class="answer-card-item">
          <div class="answer-q">❓ ${escapeHtml(questionText)}</div>
          <div class="answer-a">${escapeHtml(answerVal || 'לא נענה')}</div>
        </div>
      `;
    }).join('');
  }

  answersModal.classList.remove('hidden');
}

if (closeAnswersModalBtn) closeAnswersModalBtn.addEventListener('click', () => answersModal.classList.add('hidden'));
if (confirmAnswersModalBtn) confirmAnswersModalBtn.addEventListener('click', () => answersModal.classList.add('hidden'));
if (answersModal) {
  answersModal.addEventListener('click', (e) => {
    if (e.target === answersModal) answersModal.classList.add('hidden');
  });
}

// --- 6. INTAKE QUESTIONS BUILDER LOGIC ---
const DEFAULT_QUESTIONS = [
  {
    id: "q1",
    text: "מה היעד העסקי / הפיננסי המרכזי שתרצה להשיג ב-3-6 החודשים הקרובים?",
    type: "textarea",
    placeholder: "למשל: הגדלת רווחיות ב-30%, כניסה לתחום חדש, שחרור זמן אישי...",
    required: false,
    active: true
  },
  {
    id: "q2",
    text: "מהו צוואר הבקבוק או האתגר המרכזי שעוצר אותך מלהגיע לשם כרגע?",
    type: "textarea",
    placeholder: "למשל: עומס תפעולי, תמחור לא מדויק, בעיות גבייה, תלות מוחלטת בך...",
    required: false,
    active: true
  },
  {
    id: "q3",
    text: "כמה עובדים / פרילנסרים פועלים כרגע בעסק?",
    type: "text",
    placeholder: "למשל: 3 עובדים קבועים ו-2 פרילנסרים",
    required: false,
    active: true
  },
  {
    id: "q4",
    text: "האם יש מערכות ניהול / אוטומציות שכבר עובדות אצלכם?",
    type: "text",
    placeholder: "למשל: CRM, מערכת הנהלת חשבונות, הכל ידני באקסל...",
    required: false,
    active: true
  },
  {
    id: "q5",
    text: "מה הציפייה המרכזית שלך מהשיחה איתי?",
    type: "textarea",
    placeholder: "תאר בקצרה...",
    required: false,
    active: true
  }
];

async function loadIntakeQuestions() {
  try {
    const docRef = doc(db, "settings", "intake_questions");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().questions) {
      allQuestions = docSnap.data().questions;
    } else {
      // Seed default questions
      allQuestions = DEFAULT_QUESTIONS;
      await setDoc(docRef, { questions: DEFAULT_QUESTIONS });
    }

    renderQuestions();
  } catch (err) {
    console.error("Error loading questions:", err);
    allQuestions = DEFAULT_QUESTIONS;
    renderQuestions();
  }
}

function renderQuestions() {
  if (!questionsList) return;

  if (allQuestions.length === 0) {
    questionsList.innerHTML = `<p class="empty-text">אין שאלות מוגדרות בשאלון. לחץ על 'הוספת שאלה' כדי להוסיף.</p>`;
    return;
  }

  questionsList.innerHTML = allQuestions.map((q, idx) => {
    return `
      <div class="question-item-card" data-id="${q.id}">
        <div class="question-left">
          <span class="question-num">${idx + 1}</span>
          <div class="question-text-box">
            <strong>${escapeHtml(q.text)}</strong>
            <span class="question-meta">${q.type === 'textarea' ? 'טקסט פתוח (ארוך)' : 'טקסט קצר'} • ${q.required ? 'שאלת חובה' : 'רשות'} • ${q.active ? '🟢 פעילה' : '⚪ כבויה'}</span>
          </div>
        </div>

        <div class="question-controls">
          <button class="btn btn-outline btn-sm toggle-q-btn" data-id="${q.id}">
            ${q.active ? 'השבת' : 'הפעל'}
          </button>
          <button class="btn btn-outline btn-sm edit-q-btn" data-id="${q.id}">✏️ ערוך</button>
          <button class="btn-icon delete delete-q-btn" data-id="${q.id}" title="מחיקת שאלה">🗑️</button>
        </div>
      </div>
    `;
  }).join('');

  attachQuestionEvents();
}

function attachQuestionEvents() {
  // Toggle Active
  document.querySelectorAll('.toggle-q-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const qId = btn.getAttribute('data-id');
      const question = allQuestions.find(q => q.id === qId);
      if (question) {
        question.active = !question.active;
        await saveQuestionsToFirestore();
        renderQuestions();
        showToast(question.active ? 'השאלה הופעלה' : 'השאלה הושבתה');
      }
    });
  });

  // Edit Question
  document.querySelectorAll('.edit-q-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.getAttribute('data-id');
      const question = allQuestions.find(q => q.id === qId);
      if (question) {
        editQuestionId.value = question.id;
        questionText.value = question.text;
        questionType.value = question.type;
        questionPlaceholder.value = question.placeholder || '';
        questionRequired.checked = question.required;
        questionModalTitle.textContent = 'עריכת שאלה לשאלון';
        questionModal.classList.remove('hidden');
      }
    });
  });

  // Delete Question
  document.querySelectorAll('.delete-q-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const qId = btn.getAttribute('data-id');
      if (confirm('האם אתה בטוח שברצונך למחוק שאלה זו מהשאלון?')) {
        allQuestions = allQuestions.filter(q => q.id !== qId);
        await saveQuestionsToFirestore();
        renderQuestions();
        showToast('השאלה נמחקה מהשאלון');
      }
    });
  });
}

async function saveQuestionsToFirestore() {
  try {
    const docRef = doc(db, "settings", "intake_questions");
    await setDoc(docRef, { questions: allQuestions, updatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Error saving questions:", err);
    showToast('שגיאה בשמירת השאלות');
  }
}

// Add Question Button
if (addQuestionBtn) {
  addQuestionBtn.addEventListener('click', () => {
    questionForm.reset();
    editQuestionId.value = '';
    questionModalTitle.textContent = 'הוספת שאלה חדשה לשאלון';
    questionModal.classList.remove('hidden');
  });
}

if (closeQuestionModalBtn) closeQuestionModalBtn.addEventListener('click', () => questionModal.classList.add('hidden'));
if (cancelQuestionBtn) cancelQuestionBtn.addEventListener('click', () => questionModal.classList.add('hidden'));

if (questionForm) {
  questionForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editQuestionId.value || `q_${Date.now()}`;
    const newQ = {
      id: id,
      text: questionText.value.trim(),
      type: questionType.value,
      placeholder: questionPlaceholder.value.trim(),
      required: questionRequired.checked,
      active: true
    };

    const existingIdx = allQuestions.findIndex(q => q.id === id);
    if (existingIdx >= 0) {
      allQuestions[existingIdx] = { ...allQuestions[existingIdx], ...newQ };
    } else {
      allQuestions.push(newQ);
    }

    await saveQuestionsToFirestore();
    questionModal.classList.add('hidden');
    renderQuestions();
    showToast('השאלה נשמרה בהצלחה');
  });
}

// Helper: Toast
function showToast(msg) {
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2800);
}

// Helper: Escape HTML
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Check initial authentication
document.addEventListener('DOMContentLoaded', checkAuth);
