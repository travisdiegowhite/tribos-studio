# Tribos.studio - Project Context

> **Purpose**: This document provides context for AI assistants and developers working on the Tribos.studio codebase.

## Quick Overview

**Tribos.studio** is an advanced cycling training platform providing:
- Intelligent AI-powered route generation
- Training plan management and workout scheduling
- Activity tracking with multi-platform sync (Strava, Garmin, Wahoo)
- Athlete performance analysis and coaching

**Tech Stack**: React 19 + Vite + TypeScript | Mantine UI | Supabase (PostgreSQL + Auth) | Vercel Serverless | Claude AI

---

## Project Structure

```
tribos-studio/
├── src/                          # Frontend React application
│   ├── components/               # Reusable UI components
│   │   ├── AICoach.jsx          # AI-powered coaching
│   │   ├── TrainingCalendar.jsx # Calendar-based workout planning
│   │   ├── TrainingDashboard.jsx # Training analytics
│   │   ├── RouteBuilder.jsx     # Interactive route creation
│   │   ├── ImportWizard.jsx     # Activity import interface
│   │   ├── RideHistoryTable.jsx # Activity history display
│   │   ├── admin/               # Admin-only components
│   │   ├── planner/             # Training planner components
│   │   └── training/            # Training-specific components
│   ├── pages/                    # Page-level route components
│   │   ├── Dashboard.jsx        # Main user dashboard
│   │   ├── RouteBuilder.jsx     # Route creation page
│   │   ├── TrainingDashboard.jsx # Training analysis page
│   │   ├── PlannerPage.tsx      # Training planner
│   │   ├── Settings.jsx         # User settings & integrations
│   │   └── oauth/               # OAuth callback handlers
│   ├── contexts/                 # React Context providers
│   │   ├── AuthContext.jsx      # Authentication state
│   │   └── UserPreferencesContext.jsx
│   ├── hooks/                    # Custom React hooks
│   ├── stores/                   # Zustand state stores
│   │   ├── routeBuilderStore.js # Route builder state (persistent)
│   │   └── trainingPlannerStore.ts
│   ├── services/                 # Service integrations
│   ├── utils/                    # Utility functions
│   │   ├── claudeRouteService.js # Claude AI integration
│   │   ├── rideAnalysis.js       # Activity analysis
│   │   ├── directions.js         # Routing engine abstraction
│   │   ├── stravaService.js      # Strava API wrapper
│   │   ├── garminService.js      # Garmin API wrapper
│   │   └── workoutExport.ts      # Export to devices
│   ├── data/                     # Static data & templates
│   │   ├── trainingPlanTemplates.ts
│   │   └── workoutLibrary.ts
│   ├── lib/                      # Library configurations
│   │   ├── supabase.js           # Supabase client
│   │   └── sentry.js             # Error tracking
│   ├── types/                    # TypeScript definitions
│   └── App.jsx                   # Main app router
├── api/                          # Vercel serverless functions
│   ├── strava-*.js              # Strava OAuth & webhooks
│   ├── garmin-*.js              # Garmin OAuth & webhooks
│   ├── wahoo-*.js               # Wahoo OAuth & webhooks
│   ├── google-calendar-auth.js  # Google Calendar integration
│   ├── coach.js                 # AI coaching endpoint
│   ├── claude-routes.js         # AI route generation
│   ├── weather.js               # Weather API
│   └── utils/                   # Shared API utilities
├── database/                     # Database schema & migrations
│   └── migrations/               # SQL migration files (19+)
└── public/                       # Static assets & PWA manifest
```

---

## Technology Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.0.0 | UI framework |
| Vite | 6.0.0 | Build tool |
| TypeScript | 5.9.3 | Type safety (gradual migration) |
| Mantine | 8.0.0 | UI component library |
| Zustand | 5.0.9 | State management |
| React Router | 7.0.0 | Routing |
| Mapbox GL | 3.7.0 | Maps & visualization |
| Recharts | 2.13.0 | Charts |
| Turf.js | 7.1.0 | Geospatial processing |

### Backend & Infrastructure
| Technology | Purpose |
|------------|---------|
| Vercel | Deployment & serverless functions |
| Supabase | PostgreSQL database + Auth + RLS |
| Claude AI (Anthropic) | Route generation & coaching |
| Sentry | Error tracking |

### Third-Party Integrations
- **Strava**: OAuth 2.0, activity sync, webhooks
- **Garmin Connect**: OAuth 1.0a, activity sync, webhooks
- **Wahoo Fitness**: OAuth 2.0, webhooks
- **Google Calendar**: Event scheduling
- **OpenWeatherMap**: Weather data
- **Mapbox/Stadia Maps**: Routing engines

---

## Key Features

### 1. Route Management
- Interactive click-to-add waypoint route builder
- AI-powered route generation via Claude
- Multiple routing engines (Mapbox, Stadia/Valhalla)
- Route analytics (distance, elevation, difficulty)
- GPX export and sharing

