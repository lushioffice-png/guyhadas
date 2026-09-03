/**
 * Strategic Operations & Growth Advisory - Client Pre-Call Questionnaire Script
 * Integrated with Cloud Firestore (guyhadas-e38c4)
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
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

// State
let currentLeadId = null;
let currentLeadData = null;
let activeQuestions = [];

// DOM Elements
const introGreeting = document.getElementById('intro-greeting');
const loadingQuestions = document.getElementById('loading-questions');
const intakeForm = document.getElementById('intake-form');
const contactFields = document.getElementById('contact-fields');
const clientNameInput = document.getElementById('client-name');
const clientPhoneInput = document.getElementById('client-phone');
const questionsContainer = document.getElementById('questions-container');
const submitPrepBtn = document.getElementById('submit-prep-btn');
const successScreen = document.getElementById('success-screen');
const successName = document.getElementById('success-name');
const formCard = document.getElementById('form-card');
const introCard = document.getElementById('intro-card');

// Default fallback questions if DB is empty
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

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Parse URL for Lead ID
  const urlParams = new URLSearchParams(window.location.search);
  currentLeadId = urlParams.get('id') || urlParams.get('leadId');

  // 2. Fetch Lead Data if ID exists
  if (currentLeadId) {
    try {
      const leadRef = doc(db, "leads", currentLeadId);
      const leadSnap = await getDoc(leadRef);
      if (leadSnap.exists()) {
        currentLeadData = leadSnap.data();
        if (currentLeadData.fullName) {
          introGreeting.textContent = `היי ${currentLeadData.fullName}, שאלון הכנה לשיחה`;
        }
      }
    } catch (err) {
      console.warn("Could not load lead info by ID:", err);
    }
  }

  // If no lead ID or no lead found, show name/phone fields
  if (!currentLeadId || !currentLeadData) {
    if (contactFields) contactFields.classList.remove('hidden');
    if (clientNameInput) clientNameInput.required = true;
    if (clientPhoneInput) clientPhoneInput.required = true;
  }

  // 3. Load Active Questions
  await loadQuestions();

  // 4. Handle Form Submit
  if (intakeForm) {
    intakeForm.addEventListener('submit', handleFormSubmit);
  }
});

async function loadQuestions() {
  try {
    const docRef = doc(db, "settings", "intake_questions");
    const docSnap = await getDoc(docRef);

    if (docSnap.exists() && docSnap.data().questions) {
      const allQ = docSnap.data().questions;
      activeQuestions = allQ.filter(q => q.active !== false);
    } else {
      activeQuestions = DEFAULT_QUESTIONS;
    }
  } catch (err) {
    console.warn("Using fallback default questions:", err);
    activeQuestions = DEFAULT_QUESTIONS;
  }

  renderQuestions();
}

function renderQuestions() {
  loadingQuestions.classList.add('hidden');
  intakeForm.classList.remove('hidden');

  if (activeQuestions.length === 0) {
    questionsContainer.innerHTML = `<p>אין שאלות פעילות כרגע.</p>`;
    return;
  }

  questionsContainer.innerHTML = activeQuestions.map((q, idx) => {
    const isTextarea = q.type === 'textarea';

    return `
      <div class="question-block" data-qid="${q.id}">
        <label class="question-label" for="input_${q.id}">
          <span class="q-badge-num">${idx + 1}</span>
          <span>${escapeHtml(q.text)}</span>
        </label>

        ${isTextarea 
          ? `<textarea id="input_${q.id}" name="${q.id}" rows="3" placeholder="${escapeHtml(q.placeholder || '')}"></textarea>`
          : `<input type="text" id="input_${q.id}" name="${q.id}" placeholder="${escapeHtml(q.placeholder || '')}">`
        }
      </div>
    `;
  }).join('');
}

async function handleFormSubmit(e) {
  e.preventDefault();

  // Collect answers (all optional)
  const answers = {};
  let isValid = true;

  activeQuestions.forEach(q => {
    const input = document.getElementById(`input_${q.id}`);
    if (input) {
      const val = input.value.trim();
      answers[q.text] = val || 'לא צוין';
    }
  });

  // If no leadId, validate name/phone
  let personName = currentLeadData?.fullName || '';
  let personPhone = currentLeadData?.phone || '';

  if (!currentLeadId || !currentLeadData) {
    if (clientNameInput && clientPhoneInput) {
      if (!clientNameInput.value.trim() || !clientPhoneInput.value.trim()) {
        if (!clientNameInput.value.trim()) clientNameInput.classList.add('is-invalid');
        if (!clientPhoneInput.value.trim()) clientPhoneInput.classList.add('is-invalid');
        isValid = false;
      } else {
        personName = clientNameInput.value.trim();
        personPhone = clientPhoneInput.value.trim();
      }
    }
  }

  if (!isValid) {
    return;
  }

  // Loading state
  submitPrepBtn.disabled = true;
  submitPrepBtn.innerHTML = `<span>שומר ומעביר ליומן...</span>`;

  try {
    let finalLeadId = currentLeadId;

    if (currentLeadId) {
      // Update existing lead
      const leadRef = doc(db, "leads", currentLeadId);
      await updateDoc(leadRef, {
        intakeAnswers: answers,
        intakeSubmittedAt: serverTimestamp(),
        intakeSubmittedDate: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        status: 'prep_done'
      });
    } else {
      // Create new lead document
      finalLeadId = `lead_${Date.now()}`;
      const leadRef = doc(db, "leads", finalLeadId);
      await setDoc(leadRef, {
        fullName: personName,
        phone: personPhone,
        business: 'דרך שאלון ישיר',
        challenge: 'הוזן בשאלון הכנה',
        createdAt: serverTimestamp(),
        clientDate: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        source: 'Pre-Call Questionnaire',
        status: 'prep_done',
        intakeAnswers: answers,
        intakeSubmittedAt: serverTimestamp()
      });
    }

    // Show Success Card with transition note
    formCard.classList.add('hidden');
    introCard.classList.add('hidden');
    successName.textContent = personName || 'חבר/ה יקר/ה';
    successScreen.classList.remove('hidden');

    // Smooth transition to booking step
    setTimeout(() => {
      window.location.href = `/book.html?id=${finalLeadId}`;
    }, 1600);

  } catch (err) {
    console.error("Error submitting intake answers:", err);
    alert('חלה שגיאה בשמירת התשובות. אנא נסה שנית.');
    submitPrepBtn.disabled = false;
    submitPrepBtn.innerHTML = `<span>שליחת השאלון לקראת השיחה</span>`;
  }
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
