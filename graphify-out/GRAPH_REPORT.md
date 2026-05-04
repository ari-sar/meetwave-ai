# Graph Report - .  (2026-05-04)

## Corpus Check
- Large corpus: 27 files · ~552,595 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 44 nodes · 44 edges · 8 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.95)
- Token cost: 40,756 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]

## God Nodes (most connected - your core abstractions)
1. `MeetWave AI Project Overview` - 6 edges
2. `server/routes/generate.js` - 5 edges
3. `generatePreview()` - 4 edges
4. `Frontend (Vanilla JS SPA + Tailwind CSS)` - 4 edges
5. `Portrait Upload & Style Analysis Flow` - 4 edges
6. `server/middleware/rateLimiter.js` - 3 edges
7. `server/utils/image.js` - 3 edges
8. `generateHash()` - 2 edges
9. `compareHash()` - 2 edges
10. `analyzePortrait()` - 2 edges

## Surprising Connections (you probably didn't know these)
- `Glassmorphism UI in HTML` --references--> `client/styles.css`  [INFERRED]
  client/index.html → CLAUDE.md

## Hyperedges (group relationships)
- **Complete Tech Stack Integration** — server_backend_layer, mongodb_database, dalle2_ai, stripe_payments, jwt_auth, frontend_vanilla_js [EXTRACTED 1.00]
- **API Endpoint System** — api_generate_endpoint, api_payment_endpoint, api_verify_endpoint [EXTRACTED 1.00]
- **Portrait Analysis Workflow** — core_flow_portrait_upload, routes_generate, utils_image_js, client_app_js, middleware_rateLimiter, models_Session [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.24
Nodes (10): POST /api/generate Endpoint, Portrait Upload & Style Analysis Flow, OpenAI DALL-E 2 Integration, Device Fingerprinting Mechanism, File Upload Pattern (Multer + Cleanup), server/middleware/rateLimiter.js, Rate Limiting Pattern (IP + Device Fingerprint), server/routes/generate.js (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.29
Nodes (6): MeetWave AI Project Overview, JWT + Device Fingerprinting Auth, server/models/Session.js, MongoDB Atlas Database, Backend (Node.js + Express.js), Stripe Payment Processing

### Community 2 - "Community 2"
Cohesion: 0.33
Nodes (1): Progressive Reveal Frontend State Pattern

### Community 3 - "Community 3"
Cohesion: 0.7
Nodes (4): analyzePortrait(), generatePreview(), prepareImageForEdit(), runImageEdit()

### Community 4 - "Community 4"
Cohesion: 0.5
Nodes (4): client/index.html, client/styles.css, Frontend (Vanilla JS SPA + Tailwind CSS), Glassmorphism UI in HTML

### Community 5 - "Community 5"
Cohesion: 1.0
Nodes (2): compareHash(), generateHash()

### Community 6 - "Community 6"
Cohesion: 1.0
Nodes (2): POST /api/payment/create-intent Endpoint, server/routes/payment.js

### Community 7 - "Community 7"
Cohesion: 1.0
Nodes (2): GET /api/verify/:token Endpoint, server/routes/verify.js

## Knowledge Gaps
- **9 isolated node(s):** `Stripe Payment Processing`, `JWT + Device Fingerprinting Auth`, `server/routes/payment.js`, `server/routes/verify.js`, `server/utils/hash.js` (+4 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 2`** (6 nodes): `getFingerprint()`, `app.js`, `renderComparison()`, `renderMetadata()`, `unlockComparison()`, `Progressive Reveal Frontend State Pattern`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 5`** (3 nodes): `hash.js`, `compareHash()`, `generateHash()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (2 nodes): `POST /api/payment/create-intent Endpoint`, `server/routes/payment.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (2 nodes): `GET /api/verify/:token Endpoint`, `server/routes/verify.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MeetWave AI Project Overview` connect `Community 1` to `Community 0`, `Community 4`?**
  _High betweenness centrality (0.150) - this node is a cross-community bridge._
- **Why does `server/routes/generate.js` connect `Community 0` to `Community 1`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `Frontend (Vanilla JS SPA + Tailwind CSS)` connect `Community 4` to `Community 1`, `Community 2`?**
  _High betweenness centrality (0.124) - this node is a cross-community bridge._
- **Are the 3 inferred relationships involving `server/routes/generate.js` (e.g. with `server/middleware/rateLimiter.js` and `server/models/Session.js`) actually correct?**
  _`server/routes/generate.js` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Stripe Payment Processing`, `JWT + Device Fingerprinting Auth`, `server/routes/payment.js` to the rest of the system?**
  _9 weakly-connected nodes found - possible documentation gaps or missing edges._