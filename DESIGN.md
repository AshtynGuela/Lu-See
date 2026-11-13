---
name: Very Best Lunar Site Scouter
description: A cinematic Solar System navigation console for traceable lunar site analysis.
colors:
  accent: "#c9e787"
  accent-hover: "#d9efb3"
  accent-ink: "#152115"
  sun: "#f3c77b"
  earth: "#7cb8df"
  warning: "#f0b77c"
  background: "#080d12"
  panel: "#101920"
  raised: "#18252d"
  line: "#2a3b44"
  text: "#edf1e9"
  muted: "#b5c7cd"
  field: "#0b1319"
  control-hover: "#263943"
  control-hover-line: "#50646c"
  rail-active: "#202e28"
  rail-hover: "#19262d"
  chip: "#23352d"
  chip-text: "#d9edbb"
typography:
  display:
    fontFamily: '"D-DIN", sans-serif'
    fontSize: "clamp(42px, 5.2vw, 76px)"
    fontWeight: 500
    lineHeight: 1.06
    letterSpacing: "-0.035em"
  headline:
    fontFamily: '"D-DIN", sans-serif'
    fontSize: "23px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  title:
    fontFamily: '"D-DIN", sans-serif'
    fontSize: "18px"
    fontWeight: 600
    letterSpacing: "-0.02em"
  body:
    fontFamily: '"D-DIN", sans-serif'
    fontSize: "14px"
    lineHeight: 1.65
  label:
    fontFamily: '"D-DIN", sans-serif'
    fontSize: "10px"
    letterSpacing: "0.11em"
  clock:
    fontFamily: '"D-DIN", sans-serif' 
    fontSize: "12px"
rounded:
  flat: "0"
  chip: "4px"
  field: "5px"
  control: "6px"
  toolbar: "7px"
  notice: "8px"
  compact-panel: "10px"
  panel: "12px"
  mode-toggle: "20px"
  round: "50%"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  panel: "20px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-standard:
    backgroundColor: "{colors.raised}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "9px 12px"
  button-standard-hover:
    backgroundColor: "{colors.control-hover}"
  button-text:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.flat}"
    padding: "0"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.text}"
    rounded: "{rounded.field}"
    padding: "10px 11px"
    width: "100%"
  rail-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.field}"
    padding: "9px 0"
    width: "54px"
    height: "66px"
  rail-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.accent}"
  inspector:
    backgroundColor: "{colors.panel}"
    rounded: "{rounded.panel}"
    width: "350px"
---

# Design System: Very Best Lunar Site Scouter

## Overview

**Creative North Star: "Earth–Moon navigation console"**

The confirmed direction combines cinematic exploration, a detailed Terra Invicta-inspired strategy interface, genuine NASA visual assets, and a dark navigation console. The map is the primary workspace. The user’s revised opening on 13 November 2026 starts at a Sun-centred Solar System overview, referencing JPL’s Orbit Viewer, then leads into Earth–Moon exploration and detailed lunar analysis. The eight supplied NASA planet models provide basic exploration context; landing-site analysis remains Moon-only. Rocky remains a curious, concise companion using the supplied character model. The existing North Star names the console identity; the revised opening does not establish a separate visual direction or brand slogan.

The implemented system frames spatial exploration with compact instruments, quiet separators and anchored scientific evidence. Cinematic entry hands over to a working console: a narrow instrument rail, Solar System body catalogue and selected-body card, contextual lunar site tools, a lunar inspector, and persistent UTC transport. An orbital atlas, mission-control wall, scientific plotting bench and instrument-panel sky viewer remain useful structural analogies: retain their information density, connected annotations and responsive controls without treating them as independently selected visual directions.

This is a code-led record merged from the current build and its provisional document. No generated visual comps, FORM seed, catalog selection or quality-board provenance is asserted. Exact palette, typography, dimensions and effects below are implementation choices, not additional user approvals. Sidecar tonal ramps are synthesized preview aids, not additional application colors. This update records the revised Solar System surface from current source. The Solar review records a ship disposition with welcome, desktop, inner-planets, Saturn, physical-scale and mobile captures in `.impeccable/review/solar/`; these captures do not establish visual QA for every viewport or camera state.

