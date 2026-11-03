# 🎉 EventSphere – Responsive Event Management Website

EventSphere is a modern, fully responsive event management website. You can explore upcoming events, see the full details of each one, and register with a validated form. It's built with **HTML5, CSS3 and vanilla JavaScript**, with no frameworks or build step.

> **K Explore – Web Designing Task:** Design and Develop a Responsive Event Management Website

🔗 **Live Demo:** _add your deployed link here (GitHub Pages / Netlify / Vercel)_
📂 **Repository:** _add your GitHub repo link here_

---

## ✨ Features

### Core requirements
| Feature | Description |
|---|---|
| **Hero section** | Animated gradient background, headline, a search bar that jumps to results, animated stats, and a "Next up" card with a live countdown |
| **Featured events** | A horizontal slider (scroll-snap with arrow buttons) of hand-picked events |
| **Event cards** | Each card shows the image, name, date, time, venue, short description, price and how many seats are left |
| **Search** | Live search by name, venue, city, category or description (debounced) |
| **Category filter** | Chips for Music, Technology, Workshop, Sports, Food, Art and Business |
| **Sorting** | Sort by soonest date, price (low to high or high to low) or name |
| **Event details** | A modal with full info, highlights, organizer, seats left and a **Register Now** button |
| **Registration form** | Name, email, phone, event, number of tickets and a terms checkbox, with a live total price |
| **JS form validation** | Inline error messages, invalid fields highlighted with a shake animation, and focus moved to the first invalid field |
| **Confirmation message** | A success modal with a generated **Ticket ID** and a booking summary |
| **Responsive design** | Layouts for mobile, tablet and desktop, with a hamburger menu and a bottom-sheet modal on phones |

### 🔑 Login with Google
- **Google Sign-In is the only login method.** There are no passwords or other providers. It uses [Google Identity Services](https://developers.google.com/identity/gsi/web): the official button plus One Tap.
- You have to sign in to register. Your **name and email are filled in from your Google account**, and the email can't be edited.
- **My Bookings** only shows the registrations for the signed-in account. A profile menu in the navbar shows your avatar and has **Sign out**.

### 🏆 Bonus challenges (all implemented)
- 🌙 **Dark / light mode**: the toggle is saved in Local Storage, follows the OS preference on first visit, and doesn't flash on load
- ⏳ **Event countdown timers**: live days, hours, minutes and seconds in the hero card and in every event modal
- 🎞️ **Animations**: scroll-reveal sections, floating blobs, card hover lifts, modal pop-in, animated counters and a loading spinner. Motion is turned off when the user prefers reduced motion
- 💾 **Local Storage registration management**: bookings are saved and listed under **My Bookings**, can be cancelled, and update the seat counts across the site. The same email can't register twice for one event

### Validation rules
| Field | Rule |
|---|---|
| Full name | Required, at least 3 characters, letters, spaces, dots and hyphens only |
| Email | Required, valid format (`name@domain.tld`), unique per event |
| Phone | Required, valid 10-digit Indian mobile number starting with 6–9 (`+91`, spaces and dashes allowed) |
| Event | Required, and must be upcoming and not sold out |
| Tickets | 1–5, and no more than the seats left |
| Terms | Must be accepted |

---

## 🛠️ Tech Stack
- **HTML5**: semantic markup (`header`, `nav`, `main`, `section`, `article`, `footer`) with ARIA labels and roles
- **CSS3**: custom properties (design tokens), Flexbox, Grid, `clamp()`, scroll-snap, `backdrop-filter`, keyframe animations and media queries
- **JavaScript (ES6+)**: modules wrapped in an IIFE, event delegation, `IntersectionObserver`, `localStorage` and template literals
- **Git & GitHub** for version control

## 📁 Project Structure
```
EventSphere/
├── index.html        # Page structure: navbar, hero, featured, events, form, bookings, modals
├── css/
│   └── style.css     # All styles: themes, components, animations, responsive breakpoints
├── js/
│   ├── config.js     # Google OAuth Client ID
│   ├── data.js       # Event dataset (12 events) and category icons
│   └── app.js        # Rendering, search/filter/sort, modals, countdowns, validation, storage
└── README.md
```

## ⚙️ How it works
1. **Data:** events are stored as an array of objects in `js/data.js`. To add an event, add an object to the array and the site updates automatically.
2. **Rendering:** `app.js` builds the cards from the data with template literals. Search, category and sort are kept in one `state` object, and every change re-renders the grid.
3. **Details modal:** one delegated click listener opens the modal for any card. You can close it with **Esc**, the × button or by clicking the backdrop, and focus is handled for keyboard users.
4. **Validation:** each field has its own validator function that returns an error message. Fields are checked on blur, re-checked live after an error, and all checked again on submit.
5. **Storage:** a confirmed registration is saved to `localStorage` under the key `es-registrations`. Seats left are worked out as `total seats − booked tickets`, so cancelling a booking frees the seats.
6. **Theme:** the `data-theme` attribute on `<html>` switches the CSS variables. A small inline script in `<head>` applies the saved theme before the page is drawn.

## 🔐 Google Sign-In setup (required for login)
1. Open the [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) and create or select a project.
2. Set up the **OAuth consent screen**: choose External and add the app name and your email.
3. Click **Create credentials → OAuth client ID** and choose the **Web application** type.
4. Under **Authorized JavaScript origins**, add every URL the site runs on (no paths), for example:
   - `http://localhost`
   - `http://localhost:5173`
   - `https://<username>.github.io`
5. Copy the Client ID into `js/config.js`:
   ```js
   window.ES_CONFIG = { GOOGLE_CLIENT_ID: '1234-abc.apps.googleusercontent.com' };
   ```
> Google Sign-In does **not** work from `file://`. Run the site from a local server (see below) or from your deployed URL.
> The Client ID is public by design, so it's safe to commit. This is a front-end-only demo: the ID token is decoded in the browser, and the sign-in state is kept in Local Storage.

## 🚀 Run locally
No installation needed. Just open `index.html` in a browser, or run a local server:
```bash
npx http-server -p 5173 .
```
Then open http://localhost:5173.

## 🌐 Deployment
**GitHub Pages**
1. Push the project to a GitHub repository.
2. Go to **Settings → Pages**, set the source to the `main` branch and the `/ (root)` folder, then save.
3. Your site will be live at `https://<username>.github.io/<repo-name>/`.

**Netlify / Vercel:** import the GitHub repo and deploy. There's no build command, and the publish directory is the project root.

## 📱 Responsive breakpoints
| Width | Layout |
|---|---|
| > 1024px | Desktop: 3 featured cards per view, two-column hero and form |
| 600–1024px | Tablet: 2 featured cards, hamburger menu below 900px, stacked hero and form |
| < 600px | Mobile: swipeable featured cards, single-column form, bottom-sheet modals |

## 🔮 Future improvements
- A backend (Node/Express or Firebase) with real email confirmations
- An admin panel to create and manage events
- Payment gateway integration
- A calendar (.ics) export for booked events

---
Made with ❤️ for **K Explore – Web Designing**. Event images are from [Unsplash](https://unsplash.com).
