# MeetWave AI — Codebase Context

## What This Is

A premium AI-powered style analysis platform. Users upload a portrait, get a single 12-style comparison card (soft-blurred). They pay ₹19 via Razorpay to unlock + download the high-res PNG.

## Stack

| Layer | Tech |
|---|---|
| Backend | Node.js + Express.js, entry at `server/index.js`, port 5000 |
| Database | MongoDB Atlas via Mongoose — `Session` + `Job` models |
| AI (vision) | OpenAI GPT-4o (`analyzePortrait` in `server/utils/image.js`) |
| AI (image) | OpenAI `images.edit` with DALL-E 2 (`runImageEdit`) |
| Payments | Razorpay Checkout + webhook (`server/routes/payment.js`) |
| Auth | JWT secret + device fingerprinting (no login flow) |
| Frontend | Vanilla JS SPA + custom CSS (light Gen-Z theme) |
| Job model | Async generation with polling (avoids HTTP timeouts on long AI calls) |

## Directory Structure

```
meetwave-ai/
├── server/
│   ├── index.js                # Express app, helmet, CORS lockdown, trust proxy, raw-body webhook mount, SPA static, cleanup cron
│   ├── middleware/
│   │   └── rateLimiter.js      # 2 free generations per IP+fingerprint; bypassed if NODE_ENV !== production
│   ├── models/
│   │   ├── Session.js          # IP, fingerprint, freeCount, paid, downloadToken, tokenIssuedAt, lastSessionId, razorpayOrderId
│   │   └── Job.js              # status (queued|running|done|failed), stage, result, error
│   ├── routes/
│   │   ├── generate.js         # POST /api/generate (queues Job + returns 202), GET /api/generate/status/:jobId
│   │   ├── payment.js          # POST /create-order, POST /confirm (HMAC verify), webhookHandler (raw body)
│   │   └── verify.js           # GET /:token — validates token, streams comparison.png as attachment
│   └── utils/
│       ├── image.js            # GPT-4o portrait analysis + DALL-E 2 single comparison card with stage callback
│       └── hash.js             # SHA-256 helpers (used for download token)
├── client/
│   ├── index.html              # Light theme, sample slider, upload, skeleton loader, results, Razorpay Checkout
│   ├── app.js                  # Upload → poll job status → render → Razorpay → download
│   └── styles.css              # Inter + Instrument Serif, soft-white palette (#FAFAF7), accent #FF5A1F
└── uploads/generated/<sessionId>/comparison.png
```

## API Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/generate` | Queue generation Job (returns 202 + jobId) |
| GET | `/api/generate/status/:jobId` | Poll job status / get result |
| POST | `/api/payment/create-order` | Create Razorpay order with notes.sessionId |
| POST | `/api/payment/confirm` | Client-side success: verify HMAC, mark paid, return downloadToken |
| POST | `/api/payment/webhook` | Razorpay server-to-server (raw body, x-razorpay-signature) |
| GET | `/api/verify/:token` | Validate downloadToken, stream comparison.png as attachment |
| GET | `/health` | Liveness probe |

## Core Flow

1. User uploads portrait → `POST /api/generate` returns `{ jobId }` immediately.
2. Worker (`runJob` in `routes/generate.js`) calls `generatePreview` which: GPT-4o analyzes → sharp normalises → DALL-E 2 creates the 12-style comparison card.
3. Client polls `/api/generate/status/:jobId` every 3s, advances skeleton caption from `stage`.
4. On `done`, results are rendered with soft 8px blur + lock chip.
5. User clicks Unlock → `create-order` → Razorpay Checkout opens → success handler hits `/confirm` (signature verified) → image unblurs + download button reveals.
6. Razorpay webhook is the server-side source of truth (sets `paid` even if user closes tab).

## Key Patterns

- **Async jobs**: never block HTTP for AI calls. `setImmediate(runJob)` returns 202 in <500ms.
- **Stale job recovery**: on startup, in-flight jobs are marked `failed` so clients get a clean error.
- **Webhook raw body**: mounted with `express.raw({ type: 'application/json' })` BEFORE `express.json()`.
- **Download tokens**: SHA-256 of `sessionId:timestamp:JWT_SECRET`, 1h TTL, validated against `Session.downloadToken`.
- **Image normalization**: sharp `.normalise()` + `.modulate({ brightness: 1.1 })` so output lighting is consistent regardless of input.
- **Multer hardening**: 5MB limit, `image/jpeg|png|webp` only.
- **File cleanup**: hourly cron deletes `uploads/generated/*` folders older than 7 days.

## Required Env Vars

```
MONGO_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...
RAZORPAY_KEY_ID=rzp_live_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
JWT_SECRET=<random-256-bit>
NODE_ENV=production
ALLOWED_ORIGINS=https://ai.meetwavedigital.in
PORT=5000
```

## Dev Commands

```bash
npm run dev      # nodemon server on port 5000 (serves client/ same-origin)
npm start        # production server
```

## Production Notes

- Behind nginx/Cloudflare with HTTPS termination at the proxy. `app.set("trust proxy", 1)` is already set.
- Razorpay webhook URL: `https://ai.meetwavedigital.in/api/payment/webhook`.
- Helmet enabled; CSP currently disabled because Razorpay Checkout + Google Fonts CDN need allowlisting — tighten before launch.

## graphify

This project has a graphify knowledge graph at graphify-out/. Re-run `graphify update .` after major refactors so god nodes/communities reflect reality. The current graph.json is stale — it still references Stripe and the old per-style generation flow; regenerate after this change set.
