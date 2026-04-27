# Sunday Skins — UX Overhaul Plan

## Phase 1: Rebrand + Outdoor Color Scheme (Tonight)
1. Rename all "Alamo City BMW Golf Group" → "Sunday Skins"
2. New high-contrast color theme for sunlight readability
3. New logo SVG (simple, clean, golf-themed)
4. Update loading screen, header, footer references

## Phase 2: Mobile Scoring UX (Tonight/Next)
1. Number pad scoring (tap 3-9 buttons instead of +/-)
2. "Remember Me" — localStorage saves player name, auto-opens their card
3. Bigger fonts on mobile (min 16px for body, 20px+ for scores)
4. Simplified mobile nav (3 tabs: My Card, Leaderboard, Payouts)

## Phase 3: Responsive Layout (Next session)
1. Mobile: scoring + quick payouts only
2. Desktop: full admin dashboard with all current features
3. CSS media queries for breakpoints

## Phase 4: Multi-group / Scale (Future)
1. League system with invite codes
2. Player accounts (sign up once, join multiple groups)
3. Course database (not hardcoded)
4. PWA manifest for app store listing

## Color Scheme — Outdoor/Sunlight Optimized
Old: subtle greens, muted text, low contrast
New: high contrast, bold borders, readable in direct sunlight

### New Theme
- Background: #FFFFFF (pure white)
- Cards: #FFFFFF with 2px solid borders
- Text: #111111 (near black)
- Muted: #666666 (not too light)
- Accent: #1B5E20 (deep green, high contrast)
- Gold: #B8860B (dark goldenrod for money)
- Red: #C62828 (birdie/alerts)
- Score colors: solid backgrounds with borders, not just text color
  - Eagle: #FFF8E1 bg, #F57F17 border, #E65100 text
  - Birdie: #FFEBEE bg, #C62828 border, #B71C1C text  
  - Par: #E8F5E9 bg, #2E7D32 border, #1B5E20 text
  - Bogey: #F5F5F5 bg, #616161 border, #424242 text
  - Double+: #F3E5F5 bg, #7B1FA2 border, #6A1B9A text
