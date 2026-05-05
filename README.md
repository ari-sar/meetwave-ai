# MeetWave AI

AI-powered personal style analysis. Upload a portrait, get a 12-style comparison card, pay ₹19 to unlock and download.

## Stack
- Node.js + Express
- MongoDB Atlas (Mongoose)
- OpenAI GPT-4o (vision) + DALL-E 2 (image edit)
- Razorpay Checkout + webhook
- Vanilla JS SPA

## Getting Started

### Prerequisites
- Node.js v18+
- MongoDB Atlas connection string
- OpenAI API key
- Razorpay account (test or live)

### Install
```bash
npm install
```

### Env vars (`.env`)
```
MONGO_URI=mongodb+srv://...
OPENAI_API_KEY=sk-...
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=xxx
RAZORPAY_WEBHOOK_SECRET=xxx
JWT_SECRET=<random-256-bit>
NODE_ENV=development
ALLOWED_ORIGINS=https://ai.meetwavedigital.in
PORT=5000
```

### Run
```bash
npm run dev      # nodemon (serves client/ same-origin)
npm start        # production
```

See `CLAUDE.md` for architecture details.
