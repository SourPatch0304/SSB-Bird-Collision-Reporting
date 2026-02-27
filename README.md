# SSB Project Backend (Lights Out Texas Bird Collision Reporting)

Node.js + TypeScript backend for Twilio MMS bird-collision intake, EXIF extraction, threaded follow-up triage, and report management APIs.

## Features
- Twilio inbound MMS webhook (`application/x-www-form-urlencoded`) with TwiML replies.
- Enforces MMS rules: 1-5 photos, JPEG/PNG only, per-image byte cap.
- Threading by sender + configurable `THREAD_WINDOW_MINUTES`.
- EXIF extraction: capture time, GPS, orientation, camera make/model.
- `observedAt` source of truth: EXIF capture time when available, else message received time.
- Geohash generation from GPS.
- Follow-up chatbot with max 3 questions and rehabber guidance for alive/injured birds.
- Prisma + Postgres schema for reports, media, questions/answers, and conversation state.
- Admin/report APIs plus OpenAPI spec.

## Quick Start
1. Install dependencies:
```bash
npm install
```
2. Copy env and set values:
```bash
cp .env.example .env
```
3. Start Postgres:
```bash
docker compose up -d postgres
```
4. Run Prisma migration and generate client:
```bash
npm run prisma:migrate
npm run prisma:generate
```
5. Start backend in dev mode:
```bash
npm run dev
```

## Twilio Setup
1. Start tunnel:
```bash
ngrok http 3000
```
2. In Twilio number config:
- Inbound webhook: `https://<ngrok-id>.ngrok.io/webhooks/twilio/inbound`
- Status callback: `https://<ngrok-id>.ngrok.io/webhooks/twilio/status`

Ted owns the Twilio number and can configure these URLs.

## API Endpoints
- `POST /webhooks/twilio/inbound`
- `POST /webhooks/twilio/status`
- `GET /reports`
- `GET /reports/:id`
- `POST /reports/:id/answers`
- `POST /admin/reprocess/:id`
- `GET /healthz`

OpenAPI file: `docs/openapi.yaml`

## Twilio Webhook Curl Examples
New report with one JPEG:
```bash
curl -X POST http://localhost:3000/webhooks/twilio/inbound \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=+15125550123' \
  --data-urlencode 'Body=Found near Austin office tower' \
  --data-urlencode 'NumMedia=1' \
  --data-urlencode 'MediaUrl0=https://api.twilio.com/path/to/media' \
  --data-urlencode 'MediaContentType0=image/jpeg'
```

Follow-up answer:
```bash
curl -X POST http://localhost:3000/webhooks/twilio/inbound \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=+15125550123' \
  --data-urlencode 'Body=Alive/Injured' \
  --data-urlencode 'NumMedia=0'
```

STOP:
```bash
curl -X POST http://localhost:3000/webhooks/twilio/inbound \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'From=+15125550123' \
  --data-urlencode 'Body=STOP' \
  --data-urlencode 'NumMedia=0'
```

## Build and Test
```bash
npm run build
npm test
```
