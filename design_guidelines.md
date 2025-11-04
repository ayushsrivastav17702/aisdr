# Design Guidelines: AI-Powered SDR Platform - Automation Features

## Design Approach

**Selected Approach**: Design System (Utility-Focused)

**Primary References**: 
- Linear (modern SaaS productivity tool aesthetic)
- Stripe Dashboard (clean data presentation)
- Notion (organizational clarity)

**Design Principles**:
- Information density balanced with breathing room
- Scannable hierarchies for quick decision-making
- Purposeful interactions that don't distract from workflow
- Professional polish that builds trust in automation

---

## Typography System

**Font Family**: Inter (via Google Fonts CDN)

**Hierarchy**:
- Page Titles: text-2xl font-semibold (32px)
- Section Headers: text-lg font-semibold (18px)
- Card/Modal Titles: text-base font-semibold (16px)
- Body Text: text-sm font-normal (14px)
- Labels/Metadata: text-xs font-medium (12px)
- Helper Text: text-xs (12px, muted)

**Line Heights**: Leading-relaxed for body text, leading-tight for headers

---

## Layout & Spacing System

**Tailwind Spacing Units**: Consistently use 2, 4, 6, 8, 12, 16, 24 units
- Component padding: p-6, p-8
- Section gaps: gap-6, gap-8
- Form field spacing: space-y-4
- Card margins: m-6, m-8
- Icon-to-text spacing: gap-2, gap-3

**Container Widths**:
- Dashboard main area: Full width with max-w-7xl centered
- Modal: max-w-2xl for forms, max-w-4xl for complex configurations
- Sidebar (if applicable): w-64 fixed

---

## Automation Modal Design

**Structure**: Two-step modal with clear progression

**Step 1 - Import Configuration**:
- Modal header with "Configure Apollo.io Automation" title and close button
- Stepper indicator (Step 1 of 2) using small pill badges
- Form layout in single column with generous vertical spacing (space-y-6):
  - API Key input with show/hide toggle icon (Heroicons eye/eye-slash)
  - Search criteria section with labeled input group
  - Filter tags using small badge components for added criteria
  - "Add Filter" button (ghost variant)
- Footer with "Cancel" (ghost) and "Next" (primary) buttons, right-aligned

**Step 2 - Sequence Assignment**:
- Same modal shell, updated stepper
- Preview card showing import summary (prospect count, filters applied) using muted background panel
- Sequence selector dropdown (shadcn Select component)
- Enrollment options as checkbox group (space-y-3)
- Schedule picker with radio group for immediate vs. scheduled
- Footer with "Back" (ghost), "Cancel" (ghost), and "Create Automation" (primary) buttons

**Modal Specifications**:
- Backdrop: Semi-transparent overlay with backdrop-blur-sm
- Modal panel: Elevated card with subtle border, rounded-lg
- Transitions: Smooth slide-up entrance (duration-200)
- Spacing: p-6 for content, p-4 for header/footer

---

## Automation Dashboard Design

**Layout Structure**: Full-width dashboard with header and table view

**Dashboard Header**:
- Title section with count badge ("12 Active Automations")
- Action bar with search input (w-80) and "New Automation" button (primary, with Heroicons plus icon)
- Tab navigation for "Active", "Paused", "Completed" filters

**Automation Table**:
- Responsive table component using shadcn Table
- Columns: Status (icon + badge), Name, Source, Last Run, Success Rate, Actions
- Status indicators: Small colored dots (8px) + text badge
- Success rate: Mini inline bar chart using div with width percentage
- Row hover states with subtle background transition
- Action menu: Dropdown with Heroicons ellipsis-vertical trigger

**Status Cards Row** (above table):
- Grid of 4 metric cards (grid-cols-4 gap-6)
- Each card: Icon, large number (text-3xl font-bold), label, trend indicator
- Icons from Heroicons: chart-bar, user-group, envelope, check-circle
- Compact card padding (p-5)

**Empty State** (when no automations):
- Centered content with large Heroicons cloud-arrow-up icon (w-16 h-16, muted)
- Title "No automations configured"
- Description text
- Primary CTA button "Create Your First Automation"

---

## Component Library

**Data Tables**:
- Zebra striping on hover only
- Sticky header when scrolling
- Compact row height (h-12)
- Right-aligned action columns

**Forms**:
- Stacked label-above-input pattern
- Input height: h-10
- Focus states with ring offset
- Inline validation with small error text below fields
- Required field indicators (asterisk)

**Buttons**:
- Primary: Filled with accent, font-medium
- Secondary/Ghost: Transparent with border
- Icon buttons: Square (w-10 h-10) with centered icon
- Button groups: gap-2 spacing

**Cards**:
- Border with rounded-lg corners
- Subtle shadow on elevated cards
- p-6 standard padding
- Divided sections use border-t separator

**Badges/Pills**:
- Rounded-full for status indicators
- Small size (px-2.5 py-0.5, text-xs)
- Medium weight text (font-medium)

**Icons**: Heroicons (outline style) via CDN, 20px (w-5 h-5) standard size, 16px (w-4 h-4) for inline

---

## Images

**No hero images needed** - This is a dashboard/tool application focused on functionality.

**Supporting Graphics**:
- Empty state illustrations: Simple line art or abstract shapes (400x300px) in muted tones
- Onboarding/welcome screens: Minimal spot illustrations showing automation concepts
- All images should maintain professional, non-distracting aesthetic

---

## Accessibility & Quality

- ARIA labels on all interactive elements
- Keyboard navigation support for modals (Esc to close, Tab progression)
- Focus visible rings on all interactive components
- Sufficient contrast ratios for text readability
- Loading states with skeleton screens for async operations
- Toast notifications for automation success/failure feedback