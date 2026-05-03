# MeetWave AI — Codebase Context

## What This Is

A premium AI-powered style analysis platform. Users upload a portrait photo, get 3 free AI-styled preview images (DALL-E 2), then pay ₹19 to unlock a full 12-style report. MVP/POC stage.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express.js (v4), entry at `server/index.js`, port 5000 |
| Database | MongoDB Atlas via Mongoose — single `Session` model |
| AI | OpenAI DALL-E 2 (`server/utils/image.js`) |
| Payments | Stripe (mocked — `server/routes/payment.js` not production-ready) |
| Auth | JWT + device fingerprinting (no login flow) |
| Frontend | Vanilla JS SPA + Tailwind CSS via CDN (`client/`) |

## Directory Structure

```
meetwave-ai/
├── server/
│   ├── index.js                # Express app, MongoDB connection, middleware stack
│   ├── middleware/
│   │   └── rateLimiter.js      # 2 free generations per IP+fingerprint; bypassed in dev
│   ├── models/
│   │   └── Session.js          # Tracks IP, device fingerprint, free usage count
│   ├── routes/
│   │   ├── generate.js         # POST /api/generate — core image generation endpoint
│   │   ├── payment.js          # POST /api/payment/create-intent — Stripe (mocked)
│   │   └── verify.js           # GET /api/verify/:token — token verification (mocked)
│   └── utils/
│       ├── image.js            # DALL-E 2 integration, 3 parallel style requests
│       └── hash.js             # Crypto utilities
├── client/
│   ├── index.html              # Single page, glassmorphism UI
│   ├── app.js                  # DOM logic, file upload, API calls, state management
│   └── styles.css              # CSS variables, custom styles
└── uploads/                    # Temp upload dir (files use os.tmpdir() in production)
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate` | Upload portrait → 3 DALL-E styled previews |
| POST | `/api/payment/create-intent` | Create Stripe payment intent (mocked) |
| GET | `/api/verify/:token` | Verify payment token (mocked) |

## Core Flow

1. User uploads portrait via `client/app.js`
2. `POST /api/generate` — rate limiter checks IP+fingerprint against `Session` in MongoDB
3. File saved to `os.tmpdir()`, sent to DALL-E 2 as 3 parallel requests (Urban Streetwear, Preppy Academia, Athletic Athleisure)
4. Image URLs returned, temp file deleted
5. After 2 free uses → upsell screen shown, Stripe payment flow triggered
6. Post-payment verification via `/api/verify/:token` (currently mocked)

## Key Patterns

- **Rate limiting**: IP + device fingerprint combo, DB-backed. Dev mode (`NODE_ENV !== "production"`) bypasses limits entirely.
- **File uploads**: Multer → `os.tmpdir()` (avoids live-server refresh loops). Always cleaned up in finally/error blocks.
- **Frontend state**: Progressive reveal — upload → loading spinner → results grid → upsell modal. Pure DOM manipulation, no framework.
- **Device fingerprinting**: Built from `navigator` + `screen` properties, hashed client-side.

## What's Mocked / Not Production-Ready

- Payment (`/api/payment/create-intent`) — Stripe integration scaffolded but not wired
- Verification (`/api/verify/:token`) — returns mock success
- DALL-E 2 does text-to-image only; no actual vision-based portrait analysis yet

## Dev Commands

```bash
npm run dev      # nodemon server on port 5000
npm run client   # live-server for client/
npm start        # production server
```

## Notes for Future Work

- Payment and verification routes need real Stripe webhook handling before launch
- Consider upgrading to DALL-E 3 or GPT-4o Vision for actual portrait-aware styling
- The `Session` model only tracks free usage — no user accounts exist
- All credentials live in `.env` — rotate before any public exposure
