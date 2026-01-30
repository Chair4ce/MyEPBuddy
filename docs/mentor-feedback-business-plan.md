# MyEPBuddy: Mentor Feedback System
## Business Plan & Feature Proposal

**Date:** 2026-01-30
**Author:** Jarvis (with Jacy)
**Status:** Draft for Board Review

---

## Executive Summary

A peer review and mentorship system that allows users to share EPB statements with trusted mentors for feedback, captures that feedback to improve future AI generation, and ultimately preserves a mentor's "signature style" as an invokable AI persona.

**Core insight:** Military members rely on respected mentors throughout their careers, but mentors PCS, retire, or lose touch. This feature preserves mentorship value beyond the mentor's availability.

---

## Problem Statement

### User Research (Jacy's 20-year AF experience)

1. **Users want human feedback** — AI can generate statements, but users want validation from experienced writers they respect
2. **Mentors are transient** — Good mentors move stations, retire, separate. The relationship is lost.
3. **Feedback is currently lost** — Users email statements, get feedback via reply, but that knowledge isn't captured or reusable
4. **Pattern knowledge dies** — A mentor's writing style and standards exist only in their head

### The Opportunity

Capture mentorship interactions in a way that:
- Provides immediate value (feedback on current statement)
- Builds durable value (mentor's style informs future AI generation)
- Creates a moat (no competitor has "mentor personas")

---

## Proposed Solution

### Phase 1: Shareable Review Links (MVP)

**User Flow:**
1. User creates EPB statement
2. Clicks "Share for Review" → generates tokenized link (48h expiry)
3. Sends link to mentor (email, text, etc.)
4. Mentor opens link — no account required
5. Mentor sees statement + ACA guidelines for ratee's rank
6. Mentor highlights text, adds inline comments/suggestions
7. User receives notification, reviews feedback
8. User accepts/dismisses suggestions
9. Feedback stored for future AI training

**Technical Requirements:**
- Tokenized short-lived links with permission scope
- Text anchoring for inline comments (handle edits gracefully)
- Mentor UX: clean read + comment interface, no login
- Feedback schema captures: original text, suggestion, accepted bool, rank context

### Phase 2: Persistent Mentorship Memory

**User Flow:**
1. Feedback from mentors persists on user's profile
2. "Mentor Insights" button in EPB workspace
3. When generating new statement, system finds similar past contexts
4. Surfaces relevant mentor advice: "Your mentor previously suggested X in a similar context"
5. If no feedback yet, show explainer encouraging sharing

**Technical Requirements:**
- Vector embeddings for feedback + context
- Similarity search at generation time
- UI for surfacing relevant past advice

### Phase 3: Mentor Personas

**User Flow:**
1. Same mentor reviews multiple statements over user's career (same tokenized identity)
2. System builds mentor profile from aggregated feedback patterns
3. Mentor can optionally contribute their own statement bank (bulk paste)
4. User can invoke "Review as [Mentor Name]" — AI applies mentor's lens
5. Mentor's style persists even after they PCS/retire

**Technical Requirements:**
- Mentor identity tracking (email or persistent token)
- Mentor profile: feedback history + contributed statements
- Aggregate style vector for persona
- Consent model: mentor opts in to persona creation
- Generation mode that applies mentor's style

---

## Data Model

```
MentorFeedback {
  id
  userId              // statement author
  mentorId            // derived from token/email
  statementId         // loose reference
  sectionType         // Leadership, Mission, Resources, etc.
  rateeRank
  originalText
  highlightedSpan     // start/end positions
  feedbackText        // mentor's comment
  suggestion          // replacement text if any
  accepted            // bool
  createdAt
  embedding           // vector for similarity search
}

MentorProfile {
  mentorId
  displayName         // how they want to be identified
  email               // optional, for persistent identity
  feedbackCount
  contributedStatements[] {
    text
    sectionType
    rank
    embedding
  }
  styleVector         // aggregate embedding
  linkedUsers[]       // who can invoke this mentor
  consentedToPersona  // bool
  createdAt
  lastActiveAt
}

UserMentorSettings {
  userId
  preferredMentors[]  // mentor IDs they frequently use
  mentorInsightsEnabled // bool
}
```

---

## Business Value

### Immediate (Phase 1)
- **Increased engagement:** Users return to check feedback
- **Viral loop:** Every share = potential new user (mentor)
- **Data capture:** Feedback improves AI quality over time

### Medium-term (Phase 2)
- **Retention:** Personal mentorship memory is sticky
- **Differentiation:** "Your mentor's advice, always available"
- **AI improvement:** Real human feedback trains better generation

### Long-term (Phase 3)
- **Moat:** Mentor personas are unique, defensible
- **Network effect:** Good mentors become known, attract users
- **Emotional value:** "Preserve the mentorship that shaped your career"

### Monetization Potential
- Free: Basic sharing + feedback
- Premium: Mentor personas, unlimited history, advanced style matching
- Enterprise: Unit-wide mentor networks, leadership style libraries

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Mentor doesn't respond | Set expectations, allow multiple mentors |
| Privacy concerns (EPB content) | Short-lived tokens, explicit sharing, no public access |
| Mentor persona feels "creepy" | Frame as "preserving advice style" not "cloning person" |
| Not enough feedback for useful persona | Require minimum threshold before persona available |
| Mentor contributes low-quality statements | Optional quality filter, user can curate |
| Text anchoring breaks on edits | Lock during review or fuzzy re-anchoring |

---

## Competitive Landscape

| Competitor | Peer Review? | AI Generation? | Mentor Personas? |
|------------|--------------|----------------|------------------|
| myEval (official) | No | No | No |
| BulletForge | No | Yes | No |
| ChatGPT/Claude | No | Yes | No |
| **MyEPBuddy** | **Yes** | **Yes** | **Yes (planned)** |

This creates a defensible moat that pure AI tools cannot replicate.

---

## Roadmap

| Phase | Features | Timeline | Effort |
|-------|----------|----------|--------|
| 1 | Shareable review links, inline comments, feedback capture | 4-6 weeks | Medium |
| 2 | Mentor insights, similarity search, persistent memory | 4-6 weeks | Medium |
| 3 | Mentor profiles, bulk statement import, persona invocation | 6-8 weeks | High |

---

## Questions for the Board

1. Does the phased approach make sense, or should we scope differently?
2. Is the consent model for mentor personas sufficient?
3. What's the right threshold before a mentor persona becomes invokable?
4. Should mentor personas be shareable between users (with mentor consent)?
5. How aggressive should we be with the monetization angle?

---

## Supporting Context

- **User research:** Based on Jacy's 20-year Air Force experience and conversations with actual MyEPBuddy users
- **Expressed need:** Users want feedback from humans they respect, not just AI
- **Personal validation:** Jacy himself would use this feature — has lost touch with valuable mentors over his career

---

*Prepared for Oaiken Advisory Board review.*
