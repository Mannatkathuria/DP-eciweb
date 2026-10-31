# UI control inventory from supplied HTML

This file reports controls found in the exact two user-supplied HTML snapshots. It does not claim to enumerate every live-rendered control after JavaScript interaction.

## ECI homepage snapshot

### Counts

- 207 `<a>` elements.
- 42 `<button>` elements.
- 0 `<form>` elements.
- 1 checkbox input (light/dark mode).

### Button groups extracted

| Group | Controls |
|---|---|
| Global header | `Menu`; unlabeled menu / navigation toggle |
| Hero carousel | `Slide 1` through `Slide 14` controls |
| Commission / profile carousel | `Slide 1`, `Slide 2`, `Slide 3` |
| Homepage news tabs | `Current Issues`, `Press Releases`, `Instructions`, `Tender & Vacancies`, `Election Stories`, `FAQs`, `Court Orders` |
| Main navigation | `Close main navigation panel` |
| Accessibility | `Bigger Text`, `Smaller Text`, `Text Spacing`, `Line Height`, `Dyslexia Friendly`, `Saturation`, `Light-Dark`, `Invert Colors`, `Highlight Links`, `Text To Speech`, `Cursor`, `Hide Images`, `Reset All Settings`, `Accessibility Tools`, `Open the accessibility tools` |

### Other control details

- The accessibility control buttons have visible IDs such as `btn-s9`, `btn-s17`, `btn-s13`, `btn-s12`, `btn-df`, `btn-saturate`, `dark-btn`, `btn-invert`, `btn-s10`, `speak`, `btn-cursor`, `btn-s11`, `reset-all`, `uw-widget-custom-trigger`, `open-the-accessibility-menu`.
- A checkbox with ID `checkbox` is described as toggling light/dark mode.
- All carousel and tab controls need actual click testing to identify slide / panel transition behavior.

## Citizen Service Portal snapshot

### Counts

- 17 `<a>` elements.
- 27 `<button>` elements.
- 0 `<form>` elements.
- 1 `<select>` element (`name="translang"`, accessible label `Select Language`).

### Login / signup and SIR

| Visible label | aria-label / observed intent |
|---|---|
| Login | Navigate to Login page |
| Sign-Up | Navigate to Sign Up page |
| Search Your Name in Last SIR | No aria-label captured |
| Submit Document Against Notice issued | No aria-label captured |

### Form 6 card

| Visible label | aria-label |
|---|---|
| Fill Form 6 | Navigate to Form 6 |
| Fill Declaration Form | Fill Declaration Form for Form 6 |
| Download | Download statutory Form 6 |
| Guidelines | Read Guidelines for filling Form 6 |
| Download Declaration Form for Pre-Draft Forms | Same |

### Form 6A card

| Visible label | aria-label |
|---|---|
| Fill Form 6A | Navigate to Form 6A |
| Download | Download statutory Form 6A |
| Guidelines | Read Guidelines for filling Form 6A |

### Form 7 card

| Visible label | aria-label |
|---|---|
| Fill Form 7 | Navigate to Form 7 |
| Fill Form 7 Overseas | Navigate to Form 7 Overseas |
| Download | Download statutory Form 7 |
| Guidelines | Read Guidelines for filling Form 7 |

### Form 8 card

| Visible label | aria-label |
|---|---|
| Fill Form 8 | Navigate to Form 8 |
| Fill Form 8 Overseas (Self Correction Only) | Navigate to Form 8 Overseas |
| Download | Download statutory Form 8 |
| Guidelines | Read Guidelines for filling Form 8 |
| Fill Declaration Form | Fill Declaration Form for Form 8 |
| Download Declaration Form for Pre-Draft Forms | Same |

### Additional statutory forms and election results

| Visible label | aria-label / intent |
|---|---|
| Download | Download statutory Form M |
| Download | Download statutory Form 12C |
| View Information | View current, future and past election / candidate information |
| View Results | View current or past election results |
| View Report | View current or past statistical reports |

## Missing button outcomes

Buttons above are visible, but the HTML contains no inline `onclick` handler and no `form` `action`. The destination / state change is likely implemented in the downloaded JS bundle. For an exact button-by-button map, use a browser session and record each click with:

`button label → source page → click action → destination route / modal → network requests → resulting state → role / preconditions`.
