# Eveora — *Where moments come alive*

Eveora is a premium, fully responsive event reservation website. Guests can explore curated events, see every detail and reserve a place. Paid bookings go through **manual UPI payment verification**, and a ticket is issued only after an admin approves the payment.

It's built with **HTML5, CSS3 and vanilla JavaScript**, uses **Firebase** (Google sign-in + Cloud Firestore) as the backend, and has no build step.

> **K Explore – Web Designing Task:** Design and Develop a Responsive Event Management Website

🔗 **Live Demo:** https://eveora.vercel.app/
📂 **Repository:** https://github.com/govindtech-official/EventSphere

---

## ✨ Features

### Core requirements
| Feature | Description |
|---|---|
| **Hero section** | Full-bleed photo with a serif headline, a search bar, animated stats and a "Next on the calendar" card with a live countdown |
| **Featured events** | A horizontal slider (scroll-snap with arrow buttons) of hand-picked events |
| **Event cards** | Image, name, date, time, venue, description, price and seats available |
| **Search, filter, sort** | Live search, category chips, and sorting by date, price or name |
| **Event details** | A modal with full info, highlights, host, seats available, a countdown and a **Reserve now** button |
| **Reservation form** | Name, email, phone, event, tickets, terms and a live total, with JavaScript validation and inline errors |
| **Confirmation** | A confirmation modal with a booking summary after each submission |
| **Responsive design** | Mobile, tablet and desktop layouts, a hamburger menu and bottom-sheet modals on phones |

### 💳 Manual payment verification
1. The guest picks a paid event. The form shows the **amount due**, a **UPI QR code**, the UPI ID and an "Open UPI app" link.
2. After paying, the guest enters the **UTR / UPI reference number** and uploads a **payment screenshot**.
3. The booking is saved as **Under verification**. No ticket exists yet.
4. An admin compares the UTR and screenshot with the payment app, then **approves** or **rejects** it with a reason.
5. On approval the system issues a **ticket ID**. The guest can then open their **ticket** (with a QR code) from **My Bookings**. Status changes appear live.

Safeguards:
- Each UTR can back only one active booking, enforced in the database.
- The admin view flags amounts that don't match the event price and UTRs that were reused.
- Seat counts include only approved tickets.

> Until a real UPI ID is set in `js/config.js`, the payment step runs in **demo mode** and tells visitors not to send money.

### 👑 Roles
| Role | Can do |
|---|---|
| **Superadmin** (`contactgovindtech@gmail.com`) | Everything an admin can, plus **make other people admins** or remove them |
| **Admin** | View all bookings and payment screenshots, approve or reject payments, issue tickets |
| **Guest** | Reserve, see their own bookings and payment proof, cancel while pending, view tickets once approved |

These rules are enforced by [`firestore.rules`](firestore.rules) on the server, not just hidden in the UI.

### 🔑 Login with Google
Google Sign-In is the only login method (official button + One Tap), linked to Firebase Authentication. Your name and email are filled in from your Google account.

### 🏆 Bonus challenges
- 🌙 **Dark / light mode:** dark by default, remembered across visits, with no flash on load
- ⏳ **Countdown timers** in the hero card and every event modal
- 🎞️ **Animations:** scroll reveals, a slow hero zoom, card lifts, modal transitions and animated counters. Motion is turned off for users who prefer reduced motion
- 💾 **Local Storage** for the theme preference. Bookings are stored in Firestore so admins can verify them from any device

### Validation rules
| Field | Rule |
|---|---|
| Full name | Required, at least 3 letters (any language) |
| Email | From the Google account (read-only) |
| Phone | Valid 10-digit Indian mobile number starting with 6–9 |
| Event | Upcoming, not fully booked, and not already booked by you |
| Tickets | 1–5, and no more than the seats available |
| UTR | Paid events only: 12–22 letters or digits, and not already used |
| Screenshot | Paid events only: JPG, PNG or WebP up to 10 MB, compressed in the browser |
| Terms | Must be accepted |

---

## 🛠️ Tech Stack
- **HTML5**: semantic markup and an inline SVG icon set
- **CSS3**: design tokens for both themes, Grid, Flexbox, `clamp()`, scroll-snap, `backdrop-filter`, keyframe animations
- **JavaScript (ES6+)**: an IIFE, event delegation, `IntersectionObserver`, and Canvas image compression
- **Firebase**: Authentication (Google) and Cloud Firestore with security rules, all on the free Spark plan
- **Libraries**: [qrcodejs](https://github.com/davidshimjs/qrcodejs) for the UPI and ticket QR codes
- **Git & GitHub** for version control, **Vercel** for hosting (auto-deploys on every push)

## 📁 Project Structure
```
EventSphere/
├── index.html        # Navbar, hero, featured, events, reservation + payment, bookings, admin, modals
├── privacy.html      # Privacy policy
├── terms.html        # Terms of service
├── firestore.rules   # Database security rules (roles, payment checks, UTR uniqueness)
├── firebase.json     # Firebase CLI / emulator config
├── css/style.css     # Luxury theme: tokens, components, animations, breakpoints
├── js/
│   ├── config.js     # Google Client ID, Firebase config, superadmin email, UPI details
│   ├── data.js       # Event dataset (12 events)
│   └── app.js        # Rendering, auth, payment, validation, bookings, tickets, admin
└── README.md
```

## 🗄️ Data model (Cloud Firestore)
| Collection | Contents | Who can read |
|---|---|---|
| `registrations` | Guest, event, tickets, amount, UTR, status, ticket ID (after approval) | The guest who made it, and admins |
| `paymentProofs` | Compressed screenshot (one document per booking) | The guest who made it, and admins |
| `utrs` | One document per UTR, so a UTR can't be reused | Admins |
| `admins` | Emails the superadmin has made admins | Admins (and each person their own entry) |
| `eventStats` | Approved seats per event | Everyone |

Screenshots are stored in Firestore as compressed images (usually under 400 KB), so the project needs no paid Firebase Storage plan.

## ⚙️ Setup
1. **Google Sign-In:** create an OAuth **Web** client and add every site URL under *Authorized JavaScript origins*. Put the Client ID in `js/config.js`.
2. **Firebase:** add Firebase to the same Google Cloud project and register a Web app. Copy its config into `js/config.js` → `FIREBASE`.
3. **Authentication:** enable the **Google** provider, add the OAuth Client ID under *Safelist client IDs*, and add your site's domain under *Authorized domains*.
4. **Firestore:** create the database in production mode, then paste [`firestore.rules`](firestore.rules) into the **Rules** tab and click **Publish**.
5. **Payments:** set `PAYMENT.UPI_ID` in `js/config.js` to the UPI ID that should receive payments.
6. **Superadmin:** change the email in both `js/config.js` and `firestore.rules` if needed.

## 🧪 Run locally with the Firebase emulators
Use this to try every role without touching real data. It needs Node.js and Java 11 or newer.
```bash
npx firebase-tools emulators:start --project demo-eveora
```
```bash
npx http-server -p 5173 -c-1 .
```
Then open http://localhost:5173/?emulator and sign in with any test account from the emulator's sign-in popup.

## 📱 Responsive breakpoints
| Width | Layout |
|---|---|
| > 1024px | Three featured cards per view, two-column hero and reservation |
| 600–1024px | Two featured cards, hamburger menu below 960px, stacked layout |
| < 600px | Swipeable cards, single-column forms, bottom-sheet modals |

---
Crafted for **K Explore – Web Designing**. Event images are from [Unsplash](https://unsplash.com).
