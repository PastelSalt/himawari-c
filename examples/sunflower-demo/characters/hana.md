---
id: hana
name: { en: "Hana", ja: "花", es: "Hana" }
color: "#e8a020"
sprite:
  root: sprites/hana
  anchor: [0.5, 1.0]
  groups:
    body:   { always: true }
    outfit: { default: summer }
    eyes:   { default: neutral, blink: true }
    mouth:  { default: neutral, lipflap: true }
    hair:   { multiple: true, default: [sunflower_pin] }
  rules:
    - { show: ribbon, when: "yukata" }
  presets:
    neutral:   { eyes: neutral, mouth: neutral }
    happy:     { eyes: smile, mouth: smile }
    surprised: { eyes: wide, mouth: o }
---
## Personality
Cheerful and a little too organized. Plans the class's festival lanterns weeks ahead and still forgets the glue.

## Speech style
Short, warm sentences. Teases the player gently.
