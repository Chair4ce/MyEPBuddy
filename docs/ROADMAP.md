# MyEPBuddy Product Roadmap

## Vision
Transform MyEPBuddy from an EPB writing assistant into a comprehensive Air Force performance documentation platform.

---

## 🎯 Next Up: Weekly Activity Report (WAR) Management

### Overview
Enable supervisors to compile, generate, and share Weekly Activity Reports from team accomplishments.

### User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        ACTIVITY FEED                            │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☆ SSgt Smith completed AWS certification                │   │
│  │ ★ TSgt Jones led 5-person TDY to Red Flag              │   │
│  │ ☆ A1C Williams processed 200 travel vouchers           │   │
│  │ ★ SrA Davis recognized as Team of the Quarter          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                    [Filter: ★ Starred]                         │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ☑ TSgt Jones led 5-person TDY to Red Flag              │   │
│  │ ☑ SrA Davis recognized as Team of the Quarter          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                   [Generate WAR]                               │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              WEEKLY ACTIVITY REPORT                      │   │
│  │              Week of 27 Jan - 2 Feb 2026                │   │
│  │                                                          │   │
│  │  TRAINING & READINESS                                   │   │
│  │  • TSgt Jones led 5-person TDY to Red Flag             │   │
│  │                                                          │   │
│  │  RECOGNITION                                             │   │
│  │  • SrA Davis recognized as Team of the Quarter         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│                   [Share with Chain]                           │
│                            ▼                                    │
│              Flt/CC → Sq/CC → Gp/CC                            │
└─────────────────────────────────────────────────────────────────┘
```

### Features

#### Phase 1: Star/Favorite System
- [ ] Add star toggle to accomplishment cards in activity feed
- [ ] Store starred status per user (not global)
- [ ] Filter view: "Show starred only"
- [ ] Bulk star/unstar actions

#### Phase 2: WAR Generator
- [ ] Multi-select accomplishments from filtered view
- [ ] Select date range for WAR
- [ ] Auto-categorize accomplishments:
  - Mission Impact
  - Training & Readiness
  - Recognition & Awards
  - Leadership & Mentorship
  - Community Involvement
  - Other
- [ ] AI-assisted categorization (optional)
- [ ] Generate formatted report (markdown/PDF)
- [ ] Edit/reorder before finalizing

#### Phase 3: Sharing & Distribution
- [ ] Share WAR with specific team members
- [ ] Share up the supervision chain (1-click)
- [ ] Email distribution option
- [ ] WAR history/archive
- [ ] Combine WARs (roll-up for higher echelons)

### Technical Considerations

**Database Schema (Draft)**
```sql
-- Star/favorite tracking
CREATE TABLE accomplishment_stars (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES profiles(id),
  accomplishment_id UUID REFERENCES accomplishments(id),
  starred_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, accomplishment_id)
);

-- WAR reports
CREATE TABLE war_reports (
  id UUID PRIMARY KEY,
  created_by UUID REFERENCES profiles(id),
  title TEXT,
  date_range_start DATE,
  date_range_end DATE,
  content JSONB, -- structured report data
  status TEXT DEFAULT 'draft', -- draft, published, archived
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- WAR accomplishment links
CREATE TABLE war_accomplishments (
  war_id UUID REFERENCES war_reports(id),
  accomplishment_id UUID REFERENCES accomplishments(id),
  category TEXT,
  display_order INT,
  PRIMARY KEY (war_id, accomplishment_id)
);

-- WAR sharing
CREATE TABLE war_shares (
  id UUID PRIMARY KEY,
  war_id UUID REFERENCES war_reports(id),
  shared_with UUID REFERENCES profiles(id),
  shared_by UUID REFERENCES profiles(id),
  shared_at TIMESTAMPTZ DEFAULT NOW()
);
```

**API Endpoints (Draft)**
```
POST   /api/accomplishments/:id/star     - Toggle star
GET    /api/accomplishments/starred      - Get starred accomplishments
POST   /api/war/generate                 - Generate WAR from selection
GET    /api/war/:id                      - Get WAR report
PUT    /api/war/:id                      - Update WAR
POST   /api/war/:id/share                - Share WAR
GET    /api/war/received                 - WARs shared with me
```

### Research Needed
- [ ] How do units currently format WARs? (gather examples)
- [ ] Standard categories used across AF?
- [ ] Integration with official systems (vPC, etc.)?
- [ ] PDF generation library selection
- [ ] Real-time collaboration needs?

---

## 📋 Feature Backlog

### In Progress
- **Decoration Citations** - Generate AFAM/AFCM/MSM citations from EPB statements
  - Backend complete ✅
  - Frontend pending

### Near-Term (Q1 2026)
- **WAR Management** (see above)
- **Self-hosted Analytics** - PostHog replacement with Supabase
- **1206 Generator Improvements** - Better formatting, more templates

### Mid-Term (Q2 2026)
- **EPR/OPR Narrative Generator** - Full evaluation support
- **Feedback Session Tracking** - Document mid-term/annual feedback
- **Goal Setting & Tracking** - Connect accomplishments to goals
- **Mobile App** - React Native or PWA

### Long-Term (Q3-Q4 2026)
- **Unit Dashboard** - Aggregate stats for commanders
- **Skill Tracking** - Career development roadmap
- **Mentorship Matching** - Connect mentors/mentees
- **API for External Tools** - Integration with other military apps

---

## 💰 Monetization Ideas

### Free Tier (Current)
- Unlimited EPB statements
- Basic AI generation (rate limited)
- Single user

### Pro Tier ($9.99/mo?)
- Unlimited AI generation
- WAR management
- Decoration generator
- Priority support

### Team Tier ($29.99/mo?)
- Everything in Pro
- Team management features
- Shared templates
- Analytics dashboard

### Enterprise (Custom)
- SSO integration
- On-premise option
- Custom branding
- Dedicated support

---

## 📊 Success Metrics

| Metric | Current | Q1 Target | Q2 Target |
|--------|---------|-----------|-----------|
| Total Users | ~185 | 500 | 1,000 |
| Active Users (WAU) | ~18 | 100 | 250 |
| WAR Reports Generated | 0 | 500 | 2,000 |
| Paid Conversions | 0 | 25 | 100 |

---

*Last updated: 2026-01-29*
