/**
 * Strategic Operations & Growth Advisory - Landing Page Interactive Script (English funnel)
 * Integrated with Cloud Firestore (guyhadas-e38c4)
 *
 * This is the English counterpart of /public/app.js. It writes to the same
 * "leads" collection as the Hebrew flow (Guy's admin dashboard is shared and
 * stays Hebrew-only), but with English validation/UI copy and an English
 * transactional email template. Keep the two files in sync for any logic
 * change (not just copy).
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// Firebase configuration for guyhadas-e38c4
const firebaseConfig = {
  apiKey: "AIzaSyAtlRFde2oI4KkiAwK8DIOT5Yyq68rqm1A",
  authDomain: "guyhadas-e38c4.firebaseapp.com",
  projectId: "guyhadas-e38c4",
  storageBucket: "guyhadas-e38c4.firebasestorage.app",
  messagingSenderId: "83424733373",
  appId: "1:83424733373:web:c7bdc188962b7df3edafd4",
  measurementId: "G-5WBBDT3CR2"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
  // 1. Current Year in Footer
  const yearElement = document.getElementById('current-year');
  if (yearElement) {
    yearElement.textContent = new Date().getFullYear();
  }

  // 2. Back to Top Button
  const backToTopBtn = document.getElementById('back-to-top-btn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // 3. Smooth Scroll for Anchor Links (accounting for sticky header offset)
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;
      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });

  // 4. Lead Form Validation & Submission Handling
  const form = document.getElementById('consultation-form');
  const submitBtn = document.getElementById('submit-form-btn');
  const successModal = document.getElementById('success-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const modalUserName = document.getElementById('modal-user-name');

  const nameInput = document.getElementById('full-name');
  const phoneInput = document.getElementById('phone-number');
  const emailInput = document.getElementById('email-address');
  const businessInput = document.getElementById('business-name');
  const challengeInput = document.getElementById('main-challenge');

  const nameError = document.getElementById('name-error');
  const phoneError = document.getElementById('phone-error');
  const emailError = document.getElementById('email-error');
  const businessError = document.getElementById('business-error');

  function validateInput(input, errorElement, validationFn) {
    if (!input || !errorElement) return true;
    const isValid = validationFn(input.value.trim());
    if (!isValid) {
      input.classList.add('is-invalid');
      errorElement.classList.add('visible');
      return false;
    } else {
      input.classList.remove('is-invalid');
      errorElement.classList.remove('visible');
      return true;
    }
  }

  // Live input cleanup on user typing
  [nameInput, phoneInput, emailInput, businessInput].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('input', () => {
      inp.classList.remove('is-invalid');
      const errId = inp.id.replace('full-name', 'name-error').replace('phone-number', 'phone-error').replace('email-address', 'email-error').replace('business-name', 'business-error');
      const err = document.getElementById(errId);
      if (err) err.classList.remove('visible');
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();

      const isNameValid = validateInput(nameInput, nameError, val => val.length >= 2);
      const isPhoneValid = validateInput(phoneInput, phoneError, val => {
        const clean = val.replace(/[\s\-\(\)\+]/g, '');
        return clean.length >= 8 && /^\d+$/.test(clean);
      });
      const isEmailValid = validateInput(emailInput, emailError, val => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
      });
      const isBusinessValid = validateInput(businessInput, businessError, val => val.length >= 2);

      if (!isNameValid || !isPhoneValid || !isEmailValid || !isBusinessValid) {
        return;
      }

      // Show button loading state
      submitBtn.classList.add('loading');
      submitBtn.disabled = true;

      const leadData = {
        fullName: nameInput.value.trim(),
        phone: phoneInput.value.trim(),
        email: emailInput.value.trim(),
        business: businessInput.value.trim(),
        challenge: challengeInput ? (challengeInput.value.trim() || 'Not specified') : 'Initial form (to be completed in the extended questionnaire)',
        createdAt: serverTimestamp(),
        // Kept in Asia/Jerusalem (the business's timezone) but formatted in
        // English, since Guy's admin dashboard reads this as a plain string.
        clientDate: new Date().toLocaleString('en-GB', { timeZone: 'Asia/Jerusalem' }),
        source: 'Executive Landing Page (EN)',
        status: 'new'
      };

      try {
        // 1. Write to Firestore 'leads' collection (shared with the Hebrew flow)
        const docRef = await addDoc(collection(db, "leads"), leadData);
        console.log("Lead successfully written to Firestore with ID: ", docRef.id);

        // 2. Store locally as offline backup
        const existingLeads = JSON.parse(localStorage.getItem('advisory_leads') || '[]');
        existingLeads.push({ ...leadData, id: docRef.id, createdAt: new Date().toISOString() });
        localStorage.setItem('advisory_leads', JSON.stringify(existingLeads));

        // 3. Display user name and email in modal
        if (modalUserName) {
          modalUserName.textContent = leadData.fullName;
        }

        const modalEmailNotice = document.getElementById('modal-email-notice');
        if (modalEmailNotice && leadData.email) {
          modalEmailNotice.textContent = `I've just sent you an email (to ${leadData.email}) with a short form to fill out and a link to schedule a call on my calendar.`;
        }

        // Trigger automated email dispatch
        sendLeadAutoEmail(leadData, docRef.id);

        // Configure modal CTA to proceed to questionnaire directly if clicked
        if (modalConfirmBtn) {
          modalConfirmBtn.onclick = () => {
            closeModal();
            window.location.href = `/en/prep.html?id=${docRef.id}`;
          };
        }

        // 4. Open Success Modal
        openModal();

        // 5. Reset form
        form.reset();

      } catch (err) {
        console.error('Error handling lead submission to Firestore:', err);

        // Fallback backup if Firestore fails (e.g. offline)
        const existingLeads = JSON.parse(localStorage.getItem('advisory_leads') || '[]');
        existingLeads.push({ ...leadData, createdAt: new Date().toISOString(), offlineFallback: true });
        localStorage.setItem('advisory_leads', JSON.stringify(existingLeads));

        // Still show success modal for seamless UX if data was saved locally
        if (modalUserName) {
          modalUserName.textContent = leadData.fullName;
        }
        openModal();
        form.reset();
      } finally {
        submitBtn.classList.remove('loading');
        submitBtn.disabled = false;
      }
    });
  }

  // Modal Handlers
  function openModal() {
    if (!successModal) return;
    successModal.classList.add('active');
    successModal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    if (!successModal) return;
    successModal.classList.remove('active');
    successModal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeModal);
  if (modalConfirmBtn) modalConfirmBtn.addEventListener('click', closeModal);

  if (successModal) {
    successModal.addEventListener('click', (e) => {
      if (e.target === successModal) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && successModal && successModal.classList.contains('active')) {
      closeModal();
    }
  });

  // Automated Email Dispatch with an English HTML template
  async function sendLeadAutoEmail(lead, leadId) {
    if (!lead.email) return;

    const prepUrl = `${window.location.origin}/en/prep.html?id=${leadId}`;
    const subject = `Guy Hadas | Ahead of our conversation`;

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
      <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 16px;">Hi ${lead.fullName},</h2>

      <p style="margin: 0 0 16px; color: #334155;">
        Thanks for reaching out through the website.
      </p>

      <p style="margin: 0 0 20px; color: #334155;">
        So I can get up to speed on your challenges beforehand and make the most of our personal call (one hour, free of charge), I've put together a short, focused intake form:
      </p>

      <!-- CTA Box -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="${prepUrl}" target="_blank" style="display: inline-block; background: #0F172A; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 15px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(15,23,42,0.25);">
          Fill out the form & pick a time on my calendar →
        </a>
      </div>

      <div style="background: #F8FAFC; border-left: 4px solid #10B981; border-radius: 6px; padding: 14px 18px; margin: 24px 0; font-size: 14px; color: #475569;">
        💡 <strong>Note:</strong> once you've filled out the form, you'll be able to pick a time directly from 3 open slots on my calendar.
      </div>

      <p style="margin: 24px 0 0; color: #1E293B; font-weight: 600;">
        Best,<br>
        <span style="font-size: 18px; color: #0F172A; font-weight: 800;">Guy Hadas</span><br>
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

    try {
      await fetch("https://us-central1-guyhadas-e38c4.cloudfunctions.net/sendEmailDirect", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          to: lead.email,
          cc: "mr.hadas@gmail.com",
          subject: subject,
          html: htmlBody,
          text: `Hi ${lead.fullName},\n\nThanks for reaching out through the website.\n\nTo fill out the intake form and pick a time on my calendar:\n${prepUrl}\n\nBest,\nGuy Hadas\n+972 52-594-9682`
        })
      });
      console.log("Direct white-label lead email dispatched successfully to:", lead.email);
    } catch (err) {
      console.warn("Could not send direct email:", err);
    }
  }

  // Handle local dev fallback for /admin link
  const adminLink = document.getElementById('footer-admin-btn');
  if (adminLink && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    adminLink.href = '/admin.html';
  }
});
