# דף נחיתה יוקרתי וממיר - Strategic Operations & Growth Advisory

דף נחיתה אקזקוטיבי בעברית (RTL) המיועד למנכ"לים, יזמים ובעלי עסקים, בנוי בסטנדרט עיצוב מודרני (Glassmorphism, Dark Slate Navy, Emerald accents) ומוכן לפריסה ישירה ב-**Firebase Hosting**.

---

## מבנה הפרויקט

```
executive-advisory-landing/
├── public/
│   ├── index.html       # מבנה העמוד הסמנטי וכל 10 הסעיפים
│   ├── styles.css       # עיצוב מלא, טיפוגרפיה, אנימציות ורספונסיביות
│   ├── app.js           # ניווט, תפריט מובייל, ולידציה וטופס לידים
│   └── favicon.svg      # אייקון יוקרתי לעמוד
├── firebase.json        # הגדרות פריסה ל-Firebase Hosting
├── .firebaserc          # קובץ שיוך לפרויקט Firebase שלך
└── README.md            # הוראות הפעלה ופריסה
```

---

## הרצה מקומית לצפייה ובדיקה

ניתן להפעיל שרת מקומי פשוט מתוך התיקייה:

```bash
# הרצה עם Python
python3 -m http.server 3000 --directory public

# או עם npx serve
npx -y serve public
```

---

## פריסה (Deploy) ל-Firebase Hosting

1. התחבר לחשבון ה-Firebase שלך (אם טרם התחברת):
   ```bash
   npx firebase-tools login
   ```

2. הגדר את מזהה הפרויקט שפתחת ב-Firebase:
   בקובץ `.firebaserc`, החלף את `your-firebase-project-id` במזהה הפרויקט שלך (Project ID מתוך Firebase Console).  
   או הרץ:
   ```bash
   npx firebase-tools use <YOUR_PROJECT_ID>
   ```

3. בצע פריסה לענן:
   ```bash
   npx firebase-tools deploy --only hosting
   ```

תוך שניות ספורות האתר יהיה באוויר תחת כתובת ה-Firebase החינמית שלך (למשל `https://your-project-id.web.app`) וניתן לחבר אליו דומיין מותאם אישית בלחיצת כפתור בקונסול של Firebase.

---

## ניהול לידים

- כברירת מחדל, לידים הנשלחים דרך הטופס נשמרים ב-`localStorage` של הדפדפן ומציגים חלונית אישור מודרנית (Modal) למשתמש.
- לחיבור ישיר ל-**Firebase Firestore** או **Webhook** (כגון Make / Zapier / Google Sheets), ניתן להוסיף את קריאת ה-API בתוך הפונקציה ב-[app.js](file:///Users/guyhadas/.gemini/antigravity-ide/scratch/executive-advisory-landing/public/app.js).

---

## אבטחה — הגדרה חד־פעמית (חובה לפני הפריסה הבאה)

הפרויקט עבר תיקון אבטחה: `firestore.rules` כבר לא פתוח לכולם, ופורטל הניהול (`/admin`) כבר לא מוגן בסיסמה קבועה בקוד אלא ב-**Firebase Authentication** אמיתי. שני הדברים הבאים חייבים להתבצע פעם אחת, ידנית, לפני שהאתר המעודכן עולה לאוויר — אף כלי אוטומטי לא יכול לבצע אותם במקומך כי הם דורשים גישה לחשבון Google/Firebase שלך:

**1. סובב את סיסמת ה-App Password של Gmail.** הסיסמה הישנה הייתה שמורה בקוד המקור בקובץ `functions/index.js` בטקסט גלוי — יש להתייחס אליה כאל דלוקה. כנסו ל-[App Passwords בחשבון Google](https://myaccount.google.com/apppasswords), בטלו את הישנה וצרו חדשה. את הסיסמה החדשה **אל תכניסו לשום קובץ בפרויקט** — שמרו אותה רק ב-Secret Manager:
  ```bash
  firebase functions:secrets:set GMAIL_APP_PASSWORD
  ```
  (הפקודה תבקש להדביק את הסיסמה ישירות בטרמינל, ולא תשמור אותה בדיסק או ב-git). לבדיקה מקומית מול האמולטור בלבד, אפשר להעתיק את `functions/.env.example` ל-`functions/.env` (הקובץ הזה מוחרג מ-git) ולמלא שם את הערך לבדיקה זמנית.

**2. צרו משתמש מנהל אמיתי ב-Firebase Authentication.** בקונסולת Firebase של הפרויקט (guyhadas-e38c4): Authentication ← Sign-in method ← הפעילו את ספק ה-Email/Password. לאחר מכן Authentication ← Users ← Add user, עם הכתובת `mr.hadas@gmail.com` וסיסמה חדשה משלכם. זו הסיסמה שתשתמשו בה מעכשיו כדי להתחבר ל-`/admin` — הסיסמה הישנה (`guy2026`) שהייתה כתובה בקוד כבר לא רלוונטית ולא עושה דבר.

לאחר שני הצעדים האלה, בצעו פריסה מלאה (`firebase deploy`, לא רק `--only hosting`, כדי שגם ה-Cloud Function המעודכנת וה-rules החדשים יעלו):
```bash
npx firebase-tools deploy
```