**Key Characteristics:**
- Sun-centred exploration leading to Moon-only analysis, surrounded by compact, anchored instruments.
- Dark blue-black surfaces, restrained lime signals, distinct Sun and Earth colors.
- Genuine imagery with visible scientific provenance and data limitations.
- D-DIN interface typography and tabular numerical readings.
- Reduced-motion alternatives and visible keyboard focus.

## Colors

Blue-black neutrals hold the scene; pale lime signals actions, selection and links. Frontmatter values are normative; the names below describe their uses.

### Primary
- **Navigation lime** (`accent`): primary buttons, active controls, links, focus rings and selected labels. The lighter `accent-hover` is the primary-button hover state; `accent-ink` keeps its label dark.

### Secondary
- **Solar amber** (`sun`): Sun readings and sunlight tracks.
- **Earth blue** (`earth`): Earth readings and communication tracks.

### Tertiary
- **Caution peach** (`warning`): missing-data details, error text and limited-data indicators. This is a semantic state color, not an ornamental accent.

### Neutral
- **Space black** (`background`): page and cinematic backdrop.
- **Console charcoal** (`panel`): inspector, flyouts and trays.
- **Raised slate** (`raised`): standard button surfaces.
- **Instrument rule** (`line`): one-pixel borders and section dividers.
- **Off-white** (`text`) and **mist slate** (`muted`): primary text and supporting labels.
- **Field black** (`field`): editable inputs. Hover slate and its lighter rule distinguish standard controls on interaction.
- Green-tinted rail variants mark the active selection.

**The Evidence Color Rule.** Pair scientific quality and availability colors with words, symbols or patterns; color alone does not establish a result.

## Typography

D-DIN is the interface, chart and clock font, with sans-serif fallback. Keep coordinate, measurement and clock labels readable at compact sizes.

The variable sans-serif holds both the cinematic headline and dense analysis without changing visual voice. Tracking tightens headings; small navigation/status labels occasionally add spacing. There is no fixed mathematical type-scale ratio or global prose-width token in the code.

### Hierarchy
- **Display:** frontmatter display role for the welcome headline. At the compact breakpoint it becomes (43px).
- **Headline:** inspector title uses the headline role; compact title (19px). The base page heading is (25px); dialog headings are (23px).
- **Title:** base section title (18px); inspector section headings use (13px, weight 650).
- **Body:** root size (14px), paragraphs with line height (1.65). Dense panel copy commonly uses (11–13px). Welcome copy uses (17px, line height 1.8).
- **Label:** tracked (10px) role describes top-center status; rail labels use (10px) without that tracking. Auxiliary labels range from (8–12px); do not apply one label style indiscriminately.
- **Readout:** key Sun/Earth values use (25px, weight 500, line height 1.65, tracking -0.025em); UTC uses the clock role.

## Layout

The application occupies the full viewport with page scrolling disabled. Panels scroll internally. The desktop scene sits behind an (82px) top bar, (66px) left rail and (52px) bottom clock bar. Flyouts begin at (left 82px, top 100px), with base width (282px); the inspector begins at (top 100px, right 20px), with base width (350px), capped at `calc(100% - 172px)` high. Tools and evidence surround the scene rather than using a centered marketing-page container.

The Solar System surface uses the same console shell. Its body catalogue sits at (left 82px, top 170px, width 208px), and the selected-body card at (right 20px, top 170px, width 260px). Both use panel tokens, (18px) padding, and scroll internally within a `calc(100dvh - 260px)` height cap. Camera controls sit at (top 163px), centered between the side instruments. At (max-width 1100px), catalogue/card widths become (170px/220px), padding (14px), and camera controls move to (top 148px).

