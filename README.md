# My EPBuddy

**Your AI-Powered Air Force Performance Brief Assistant**

My EPBuddy is a comprehensive web application designed for Air Force supervisors and their teams to efficiently track accomplishments, manage team hierarchies, and generate high-quality Enlisted Performance Brief (EPB), Officer Performance Brief (OPB), and Decoration narrative statements compliant with AFI 36-2406 and AFMAN 36-2806.

---

## Screenshots

### Team Supervision Tree
![Supervision Tree](docs/screenshots/supervision-tree.png)

Visualize and manage your entire supervision chain with an interactive hierarchical tree view. Filter by rank, zoom for large organizations, and quickly navigate your team structure.

### EPB Workspace
![EPB Workspace](docs/screenshots/epb-workspace.png)

The AI-powered workspace for generating and refining EPB statements. Features real-time collaboration, AI configuration, split view editing, and character counting—all in one streamlined interface.

### API Key Management
![API Keys](docs/screenshots/api-keys.png)

Bring your own API keys for OpenAI, Anthropic, Google AI, or xAI. Keys are encrypted and stored securely, giving you control over costs and ensuring reliable access.

---

## Key Features

### AI-Powered Statement Generation
- **Multi-Model Support** - Choose from GPT-4o, Claude 3.5 Sonnet, Gemini 2.0 Flash, or Grok 2.
- **Three Writing Styles** - Personal (your refined examples), Community (crowdsourced), or Hybrid.
- **Smart Context** - AI considers rank, AFSC, and accomplishment history for tailored statements.
- **Character Optimization** - Automatically fits statements within the 350-character myEval limit.
- **Synonym Finder** - Integrated tool to find high-impact military action verbs and alternatives.

### Performance & Decoration Workspaces
- **EPB/OPB Workspace** - Section-by-section editing for all Major Performance Areas (MPAs).
- **Decoration Generator** - Create citations for medals (AFCM, AFAM, MSM) with specific narrative constraints.
- **Weekly Activity Reports (WAR)** - Generate consolidated weekly reports from daily accomplishment entries.
- **Split View Mode** - Compare and edit statements side-by-side.
- **Real-Time Collaboration** - Multiple users can work on the same document with live cursor tracking and section locking.

### External Review System
- **Token-Based Sharing** - Generate secure, time-limited review links for leadership or peers.
- **Account-less Review** - Reviewers can provide feedback and edits without needing a MyEPBuddy account.
- **Feedback Integration** - View and apply reviewer suggestions directly within your workspace.

### Team & Project Management
- **Supervision Tree Visualization** - Interactive org chart with support for 700+ members.
- **Project Tracking** - Organize team accomplishments by specific missions, exercises, or deployments.
- **Managed Members** - Track team members who don't have accounts yet.
- **Team Activity Feed** - Real-time accomplishment updates from your entire chain.
- **Rank-Based Filtering** - Toggle visibility by rank tier (Officer, SNCO, NCO, Enlisted).

### Award Packages (AF Form 1206)
- **Full 1206 Support** - Create and manage award nominations for quarterly and annual awards.
- **Award Categories** - Amn, NCO, SNCO, CGO, FGO, and Civilian categories.
- **Period Configuration** - Annual, Quarterly, or Custom date ranges with fiscal/calendar year options.

### Statement Library
- **Personal & Shared Libraries** - Save refined statements and share them with your supervision chain.
- **Community Library** - Crowdsourced examples filtered by AFSC with a community voting system.
- **Bulk Parsing** - Import existing statements in bulk to quickly build your personal library.

---

## Technical Features

- **Real-Time Collaboration** - Supabase Realtime powers live cursor tracking and section locking.
- **AI Assessment** - Automated scoring and feedback for accomplishment entries to improve quality before generation.
- **Secure API Key Management** - AES-256 encryption for user-provided LLM keys.
- **Authentication Options** - Support for Email/Password, Google OAuth, and Phone-based login.
- **Responsive Design** - Optimized for desktop, tablet, and mobile devices.
- **Dark/Light Mode** - System-aware theme switching.

---

## Tech Stack

| Category | Technology |
|----------|------------|
| **Framework** | Next.js 15+ (App Router, Turbopack) |
| **Language** | TypeScript |
| **Styling** | Tailwind CSS 4 + shadcn/ui |
| **Database** | Supabase (PostgreSQL) |
| **Authentication** | Supabase Auth (Email, Google, Phone) |
| **AI SDK** | Vercel AI SDK (OpenAI, Anthropic, Google, xAI) |
| **State Management** | Zustand |
| **Real-Time** | Supabase Realtime (Broadcast, Presence) |
| **Icons** | Lucide React, Hugeicons |
| **Deployment** | Vercel |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm, pnpm, or yarn
- Supabase account
- API key for at least one AI provider (OpenAI, Anthropic, Google, or xAI)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/Chair4ce/myepbuddy.git
cd myepbuddy
```

2. **Install dependencies:**
```bash
npm install
```

3. **Configure environment variables:**
```bash
cp env.example .env.local
```

Update `.env.local` with your Supabase credentials and fallback API keys.

### Database Setup

1. Create a new Supabase project.
2. Run the migrations using Supabase CLI:
```bash
# Local development
npm run db:push:local

# Remote/Production
npm run db:push:remote
```

### Running Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## User Guide

### For All Users

#### Accomplishment Entries
- Navigate to **Entries** to log daily/weekly wins.
- Use the **AI Assess** feature to get immediate feedback on the strength of your action, impact, and metrics.
- Tag entries to specific **Projects** for easier organization during award cycles.

#### Generating Narratives
1. Go to **Generate** (EPB/OPB) or **Decoration**.
2. Select the ratee and the specific period/award type.
3. Use **AI Generate** to turn raw entries into polished narrative statements.
4. Use the **Synonym** tool to swap out overused verbs.

#### External Review
1. Click **Share for Review** in any workspace.
2. Copy the generated token link.
3. Send the link to your supervisor or mentor; they can edit and leave feedback directly.

### For Supervisors

#### Team Management
- Use the **My Team** tab to build your org chart.
- View the **Activity Feed** to see what your subordinates are logging in real-time.
- Create **Projects** and assign members to track group achievements for unit awards.

---

## Project Structure

```
src/
├── app/
│   ├── (app)/              # Protected app routes (Dashboard, Entries, Team, etc.)
│   ├── (auth)/             # Authentication (Login, Signup, Phone, Reset)
│   ├── (legal)/            # Privacy and Terms
│   ├── api/                # AI Generation, Analytics, and Review endpoints
│   ├── review/             # Token-based external review pages
│   └── actions/            # Server actions for database mutations
├── features/               # Feature-specific logic (Decorations, WAR)
├── components/             # UI components organized by feature
├── hooks/                  # Real-time collaboration and workspace hooks
├── lib/                    # Supabase clients, encryption, and military constants
├── stores/                 # Zustand state management
└── types/                  # TypeScript definitions
```

---

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key (Server-side only) |
| `NEXT_PUBLIC_APP_URL` | Base URL of the application |
| `OPENAI_API_KEY` | Fallback OpenAI key |
| `ANTHROPIC_API_KEY` | Fallback Anthropic key |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Fallback Google AI key |
| `XAI_API_KEY` | Fallback xAI key |

---

## Disclaimer

This application is not affiliated with, endorsed by, or connected to the U.S. Air Force, Department of Defense, or any government entity. It is a personal productivity tool designed to assist with performance brief preparation. Users are responsible for ensuring no Classified or Controlled Unclassified Information (CUI) is entered into the system.

---

Built with care for Air Force supervisors and their teams.