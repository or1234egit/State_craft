# StateCraft

A two-player cooperative browser strategy game. One player is the **Minister of Finance**, the other is the **Minister of Defence**. Together you must survive as many enemy attacks as possible before your country falls.

## Tech Stack

- **Vite** — local dev & build
- **Vanilla JS** — no framework
- **Firebase Realtime Database** — real-time sync, transactions for idempotency
- **Netlify** — deployment target

---

## Quick Start

### 1. Clone / unzip the project

```bash
cd statecraft
npm install
```

### 2. Create a Firebase project

1. Go to [https://console.firebase.google.com](https://console.firebase.google.com)
2. Click **Add project**
3. Give it a name (e.g. `statecraft`)
4. Disable Google Analytics (not needed)
5. In the project dashboard, click **Web** (the `</>` icon) to register a web app
6. Copy the `firebaseConfig` object

### 3. Set your Firebase config

Open `src/firebase.js` and replace the placeholder `firebaseConfig` with your real values:

```js
const firebaseConfig = {
  apiKey: "...",
  authDomain: "...",
  databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
};
```

### 4. Enable Firebase Realtime Database

1. In Firebase Console, go to **Build → Realtime Database**
2. Click **Create Database**
3. Choose a region (e.g. `us-central1`)
4. Start in **test mode** (rules open for now)

### 5. Apply security rules

In the Firebase Console, go to **Realtime Database → Rules** and paste the contents of `firebase.rules.json`.

Or use the Firebase CLI:

```bash
npm install -g firebase-tools
firebase login
firebase init database   # select your project
firebase deploy --only database
```

### 6. Run locally

```bash
npm run dev
```

Open two browser tabs/windows to simulate two players.

---

## Deploying to Netlify

### Option A — Netlify UI

1. Run `npm run build`
2. Drag the `dist/` folder onto [https://app.netlify.com/drop](https://app.netlify.com/drop)

### Option B — Netlify CLI

```bash
npm install -g netlify-cli
netlify login
netlify init
netlify deploy --prod
```

### Option C — Connect Git repo

1. Push project to GitHub/GitLab
2. In Netlify: **Add new site → Import an existing project**
3. Set:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Click **Deploy**

The `netlify.toml` is already configured — no extra settings needed.

---

## How to Play

1. **Player A** opens the app and enters a room code (e.g. `CASTLE`), then clicks **Create Room**
2. **Player A** selects a role (Finance or Defence)
3. **Player B** opens the same URL, enters the same room code, clicks **Join Room**
4. **Player B** selects the remaining role
5. The game starts automatically

### Turn Phases

| Phase | Who Acts |
|-------|----------|
| Finance | Minister of Finance builds cities or transfers budget |
| Defence | Minister of Defence recruits and deploys soldiers |
| Attack | Automatic — enemy attacks, losses calculated |
| Next turn | Automatic — income added, new turn begins |

### Scoring (at game over)

- **Shared score**: turns survived
- **Finance personal score**: cities built
- **Defence personal score**: soldiers remaining

---

## Project Structure

```
statecraft/
├── index.html          # Entry point
├── package.json
├── vite.config.js
├── netlify.toml
├── firebase.rules.json # Database security rules
├── .gitignore
├── README.md
└── src/
    ├── main.js         # App boot, session, subscription orchestration
    ├── firebase.js     # All Firebase reads/writes, transactions
    ├── game.js         # Game formulas, constants, helpers (no Firebase/DOM)
    ├── ui.js           # All DOM rendering, screen management
    └── styles.css
```

---

## Future Extension Ideas

- **Firebase Auth** — persistent accounts, game history
- **Lobby browser** — list open rooms
- **Animated battle** — visual attack resolution
- **More roles** — Foreign Affairs, Science minister
- **Win condition** — survive N turns to win
- **Alliances** — second country, trade
- **Mobile layout** — dedicated mobile-first redesign
- **Spectator mode** — read-only room view
- **Reconnect grace period** — hold a disconnected player's slot for 60 seconds