Repeated spacing steps are in frontmatter; component-specific gaps and offsets also exist. Inspector sections use (20px) padding, flyouts (20px 16px), dialogs (27px), and the date-slip tray (24px). Measurement groups and event lists use two-column grids. Comparison columns scroll horizontally with a desktop minimum width (260px). Trays sit above the clock at (bottom 67px); comparison can span to (right 20px).

At (min-width 1600px), flyout width grows to (300px), inspector to (370px), and Rocky moves to (right 410px). At (max-width 1200px), center header status disappears, flyout becomes (250px), inspector (310px, right 14px), toolbar text labels hide, and comparison/timeline trays reach (right 14px).

At (max-width 760px), top bar is (66px), rail (51px), clock (55px). The world viewport is inset by those controls; with an inspector open, its bottom becomes `calc(43dvh + 67px)`. The inspector becomes an internally scrolling bottom drawer (left 61px, right 10px, bottom 67px, max-height 43dvh). Flyouts are (260px) wide at (left 61px, top 78px); comparison columns become (250px). Toolbar controls condense, secondary header/clock actions hide, dialogs use (21px) padding, and the mascot orb reduces to (64px). At (max-width 700px), Moon/selected-site labels condense and Rocky clears the comparison tray. These are observed rules, not a claim that every viewport has passed visual QA.

On the Solar System surface at (max-width 760px), the catalogue becomes a horizontally scrolling body strip (left 61px, right 10px, top 134px, max-height 43px); its heading, helper copy and Moon-access tag hide. Camera controls wrap below at (top 185px). The selected-body card becomes an internally scrolling bottom panel (left 61px, right 10px, bottom 67px, max-height 194px, padding 12px), with compact scale controls at its top right. The map and label viewport reserve (280px) at the bottom; Rocky sits at (right 16px, bottom 278px).

## Elevation & Depth

The scene supplies physical depth. The console uses tonal layers, hairline borders and stacking order for most structure. There is no backdrop blur. Semitransparent navigation surfaces and the cinematic welcome gradient retain scene context. Ordinary flyouts and the inspector have no box shadow. Temporary overlays use dark structural shadows:

### Shadow Vocabulary
- **Dialog:** `0 20px 80px #0009`.
- **Context menu:** `0 12px 40px #0009`.
- **Toast:** `0 8px 30px #0008`.
- **Landing choice:** `0 20px 70px #0009`.

The welcome departs through opacity/visibility transition (2.3s). Standard buttons transition background and border color (0.15s). Lunar view changes interpolate the camera over (0.95s) with cubic ease-out; Solar System focus uses (1.1s) cubic ease-out and is interrupted by manual navigation. In both surfaces reduced motion snaps camera focus. Cinematic travel uses (5.5s) smoothstep timing. Travel is a visual transition and does not imply a computed transfer trajectory. Reduced motion removes CSS animation/transitions, bypasses camera interpolation and cinematic travel, and changes Rocky rendering behavior; preserve these alternatives.

## Shapes

Controls use gently rounded corners rather than a uniform card silhouette. Buttons use the control radius, fields the field radius, and major panels the panel radius. The toolbar is slightly tighter; notices and context menus use the notice radius. Compact inspector and travel banner use the compact-panel radius. Mode toggle is pill-like; site-family badges are circular. Rocky uses a transparent model hit area and supplied pixel speech bubbles. Site rows and timeline cells stay square and align with ruled data. Borders are generally (1px). The map and genuine body/terrain assets provide organic geometry.

## Components

### Buttons
Compact instruments with explicit states. Standard and primary variants share (9px 12px) padding, a (1px) border and (8px) icon/text gap. Primary actions use signal lime with dark text and weight (650); hover uses lighter signal. Standard controls use raised slate; hover lightens background and border. Text buttons are borderless, unpadded, muted and turn lime on hover. Disabled buttons use opacity (0.5) and a not-allowed cursor. There is no separate general pressed-state style.

Buttons, links, inputs, selects and summaries receive a signal outline (2px) with (3px) offset when keyboard-focused. Preserve the skip link and textual labels when adapting controls.

