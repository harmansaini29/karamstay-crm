# KaramStay Mobile Client (React Native / Expo)

This is the production-grade mobile operating system application for KaramStay. It is designed as a single application with role-separated flows:
- **Staff Interface**: Portfolio dashboard, properties & units management, tenant checks-in/outs, finance invoicing/expenses, maintenance ticket dispatching, PDF reports downloads.
- **Tenant Interface**: Due rent payments (Razorpay), building notices log, legal documents downloads, maintenance complaints filing.

---

## 1. Setup & Installation

From the workspace root, navigate to the mobile app and install dependencies:
```bash
cd apps/mobile
npm install
```

---

## 2. Environment Variables (`.env`)

Create a `.env` file (copied from `.env.example`):
```bash
cp .env.example .env
```

Configure the API base URL parameter:
- **Local Dev Server**: `EXPO_PUBLIC_API_BASE_URL=http://localhost:8000/api/v1` (or your machine's LAN IP if running on a physical device, e.g. `http://192.168.1.5:8000/api/v1`)
- **Production Server**: `EXPO_PUBLIC_API_BASE_URL=https://karamstay-api.example.com/api/v1`

---

## 3. Development Client & Local Runs

Because payments utilize the **Razorpay native checkout module** and secure store relies on native settings, you **cannot** run this application in a standard Expo Go client once native builds are triggered. 

To run the application:
1. Generate native folders locally:
   ```bash
   npx expo prebuild
   ```
2. Build and run on emulators / devices:
   - **Android**: `npm run android` (runs `npx expo run:android`)
   - **iOS**: `npm run ios` (runs `npx expo run:ios`, macOS required)

*Note: For immediate JavaScript-only debugging, a mock simulation fallback has been built around the Razorpay Checkout module, allowing the interface to be checked out in simulator environments without throwing native module crash warnings.*

---

## 4. Architecture & Design Principles

- **State Management**: Sourced entirely via `@tanstack/react-query` to manage cached endpoints.
- **Form Validation**: Sourced via `react-hook-form` + `zod` schemas replicating Pydantic constraints.
- **Design Tokens**: Centralized under `src/theme/tokens.ts` (colors, radius, font sizing, padding).
- **Theme Provider**: Supports system-aware light/dark mode with custom switches inside profile preferences.
- **API Wrapper**: Sourced via Axios (`src/api/client.ts`) normalizing error envelopes and handling token refreshes.

---

## 5. Known Limitations & Polyfills

To comply with backend specifications without modifying the backend codebase, the mobile client implements **smart client-side API polyfills** within the Axios interceptor layer:
1. **`GET /api/v1/invoices/{invoice_id}`**: Intercepted and resolved by searching the collection of `GET /api/v1/invoices` client-side.
2. **`GET /api/v1/tenancies/{tenancy_id}`**: Reconstructed dynamically by fetching the ledger logs (`GET /api/v1/ledger?tenancy_id={id}`). Start dates, rent balances, and deposits are extracted from the ledger debit logs, combined with check-in cache profiles.
3. **`GET /api/v1/tenancies/me`**: Fetched by scanning the tenant profile (`GET /api/v1/tenants/me`), finding their associated invoices to locate the tenancy ID, and loading the reconstructed tenancy logs with a realistic unit context.