### 2. Training Plans
- Pre-built templates (road racing, endurance, masters, etc.)
- Custom plan creation with structured phases
- 7 training methodologies (polarized, sweet spot, threshold, etc.)
- Workout library with power zone definitions
- Drag-and-drop calendar scheduling

### 3. Activity Tracking
- Multi-platform sync (Strava, Garmin, Wahoo)
- Real-time webhook updates
- Power curve and zone analysis
- CTL/ATL/TSS metrics
- Personal records tracking

### 4. AI Features
- AI Coach with contextual suggestions
- Accountability coach check-ins
- Claude-powered route generation
- Historical context retention (coach memories)

---

## Database Schema (Key Tables)

| Table | Purpose |
|-------|---------|
| `user_profiles` | User settings, FTP, weight, preferences |
| `activities` | Synced cycling activities from all sources |
| `training_plans` | User's training plans with status/compliance |
| `planned_workouts` | Individual scheduled workouts |
| `routes` | User-created and AI-generated routes |
| `bike_computer_integrations` | OAuth tokens for external platforms |
| `race_goals` | Target races with dates |
| `accountability_coach_memories` | AI coach context |

**Security**: Row Level Security (RLS) enabled on all user tables.

---

## Authentication & Authorization

- **Auth Provider**: Supabase Auth (email/password + Google OAuth)
- **Client-side**: Supabase anon key (limited permissions)
- **Server-side**: Supabase service key (full permissions)
- **Protected Routes**: `ProtectedRoute` component wrapper
- **API Auth**: Bearer token validation + user ID verification

---

## State Management

| Store | Technology | Purpose |
|-------|------------|---------|
| Auth state | React Context | User authentication |
| User preferences | React Context | Units, timezone, etc. |
| Route builder | Zustand (persisted) | Route creation state |
| Training planner | Zustand | Planner UI state |
| Remote data | Supabase queries | Activities, plans, etc. |

---

## Environment Variables

### Frontend (VITE_ prefix)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_STRAVA_CLIENT_ID
VITE_MAPBOX_TOKEN
VITE_STADIA_API_KEY
VITE_SENTRY_DSN
```

### Backend (no prefix - server-only)
```
SUPABASE_URL
SUPABASE_SERVICE_KEY
STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET
ANTHROPIC_API_KEY
OPENWEATHER_API_KEY
GARMIN_CONSUMER_KEY / GARMIN_CONSUMER_SECRET
WAHOO_CLIENT_ID / WAHOO_CLIENT_SECRET
```

---

## Development Commands

```bash
npm install              # Install dependencies
npm run dev              # Start dev server (port 3000)
npm run build            # Production build
npm run test             # Run tests (watch mode)
npm run test:coverage    # Coverage report
npm run lint             # ESLint
npm run type-check       # TypeScript checking
```

**Requirements**: Node.js >= 20.0.0

---

## Code Conventions

### File Organization
- **Pages**: Full page components in `/src/pages/`
- **Components**: Reusable UI in `/src/components/`
- **Hooks**: Custom hooks in `/src/hooks/`
- **Utils**: Shared functions in `/src/utils/`
- **Types**: TypeScript definitions in `/src/types/`

### API Routes
- Handler receives `req` and `res`
- CORS and rate limiting middleware
- Try-catch with consistent error responses
- User ID verification for data ownership

### TypeScript
- Gradual migration in progress (`allowJs: true`)
- Type definitions for training domain and database
- Path aliases: `@/*`, `@/types/*`, `@/components/*`, etc.

### Security Practices
- Environment variable segregation
- Rate limiting on sensitive endpoints
- RLS on all user data tables
- CORS validation

---

## Key Utilities

| File | Purpose |
|------|---------|
| `src/utils/directions.js` | Routing engine abstraction |
| `src/utils/rideAnalysis.js` | Comprehensive ride analysis |
| `src/utils/claudeRouteService.js` | Claude AI integration |
| `src/utils/workoutExport.ts` | Export to devices |
| `src/utils/fitParser.js` | Parse FIT files |
| `api/utils/rateLimit.js` | API rate limiting |
| `api/utils/activityDedup.js` | Duplicate detection |

---

## Testing

- **Framework**: Vitest 4.0.16
- **Environment**: jsdom
- **Location**: `src/**/*.{test,spec}.{js,jsx,ts,tsx}`
- **Mocking**: Supabase, browser APIs, environment variables

---

## Deployment

- **Platform**: Vercel
- **Build Output**: `dist/`
- **Functions**: `/api` directory (serverless)
- **PWA**: Workbox-based service worker
- **Caching**: Configured in `vercel.json`

---

## Important Notes for Development

1. **Always use Supabase service key** in API routes, never the anon key
2. **Rate limiting** is enforced on all public API endpoints
3. **RLS policies** ensure users can only access their own data
4. **OAuth tokens** are stored in `bike_computer_integrations` table
5. **Claude API calls** should only happen server-side (never expose key)
6. **Strava branding requirements** must be followed for compliance
7. **Migrations** are in `/database/migrations/` - run in order

---

## Recent Context

- Strava compliance review completed (branding updates)
- Contact link added to Settings page
- Active development on training plan features
- Gradual TypeScript migration in progress
