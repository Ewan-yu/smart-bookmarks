# Design System Strategy: The Digital Curator

## 1. Overview & Creative North Star
The Creative North Star for this design system is **"The Digital Curator."** 

In an era of information fatigue, a bookmarking tool should not feel like a cluttered filing cabinet; it should feel like a high-end personal gallery. We move beyond the "generic SaaS" aesthetic by embracing **Atmospheric Depth** and **Editorial Precision**. This system rejects the rigid, boxed-in layouts of traditional browser tools in favor of an expansive, airy environment where content is separated by tonal shifts rather than harsh lines. 

The visual signature is defined by high-contrast typography, intentional asymmetry in information density, and a "Glass & Light" philosophy that makes the interface feel like a premium, tactile layer resting over the user’s digital world.

---

## 2. Colors
Our palette balances the authority of deep indigo with the vibrant energy of tech-forward accents.

### Color Tokens (Selection)
- **Primary:** `#000058` (Deep Navy Authority)
- **Secondary (Action):** `#006591` (Vibrant Productivity Blue)
- **Tertiary (AI/Insight):** `#00190e` (Deep Forest) / Accent: `#4edea3` (Electric Emerald)
- **Surface:** `#f7f9fb` (The Base Canvas)
- **Surface Container Low:** `#f2f4f6` (Subtle Sectioning)
- **Surface Container Highest:** `#e0e3e5` (Prominent Grouping)

### The "No-Line" Rule
Standard 1px borders are strictly prohibited for defining layout sections. Instead:
- **Tonal Separation:** Use `surface-container-low` for sidebars and `surface` for main content.
- **Negative Space:** Use the 32px (`8`) or 48px (`12`) spacing tokens to create structural boundaries.

### Glass & Gradient Implementation
To achieve the "Digital Curator" look, floating elements (Modals, Hover Menus) must use a **Glassmorphism** effect.
- **Background:** `surface_container_lowest` at 85% opacity.
- **Blur:** 12px-20px backdrop filter.
- **CTA Signature:** Primary buttons should use a subtle linear gradient from `primary` to `primary_container` (at a 135° angle) to provide a "jewel" effect that feels custom-engineered.

---

## 3. Typography
We utilize **Inter** not as a utility font, but as an editorial voice.

- **Display & Headlines:** Use `display-sm` (2.25rem) for main dashboard welcomes. The tight tracking and heavy weight convey a sense of curated importance.
- **The Information Layer:** For bookmark lists, use `body-md` (0.875rem) for titles and `label-sm` (0.6875rem) for URLs.
- **Hierarchy through Contrast:** Pair `title-lg` headers in `on_surface` with `label-md` metadata in `on_surface_variant`. This creates a sophisticated, "magazine-style" legibility even in high-density lists.

---

## 4. Elevation & Depth
Depth in this system is organic, not structural.

### The Layering Principle
Rather than shadows, stack surfaces:
1. **Base:** `surface` (The floor)
2. **Layout Sections:** `surface-container-low` (The recessed workspace)
3. **Active Elements:** `surface-container-lowest` (The "lifted" card)

### Ambient Shadows
When a shadow is required (e.g., a floating search bar), it must be an **Ambient Shadow**:
- **Color:** `on_surface` (at 6% opacity).
- **Properties:** 0px offset, 40px blur. This creates a soft glow rather than a hard drop, mimicking natural light.

### The "Ghost Border"
If a container needs definition against an identical background, use a **Ghost Border**: `outline-variant` at 15% opacity. It should be felt, not seen.

---

## 5. Components

### Primary Actions (Buttons)
- **Style:** `md` (0.75rem) rounded corners.
- **Visuals:** High-saturation `secondary` or `tertiary_fixed` backgrounds.
- **Interaction:** A subtle `0.5rem` lift on hover using an Ambient Shadow.

### Bookmark Cards
- **Forbid Dividers:** Do not use lines between list items. Use 12px (`3`) of vertical padding and a background shift to `surface-container-high` on hover.
- **Metadata Chips:** Use `full` (pill) roundedness. Backgrounds should be `surface-variant` with `on_surface_variant` text for a muted, professional look.

### The AI Recommendation Rail
- **Style:** A vertical container using `tertiary_container` with a glassmorphism blur. 
- **Signature:** A 2px left-accent border using the vibrant `tertiary_fixed_dim` color to denote AI-generated insights.

### Inputs & Search
- **State:** Unfocused inputs should have no border, only a `surface-container-highest` background. 
- **Focus:** Transition to a `secondary` Ghost Border with a 4% `secondary` tint glow.

---

## 6. Do’s and Don’ts

### Do:
- **Embrace Asymmetry:** Allow metadata to right-align or sit in offset columns to break the "spreadsheet" feel of bookmarking.
- **Use Status Tones with Care:** Use `error` (soft red) for "Dead Links" only as a small dot or label, never a full background.
- **Prioritize Breathing Room:** When in doubt, increase the spacing token by one level. High-end design thrives on "wasteful" space.

### Don’t:
- **Don’t use "Pure" Blacks:** Always use `on_surface` or `primary_fixed_dim` to keep the palette feeling "ink-based" and premium.
- **Don’t use 100% Opaque Modals:** A modal should never fully disconnect the user from their context. Use the Glassmorphism rule to maintain a sense of place.
- **Don’t use Standard System Icons:** Ensure all icons are thin-line (1px or 1.5px stroke) to match the Inter typography weight.