---
id: ren
name: { en: "Ren", ja: "蓮", es: "Ren" }
color: "#5a9ad0"
sprite:
  root: sprites/ren
  anchor: [0.5, 1.0]
  groups:
    body:   { always: true }
    outfit: { default: uniform }
    eyes:   { default: neutral, blink: true }
    mouth:  { default: neutral, lipflap: true }
    hair:   { multiple: true }
  presets:
    neutral: { eyes: neutral, mouth: neutral }
    happy:   { eyes: smile, mouth: smile }
---
## Personality
Dry humor, quietly reliable. Always carries a spare of everything.

## Speech style
Deadpan. Says "obviously" when it isn't obvious.
