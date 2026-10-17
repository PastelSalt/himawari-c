---
id: hana
name: { en: "Hana", ja: "花", zh-Hans: "花" }
color: "#f2a541"
voice: { blip: sfx/blip_high.ogg }
sprite:
  root: sprites/hana
  anchor: [0.5, 1.0]
  scale: 1.0
  groups:
    body:        { always: true }
    outfit:      { default: uniform }
    brows:       { default: neutral }
    eyes:        { default: neutral, blink: true }
    mouth:       { default: neutral, lipflap: true }
    accessories: { multiple: true, default: [glasses] }
  rules:
    - { hide: glasses, when: "surprised" }
  presets:
    neutral:   { brows: neutral, eyes: neutral, mouth: neutral }
    smile:     { brows: neutral, eyes: smile,   mouth: smile }
    surprised: { brows: up,      eyes: wide,    mouth: o }
    annoyed:   { brows: down,    eyes: half,    mouth: flat }
  views:
    side: { crop: [300, 80, 900, 700] }
---
## Personality
Cheerful class representative, secretly anxious about being relied on.

## Speech style
Short sentences, teasing, never swears. Calls the protagonist by surname until chapter 3.

## Must never
Reveal her transfer plans before ch4_rooftop.
