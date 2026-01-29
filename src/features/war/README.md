# Weekly Activity Report (WAR) Feature

## Overview
Enable supervisors to compile team accomplishments into formatted Weekly Activity Reports and share them up the chain of command.

## User Stories

### As a supervisor, I want to...
1. **Star accomplishments** from my activity feed so I can easily find them later
2. **Filter to starred items** so I can quickly see what I've marked as notable
3. **Select multiple accomplishments** from my team to include in a WAR
4. **Generate a formatted report** organized by categories
5. **Edit the report** before sharing (reorder, recategorize, add notes)
6. **Share the WAR** with my leadership chain
7. **View WARs shared with me** from my subordinate supervisors

### As a flight chief/commander, I want to...
1. **Receive WARs** from my subordinate supervisors
2. **Combine multiple WARs** into a roll-up report for my leadership
3. **Track WAR submission** to ensure all sections are reporting

## Categories

Standard WAR categories (configurable per unit):

| Category | Description |
|----------|-------------|
| Mission Impact | Direct mission accomplishments, ops tempo |
| Training & Readiness | PME, certifications, exercises, TDYs |
| Recognition & Awards | Quarterly awards, decorations, coins |
| Leadership & Mentorship | Troop development, mentoring activities |
| Programs & Initiatives | Additional duties, unit programs |
| Community Involvement | Volunteer work, base events |
| Challenges & Concerns | Issues requiring leadership awareness |
| Upcoming Events | Look-ahead items |

## UI Components Needed

### 1. Star Toggle
```tsx
// Add to accomplishment card
<StarButton 
  accomplishmentId={id}
  starred={isStarred}
  onToggle={handleToggle}
/>
```

### 2. Filter Bar
```tsx
<FilterBar>
  <FilterToggle label="Starred Only" active={showStarredOnly} />
  <DateRangePicker value={dateRange} onChange={setDateRange} />
  <TeamMemberFilter selected={selectedMembers} />
</FilterBar>
```

### 3. WAR Builder
```tsx
<WARBuilder>
  <AccomplishmentSelector 
    accomplishments={filtered}
    selected={selected}
    onSelect={handleSelect}
  />
  <WARPreview 
    items={selected}
    categories={categories}
    onReorder={handleReorder}
    onRecategorize={handleRecategorize}
  />
  <WARActions>
    <Button onClick={saveDraft}>Save Draft</Button>
    <Button onClick={generatePDF}>Export PDF</Button>
    <Button onClick={share}>Share</Button>
  </WARActions>
</WARBuilder>
```

### 4. WAR Viewer
```tsx
<WARViewer report={war}>
  <WARHeader title={war.title} dateRange={war.dateRange} />
  <WARCategories categories={war.content.categories} />
  <WARFooter createdBy={war.createdBy} sharedAt={war.sharedAt} />
</WARViewer>
```

## API Design

### Starring
```typescript
// Toggle star
POST /api/accomplishments/:id/star
Response: { starred: boolean }

// Get starred accomplishments
GET /api/accomplishments/starred?from=2026-01-20&to=2026-01-27
Response: { accomplishments: Accomplishment[] }
```

### WAR CRUD
```typescript
// Create WAR
POST /api/war
Body: {
  title: string;
  dateRangeStart: string;
  dateRangeEnd: string;
  accomplishmentIds: string[];
}
Response: { war: WARReport }

// Get WAR
GET /api/war/:id
Response: { war: WARReport }

// Update WAR
PUT /api/war/:id
Body: {
  title?: string;
  content?: WARContent;
  status?: 'draft' | 'published';
}

// Delete WAR
DELETE /api/war/:id

// List my WARs
GET /api/war?status=draft|published|all
Response: { wars: WARReport[] }
```

### Sharing
```typescript
// Share WAR
POST /api/war/:id/share
Body: {
  userIds: string[];  // specific users
  shareUpChain?: boolean;  // auto-share to supervisors
}

// Get WARs shared with me
GET /api/war/inbox
Response: { wars: WARReport[] }

// Mark as read
POST /api/war/:id/read
```

## Database Schema

```sql
-- See ROADMAP.md for full schema
```

## AI Integration

### Auto-Categorization
Use LLM to suggest category for each accomplishment:

```typescript
const prompt = `
Categorize this Air Force accomplishment into one of these categories:
- Mission Impact
- Training & Readiness
- Recognition & Awards
- Leadership & Mentorship
- Programs & Initiatives
- Community Involvement
- Challenges & Concerns
- Upcoming Events

Accomplishment: "${accomplishment.content}"

Return only the category name.
`;
```

### WAR Summary Generation
Optionally generate an executive summary:

```typescript
const prompt = `
Write a 2-3 sentence executive summary for this Weekly Activity Report:

${categories.map(c => `${c.name}:\n${c.items.join('\n')}`).join('\n\n')}

Keep it professional and highlight the most significant items.
`;
```

## File Structure

```
src/features/war/
├── README.md
├── types.ts
├── constants.ts
├── components/
│   ├── StarButton.tsx
│   ├── WARBuilder.tsx
│   ├── WARPreview.tsx
│   ├── WARViewer.tsx
│   ├── CategorySection.tsx
│   └── ShareDialog.tsx
├── hooks/
│   ├── useStarred.ts
│   ├── useWAR.ts
│   └── useWARInbox.ts
└── api/
    ├── star.ts
    ├── war.ts
    └── share.ts
```

## Research Questions

1. **Format examples** - What do current WARs look like across different units?
2. **Frequency** - Weekly? Bi-weekly? Configurable?
3. **Roll-up mechanics** - How do higher echelons combine subordinate WARs?
4. **Retention** - How long to keep WARs? Archive strategy?
5. **Notifications** - Email when WAR is shared? In-app only?
6. **PDF styling** - Official letterhead? Unit logos?

## Implementation Order

1. **Database migrations** - Add tables
2. **Star functionality** - Simple toggle first
3. **Filter by starred** - Add to activity feed
4. **WAR builder UI** - Multi-select + preview
5. **Generate report** - Format into categories
6. **Save/load drafts** - Persistence
7. **Share mechanism** - Basic sharing
8. **PDF export** - Downloadable format
9. **Inbox view** - Received WARs
10. **Roll-up feature** - Combine WARs

---

*Feature spec created: 2026-01-29*
