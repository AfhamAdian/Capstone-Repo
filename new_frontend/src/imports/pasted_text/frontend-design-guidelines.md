---
name: frontend-design-custom
description: Create distinctive, production-grade frontend interfaces with high design quality. Extends Claude's built-in frontend-design skill with explicit anti-pattern rules and a component-sourcing directive from 21st.dev or user-provided references.
---

This skill guides creation of distinctive, production-grade frontend interfaces that avoid generic "AI slop" aesthetics. It extends Claude's core frontend-design skill with additional rules around component sourcing and banned UI patterns.

Implement real working code with exceptional attention to aesthetic details and creative choices.

--

## Hard Anti-Patterns (NEVER DO)

These are explicitly banned UI patterns. Violating any of these is a design failure:

### ❌ Pill Badges / Status Pills
Do **not** create small rounded pill-shaped tags or badges used to display status, version numbers, labels, or categories. Examples of what to avoid:
- `v2.0 Now Available` inside a rounded pill
- Status indicators like `● Active`, `✓ Done`, `🔴 Offline` as floating pills
- Tag clouds made of rounded badge chips
- Notification dots inside rounded label containers

Instead, communicate status through typography weight, color, inline text, or contextual placement — not pill shapes.

### ❌ Heavy Emoji Cards
Do **not** create cards that lead with a large emoji as the primary visual element. Examples of what to avoid:
- Cards with a giant 🚀 or 💡 as a header icon
- Feature grids where each card has an emoji + title + description layout
- Pricing or comparison cards using emoji as bullets or icons

Instead, use real iconography (SVG icons, Lucide, Heroicons), typographic hierarchy, color blocks, or illustration fragments. If icons are needed, use clean vector icons — not emoji.

### ❌ Fake Shine / Gloss / Shimmer Effects
Do **not** add decorative shine, gloss, or shimmer effects that serve no functional purpose. These are the clearest signal of AI-generated slop. Examples of what to avoid:
- Diagonal light streak or "glare" overlays on cards, buttons, or hero sections (`linear-gradient` white slash swept across a surface)
- Animated shimmer sweeps on static content that isn't loading (fake skeleton-style glow on finished UI)
- Over-polished glass morphism with excessive `backdrop-filter` blur, white stroke, and inner white glow combined
- Buttons or cards with a bright highlight band along the top edge meant to simulate a light source
- Iridescent or rainbow gradient borders that shift on hover for no contextual reason
- Glowing neon halos around text or icons purely for decoration

Shine and gloss are not depth. If the design needs atmosphere, achieve it through considered use of shadow, contrast, texture, or negative space — not synthetic light effects.

---

## Design Thinking

Before coding, understand the context and commit to a **bold aesthetic direction**:

- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick a clear extreme — brutally minimal, maximalist, retro-futuristic, organic, luxury, editorial, brutalist, art deco, industrial, etc.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this memorable? What is the one thing a user will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is intentionality, not intensity.

---

## Frontend Aesthetics Guidelines

### Typography
Choose fonts that are beautiful, unique, and characterful. Avoid generic defaults (Arial, Inter, Roboto, system-ui). Pair a distinctive display font with a refined body font. Typography is the first signal of quality.

### Color & Theme
Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Avoid the purple-gradient-on-white cliché.

### Motion
Use animations for effects and micro-interactions. Prefer CSS-only for HTML. Use the Motion library for React. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. Surprise with hover states and scroll-triggered transitions.

### Spatial Composition
Use unexpected layouts — asymmetry, overlap, diagonal flow, grid-breaking elements, generous negative space, or controlled density. Never default to symmetric 3-column grids unless they serve the vision.

### Backgrounds & Visual Details
Create atmosphere and depth. Use gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, decorative borders, grain overlays, or custom cursor effects. Avoid flat solid-color backgrounds unless the aesthetic demands it.

---

## NEVER Use

- Overused font families: Inter, Roboto, Arial, Space Grotesk, system fonts
- Clichéd color schemes (especially purple gradients on white)
- Predictable layouts and cookie-cutter component patterns
- Pill badges / status chips (see Hard Anti-Patterns above)
- Emoji-led cards or emoji as icon replacements (see Hard Anti-Patterns above)
- Fake shine, gloss, shimmer, or neon glow effects (see Hard Anti-Patterns above)
- Any design that could have been generated by the average AI tool

---

## Implementation Standards

Then implement working code (HTML/CSS/JS, React, Vue, etc.) that is:
- Production-grade and functional
- Visually striking and memorable
- Cohesive with a clear aesthetic point-of-view
- Meticulously refined in every detail — spacing, shadows, transitions, and edge cases

**Match complexity to vision.** Maximalist designs need elaborate code with extensive animations and effects. Minimalist designs need restraint, precision, and careful attention to spacing and typography. Elegance comes from executing the vision well, not from adding more.

---

> Claude is capable of extraordinary creative work. Don't hold back. Show what can truly be created when thinking outside the box and committing fully to a distinctive vision.

You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.

Determine the default path for components and styles. 
If default path for components is not /components/ui, provide instructions on why it's important to create this folder
Copy-paste this component to /components/ui folder:

As Component  Use these if needed and relevent :

You are given a task to integrate an existing React component in the codebase

The codebase should support:
- shadcn project structure  
- Tailwind CSS
- Typescript

If it doesn't, provide instructions on how to setup project via shadcn CLI, install Tailwind or Typescript.