/* =========================================================
   EventSphere – Configuration
   Google Sign-In is the only login method.
   1. Create an OAuth 2.0 Client ID (type: Web application) at
      https://console.cloud.google.com/apis/credentials
   2. Under "Authorized JavaScript origins" add every URL the site runs on, e.g.
        http://localhost
        http://localhost:5173
        https://<username>.github.io
   3. Paste the Client ID below.
   ========================================================= */

window.ES_CONFIG = {
  GOOGLE_CLIENT_ID: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
};
