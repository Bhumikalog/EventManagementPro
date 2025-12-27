# 🎉 EventManagementPro

**EventManagementPro** is a professional-grade corporate event management platform that streamlines the complete event lifecycle — from event creation and intelligent resource allocation to secure payments and real-time QR-based attendee check-ins.

---

## 🚀 Key Features

### 🔹 Dual Dashboard System
- **Organizer Dashboard**: Centralized control panel to manage events, monitor registration statistics, and oversee real-time resource availability.
- **Participant Dashboard**: User-friendly interface to browse active events, manage registrations, and access tickets.

---

### 🔹 Intelligent Resource & Asset Management
- **Multi-Type Allocation**: Supports both venues (rooms, halls) and equipment (projectors, services) with independent capacity tracking.
- **Automated Conflict Resolution**: Prevents double-booking by validating real-time availability.
- **Auto-Release Logic**: Automatically releases associated resources when events are modified or deleted, restoring availability accurately.

---

### 🔹 QR Code Check-In System
- **Instant Verification**: Upload or scan QR codes to instantly verify attendee identity and payment status.
- **Integrated Database Updates**: Successful check-ins automatically update participant records and registration status.

---

### 🔹 Advanced Ticket & Payment Workflow
- **Flexible Ticket Tiers**: Supports both *Free* and *Paid* tickets with configurable pricing.
- **Secure Payments**: Integrated Razorpay payments via Supabase Edge Functions.

---

### 🔹 Real-Time Infrastructure
- **Live Synchronization**: Dashboards update instantly using Supabase Realtime when resources are allocated or attendees check in.

---

## 🛠️ Tech Stack

### Frontend
- React 18
- TypeScript
- Vite

### Styling & UI
- Tailwind CSS
- shadcn/ui
- Lucide React

### Backend & Infrastructure
- Supabase (PostgreSQL, Auth, Realtime, Storage)
- Supabase Edge Functions (Deno) for payments & role management

### State Management
- TanStack Query (React Query)

### Testing
- Vitest
- JSDOM
---

## 🔧 Installation & Setup

### 1️⃣ Clone the Repository
```bash
git clone <YOUR_GIT_URL>
cd EventManagementPro
```
2️⃣ Install Dependencies
```bash
npm install
```
3️⃣ Configure Environment Variables

Create a .env file in the root directory:
```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_supabase_anon_key
```
4️⃣ Database Setup

Apply migrations from:
```bash
/supabase/migrations
```

to initialize tables for events, resources, tickets, and check-ins.

5️⃣ Start Development Server
```bash
npm run dev
```

## 🚢 Available Scripts

| Script           | Description                          |
|------------------|--------------------------------------|
| `npm run dev`    | Start development server              |
| `npm run build`  | Build for production                  |
| `npm run lint`   | Run ESLint checks                     |
| `npm run test`   | Run unit & integration tests          |

🔐 Authentication

- Email & password authentication via Supabase

- Secure session handling with protected routes

🧪 Testing

- **Unit Tests**: Core logic validation

- **Integration Tests**: UI ↔ Supabase interaction testing

- **System Tests**: End-to-end workflow verification

Run tests:
```bash
npm run test
```
📦 Deployment

Build optimized production bundle:
```bash
npm run build
```

📄 License

This project is licensed under the MIT License.

🔐 Security

- **Role-Based Access Control (RBAC)** via Supabase Edge Functions

- **Protected Routing** for authenticated dashboards

- **Row-Level Security (RLS) policies** to enforce database integrity