### Inputs / Fields
Dark inset fields with a thin instrument-rule border, field radius and (10px 11px) padding. Text uses off-white, caret uses signal lime, and native controls request dark color scheme. Number fields use tabular figures. Search fields are slightly darker with (12px) type. Error text is caution peach; no distinct generic error-border or disabled-input skin is established. Rocky's question field sits in a separately outlined compound control.

### Navigation
The rail uses vertical icon-and-label controls. Default labels are muted; active controls have a green-tinted surface and lime text; hover uses slate and off-white. Rail buttons are (54px × 66px), reducing to (44px × 58px). The view toolbar groups transparent buttons inside one bordered surface; active buttons have a green-tinted background. Keep visible site access and labeled keyboard alternatives to map context menus.

### Cards / Containers
The inspector is a contextual evidence container with panel surface, thin border, scrolling interior and separated sections. Header padding is (23px 20px 15px); section padding (20px). Quality banners use green or caution-tinted surfaces with explanatory words. Event controls use inset surfaces in two columns. Comparison columns use separating rules rather than independent raised cards.

### Solar System Map
The Sun anchors the overview; eight NASA planet models sit on sampled JPL paths. The three map views use supplied purple nebula, blue nebula and starfield art respectively. Whole-system and inner-planets controls recover useful framing. Selecting a model, label or catalogue row focuses that body and updates the selected-body card. The catalogue marks Earth as Moon access on desktop; the card keeps an explicit Earth–Moon entry action. Orbits and labels have independent labeled checkbox controls.

Readable mode compresses radial spacing and enlarges body sizes; Physical scale uses linear AU spacing and physical body sizes. Numerical AU/km distance readouts remain unscaled. Keep this explanation next to the scale controls, including when physical bodies are too small to see at whole-system distance. Visible text labels stay independent of physical body size. Label placement tests nearby offsets to reduce label collisions, prioritizing Sun, selected body and Earth, with leader lines connecting displaced labels to their bodies. Offscreen labels and labels for missing positions hide; bounded candidate placement is not a guarantee of collision-free labels in every camera view.

The selected-body card distinguishes visual models from lunar analysis, discloses planetary-system barycentres and Venus surface imagery where relevant, and exposes position provenance in a disclosure. Loading counts, unavailable data and retry remain explicit; catalogue rows wait for real position data before enabling. Preserve UTC and source context when adding map controls.

### Sky Strip, Timeline and Layer Legend
The sky strip pairs terrain silhouette and Sun/Earth positions with numerical readings and event controls. Keep sources and unavailable states adjacent. Timeline sunlight/communication tracks use the body colors; down periods use diagonal hatching, no-data periods a dark fill. Layer legends pair a scale with labels and provenance links. NASA globe imagery is visual context; measured overlays and terrain analysis retain separate evidence labels.

### Rocky
The supplied 3D character moves freely over the app. Click to chat, drag to reposition, pinch to resize, or right-click or long-press to open Rocky's animation and dialogue options. Reply and idle text use the supplied pixel speech bubble artwork. The reply can appear gradually with Calm dialogue blips or all at once. Keep chat controls alongside the reply, and keep map attachment, evidence, history, cancellation and retry available.

## Do's and Don'ts

### Do:
- **Do** keep the scene navigable while instruments and evidence remain anchored around it.
- **Do** reuse the frontmatter tokens and actual component states when adding console tools.
- **Do** keep readable/physical-scale distinctions, unscaled numerical distances, UTC, source links and missing-data labels visible where they affect interpretation.
- **Do** preserve keyboard focus, labeled alternatives and reduced-motion paths.
- **Do** use genuine imagery and the supplied Rocky character with their documented roles.

### Don't:
- **Don't** fabricate scientific readings, terrain quality or availability to complete a visual layout.
- **Don't** present NASA globe imagery as the data source for terrain or visibility analysis.
- **Don't** turn passive context chips into interactive controls without a real action.
- **Don't** treat the palette, metaphor or synthesized preview ramps as evidence of a separate user-approved visual workshop.
- **Don't** extend detailed landing-site analysis beyond the Moon or replace the map-first console with a marketing-page composition.
