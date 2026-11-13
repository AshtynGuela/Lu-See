# Lu-See
<!-- impeccable:product-schema 1 -->
## Platform
web
## Stack
React, TypeScript, Vite, Three.js/react-three-fiber, Zustand from the user's specification; Node API proxy; NASA/JPL scientific data and a reproducible Python preparation pipeline. Current compatible versions selected during implementation.
## Users
Initial testing by the owner on i5-12450H, 16 GB RAM, RTX 4050. The challenge audience includes mission planners, educators and the public.
## Product Purpose
Compare lunar locations and landing dates quickly using actual Sun/Earth geometry, terrain horizons and operational windows. A Sun-centred Solar System overview leads through Earth–Moon exploration into detailed lunar analysis. The other planets provide exploration context without additional mission-analysis features.
## Operating Context
The original challenge and PROJECT_BRIEF.md govern scope. Site, date and mission duration define a scenario. UTC, traceable results, accessible map menus and comparison are central. Reuse the existing Rocky mascot and NASA Earth asset; keep the desktop overlay separate.
## Capabilities and Constraints
No fabricated scientific values. Curated sites need real terrain horizons. Custom sites may explicitly use a smooth horizon without terrain viability. Nemotron primary via OpenRouter, GPT-OSS-20B fallback via Groq only for image-independent requests. Visual requests stay pending for retry on primary failure. No keys in browser code. Mission duration is requested per scenario. Default clock is current UTC. Apollo-era dates through 2040 are required.
## Brand Commitments
Lu-See; Terra Invicta-inspired freedom and strategic analysis, cinematic welcome. Rocky is curious and concise. Solar System overview first with a visible Sun and sampled planetary paths, then Earth–Moon and lunar focus; readable/physical scale modes, shuttle cinematic and surface/horizon choice. Other planets are exploration context only. This opening supersedes the earlier Earth–Moon-first decision at the user's request on 13 November 2026.
## Evidence on Hand
Original technical specification, agreed PROJECT_BRIEF.md, parent Rocky and SolarSystem GLB files. Original NASA challenge URL is retained in the app. API results and actual terrain products must supply every scientific result.
## Product Principles
The map is the product. Compare dates and sites. Deterministic numbers, conversational explanations. Show provenance and assumptions. Do not hide missing data behind polished visuals.
## Accessibility & Inclusion
Keyboard alternatives to context menus; visible focus; labelled controls; patterns and words in addition to status colours; reduced-motion support; readable Rocky responses.
