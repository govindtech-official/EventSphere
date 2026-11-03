/* =========================================================
   Eveora – Configuration
   - GOOGLE_CLIENT_ID: OAuth Web client (Google Cloud → Google Auth Platform → Clients).
     Its "Authorized JavaScript origins" must list every URL the site runs on.
   - FIREBASE: web app config (Firebase console → Project settings → Your apps).
   - SUPERADMIN_EMAIL: must match the email in firestore.rules.
   - PAYMENT.UPI_ID: where attendees pay. Leave empty for demo mode.
   All of these values are public by design.
   ========================================================= */

window.ES_CONFIG = {
  GOOGLE_CLIENT_ID: '227222416582-c77rhsqi0n9fc4sk79inffm13e8fcg4e.apps.googleusercontent.com',

  FIREBASE: {
    apiKey: 'AIzaSyDtdypbyBb29XB03KCTgSZebZeWeOxXqgA',
    authDomain: 'eventsphere-513605.firebaseapp.com',
    projectId: 'eventsphere-513605',
    storageBucket: 'eventsphere-513605.firebasestorage.app',
    messagingSenderId: '227222416582',
    appId: '1:227222416582:web:05e2d648e8399dd68f7bc7'
  },

  SUPERADMIN_EMAIL: 'contactgovindtech@gmail.com',

  PAYMENT: {
    UPI_ID: '',          // e.g. 'yourname@okhdfcbank'
    PAYEE_NAME: 'Eveora'
  }
};
