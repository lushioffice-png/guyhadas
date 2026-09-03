/**
 * Strategic Operations & Growth Advisory - Landing Page Interactive Script
 * Integrated with Cloud Firestore (guyhadas-e38c4)
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

  // 2. Sticky Header Scroll Effect
  const header = document.getElementById('site-header');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 40) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });

  // 3. Back to Top Button
  const backToTopBtn = document.getElementById('back-to-top-btn');
  if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    });
  }

  // 5. Smooth Scroll for Anchor Links (accounting for sticky header offset)
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

  // 6. Lead Form Validation & Submission Handling
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
        challenge: challengeInput.value.trim() || 'לא צוין',
        createdAt: serverTimestamp(),
        clientDate: new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' }),
        source: 'Executive Landing Page',
        status: 'new'
      };

      try {
        // 1. Write to Firestore 'leads' collection
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
          modalEmailNotice.textContent = `שלחתי אליך כעת אימייל (לכתובת ${leadData.email}) עם טופס קצר למענה וקביעת שיחה ביומן שלי.`;
        }

        // Trigger automated email dispatch
        sendLeadAutoEmail(leadData, docRef.id);

        // Configure modal CTA to proceed to questionnaire directly if clicked
        if (modalConfirmBtn) {
          modalConfirmBtn.onclick = () => {
            closeModal();
            window.location.href = `/prep.html?id=${docRef.id}`;
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

  // Automated Email Dispatch with Luxury Hebrew HTML Template
  async function sendLeadAutoEmail(lead, leadId) {
    if (!lead.email) return;

    const prepUrl = `${window.location.origin}/prep.html?id=${leadId}`;
    const subject = `גיא הדס | לקראת השיחה האישית בינינו`;

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
      <h2 style="font-size: 20px; font-weight: 800; color: #0F172A; margin: 0 0 16px;">היי ${lead.fullName},</h2>
      
      <p style="margin: 0 0 16px; color: #334155;">
        שמחתי לקבל את פנייתך באתר.
      </p>

      <p style="margin: 0 0 20px; color: #334155;">
        כדי שאוכל ללמוד מראש את האתגרים ולהפיק עבורך את המקסימום מהשיחה האישית בינינו (שעה ללא עלות), הכנתי טופס היכרות קצר וממוקד:
      </p>

      <!-- CTA Box -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="${prepUrl}" target="_blank" style="display: inline-block; background: #0F172A; color: #ffffff; font-size: 16px; font-weight: 700; text-decoration: none; padding: 15px 32px; border-radius: 8px; box-shadow: 0 4px 14px rgba(15,23,42,0.25);">
          למילוי הטופס ובחירת מועד לשיחה ביומן ⬅️
        </a>
      </div>

      <div style="background: #F8FAFC; border-right: 4px solid #10B981; border-radius: 6px; padding: 14px 18px; margin: 24px 0; font-size: 14px; color: #475569;">
        💡 <strong>שים לב:</strong> בסיום מילוי הטופס תוכל לבחור ישירות מועד שנוח לך מתוך 3 הסלוטים הפנויים ביומן שלי.
      </div>

      <p style="margin: 24px 0 0; color: #1E293B; font-weight: 600;">
        בברכה אישית,<br>
        <span style="font-size: 18px; color: #0F172A; font-weight: 800;">גיא הדס</span><br>
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
          text: `היי ${lead.fullName},\n\nשמחתי לקבל את פנייתך באתר.\n\nלמילוי טופס ההיכרות ובחירת מועד לשיחה ביומן:\n${prepUrl}\n\nבברכה,\nגיא הדס\n052-594-9682`
        })
      });
      console.log("Direct white-label lead email dispatched successfully to:", lead.email);
    } catch (err) {
      console.warn("Could not send direct email:", err);
    }
  }
});
