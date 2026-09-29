/**
 * Strategic Operations & Growth Advisory - Client Pre-Call Questionnaire Script (English funnel)
 * Integrated with Cloud Firestore (guyhadas-e38c4)
 *
 * NOTE ON INTAKE QUESTIONS: the Hebrew flow (public/prep.js) loads its
 * question set from Firestore's settings/intake_questions doc, which Guy can
 * edit from the admin dashboard. There is no admin UI yet for a second
 * language, so this English page intentionally does NOT read that document
 * (it holds Hebrew text) and always uses the static ENGLISH_QUESTIONS below
 * instead. If Guy edits the Hebrew question set from admin, the English
 * version will not automatically follow - it's a translated snapshot, not a
 * live mirror. Update ENGLISH_QUESTIONS by hand if the questions change.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  doc,
  collection,
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

// English intake questions (see file header note - static, not admin-editable yet)
const ENGLISH_QUESTIONS = [
  {
    id: "q1",
    text: "What's the main business or financial goal you'd like to hit in the next 3-6 months?",
    type: "textarea",
    placeholder: "e.g., increase profitability by 30%, enter a new market, free up personal time...",
    required: false,
    active: true
  },
  {
    id: "q2",
    text: "What's the main bottleneck or challenge stopping you from getting there right now?",
    type: "textarea",
    placeholder: "e.g., operational overload, imprecise pricing, collection issues, everything depends on you...",
    required: false,
    active: true
  },
  {
    id: "q3",
    text: "How many employees / freelancers currently work in the business?",
    type: "text",
    placeholder: "e.g., 3 full-time employees and 2 freelancers",
    required: false,
    active: true
  },
  {
    id: "q4",
    text: "Do you already have any management systems or automations in place?",
    type: "text",
    placeholder: "e.g., CRM, accounting software, everything manual in Excel...",
    required: false,
    active: true
  },
  {
    id: "q5",
    text: "What's your main expectation from our call?",
    type: "textarea",
    placeholder: "Briefly describe...",
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
          introGreeting.textContent = `Hi ${currentLeadData.fullName}, pre-call questionnaire`;
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

  // 3. Load Questions (static English set - see file header note)
  loadQuestions();

  // 4. Handle Form Submit
  if (intakeForm) {
    intakeForm.addEventListener('submit', handleFormSubmit);
  }
});

function loadQuestions() {
  activeQuestions = ENGLISH_QUESTIONS.filter(q => q.active !== false);
  renderQuestions();
}

function renderQuestions() {
  loadingQuestions.classList.add('hidden');
  intakeForm.classList.remove('hidden');

  if (activeQuestions.length === 0) {
    questionsContainer.innerHTML = `<p>No active questions right now.</p>`;
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
      answers[q.text] = val || 'Not specified';
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
  submitPrepBtn.innerHTML = `<span>Saving & moving to the calendar...</span>`;

  try {
    let finalLeadId = currentLeadId;

    if (currentLeadId) {
      // Update existing lead
      const leadRef = doc(db, "leads", currentLeadId);
      await updateDoc(leadRef, {
        intakeAnswers: answers,
        intakeSubmittedAt: serverTimestamp(),
        intakeSubmittedDate: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' }),
        status: 'prep_done'
      });
    } else {
      // Create new lead document. Use Firestore's own random push-id rather
      // than a timestamp: this id doubles as the access token prep.html and
      // book.html use to read/update the lead with no login, so it needs to
      // be unguessable, not just unique. (Matches the Hebrew flow's fix.)
      const leadRef = doc(collection(db, "leads"));
      finalLeadId = leadRef.id;
      await setDoc(leadRef, {
        fullName: personName,
        phone: personPhone,
        business: 'Via direct questionnaire',
        challenge: 'Entered in the prep questionnaire',
        createdAt: serverTimestamp(),
        clientDate: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' }),
        source: 'Pre-Call Questionnaire (EN)',
        status: 'prep_done',
        intakeAnswers: answers,
        intakeSubmittedAt: serverTimestamp()
      });
    }

    // Show Success Card with transition note
    formCard.classList.add('hidden');
    introCard.classList.add('hidden');
    successName.textContent = personName || 'there';
    successScreen.classList.remove('hidden');

    // Smooth transition to booking step
    setTimeout(() => {
      window.location.href = `/en/book.html?id=${finalLeadId}`;
    }, 1600);

  } catch (err) {
    console.error("Error submitting intake answers:", err);
    alert('There was an error saving your answers. Please try again.');
    submitPrepBtn.disabled = false;
    submitPrepBtn.innerHTML = `<span>Submit & Continue to Scheduling</span>`;
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
