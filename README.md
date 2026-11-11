# Postarc Webmail

**Postarc Webmail** is a high-performance, standalone webmail client built with **Next.js 16**, React 19, and the **Astryx Design System**. It features a modern, responsive, and accessible interface for email, calendar, contacts, filters, and settings, operating seamlessly client-side with persistent state.

---

## Features

- **Mail Inbox & Threading**: Unified folder view (Inbox, Starred, Sent, Drafts, Archive, Spam, Trash) with real-time thread viewer, reply composing, and star/unstar toggles.
- **Compose & Rich Message Editing**: Full-featured composer with recipients, subject, body, priority flags, and attachment support.
- **Interactive Calendar**: JSCalendar-compatible schedule viewer with event creation and date navigation.
- **Contact Management**: JSContact-compatible address book with search, card inspection, and contact creation.
- **Sieve Filters & Rules**: Interactive rule builder for automated email sorting, categorization, and vacation auto-responses.
- **Account & Preferences**: Quota visualization, signature management, display preferences, and identity settings.
- **Dark Mode**: System-aware, token-backed theming powered by `@astryxdesign/theme-neutral`.
- **Zero Backend Dependencies**: Fully self-contained pure frontend client with local persistence and JMAP protocol interfaces.

---

## Architecture Layout

```
Webmail/
├── webmail/                    # Next.js 16 + Astryx Webmail Application
│   ├── app/                    # App Router pages
│   │   ├── layout.tsx          # Root layout & theme providers
│   │   ├── page.tsx            # Gateway landing & authentication route
│   │   └── mail/               # Authenticated webmail views
│   │       ├── page.tsx        # Inbox & email thread manager
│   │       ├── calendar/       # Calendar & schedule manager
│   │       ├── contacts/       # Contacts & address book
│   │       ├── filters/        # Mail filtering rules
│   │       └── settings/       # Account & system preferences
│   ├── components/             # Astryx UI components
│   │   ├── postarc-auth.tsx    # Client authentication & onboarding
│   │   ├── webmail-client.tsx  # Full mail client suite & thread viewer
│   │   ├── theme-provider.tsx  # Theme context provider
│   │   └── theme-toggle.tsx    # Light / Dark mode switcher
│   ├── context/                # Webmail state provider (MailContext)
│   ├── lib/                    # Client-side JMAP mock & persistence engine
│   ├── types/                  # TypeScript interface definitions
│   └── package.json            # Webmail dependencies & scripts
│
├── AGENTS.md                   # Agent guidelines & Astryx rules
├── package.json                # Root npm workspace configuration
└── README.md                   # Project documentation
```

---

## Getting Started

### Prerequisites

- **Node.js**: v20 or higher
- **npm**: v10 or higher

### Installation

Clone the repository and install dependencies:

```bash
git clone <repo-url>
cd Webmail
npm install --prefix webmail
```

### Development Server

Start the local development server at `http://localhost:3000`:

```bash
npm run dev
```

### Production Build

Compile an optimized production build:

```bash
npm run build
```

To run the production server:

```bash
npm run start
```

### Astryx Component Verification

Verify design token and component compliance using the Astryx CLI:

```bash
npm run doctor
```

---

## Authentication & Demo Access

By default, Postarc Webmail initializes with demo credentials:
- **Email**: `admin@agilique.com`
- **Password**: Any password

All changes (sent emails, replied threads, created events, contacts, and custom folders) are saved in your browser's `localStorage` for a persistent, uninterrupted development and testing experience.
