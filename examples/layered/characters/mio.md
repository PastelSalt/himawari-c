---
id: mio
name: "Mio"
color: "#e6467a"
sprite:
  root: sprites/mio
  anchor: [0.5, 1.0]
  groups:
    body:        { always: true }
    outfit:      { default: uniform }
    eyes:        { default: neutral, blink: true }
    mouth:       { default: neutral, lipflap: true }
    accessories: { multiple: true, default: [ribbon] }
  rules:
    - { hide: ribbon, when: "casual" }
  presets:
    neutral: { eyes: neutral, mouth: neutral }
    happy:   { eyes: smile, mouth: smile }
---
## Personality
A procedural test character: simple shapes, drawn by make-art.mjs, so the
layered sprite system can be seen working before any real art exists.
