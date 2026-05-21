# Exercise Modularization Plan

## Why Modularize?

`viewer.js` currently has all 22 exercise types in one `Exercises` object (~280 lines).
As the system grows, this becomes a maintenance bottleneck. Each exercise needs:
- Render function (HTML template)
- Interaction logic (click, drag, check)
- State management (correct/wrong counts)
- Potential async loading

## Target Architecture

```
public/exercises/
├── registry.js         ← Exercise registry + lazy loader
├── base.js             ← Shared utilities (exBox, feedback, etc.)
├── mcq.js              ← A: Multiple Choice
├── true-false.js       ← B: True / False
├── fill-blanks.js      ← C: Fill in the Blanks
├── drag-words.js       ← D: Drag & Classify
├── matching.js         ← E: Matching (auto-generated)
├── word-order.js       ← F: Word Order
├── correct-error.js    ← G: Correct the Error
├── rewrite.js          ← H: Rewrite
├── guided-writing.js   ← I: Guided Writing
├── listening.js        ← J: Listening
├── speed-challenge.js  ← K: Speed Challenge
├── multi-step.js       ← L: Multi-Step Thinking
├── paragraph.js        ← M: Complete the Paragraph
├── context-analysis.js ← N: Context Analysis
├── scenario.js         ← O: Scenario
├── visual-choice.js    ← P: Visual Choice
├── sentence-transform.js ← Q: Sentence Transformation
├── challenge.js        ← R: Challenge
├── select-words.js     ← S: Select Words
├── dialogue-fill.js    ← T: Dialogue Fill
└── pattern-fill.js     ← U: Pattern Fill
```

## Module Interface

Every exercise module exports a uniform interface:

```js
// example: mcq.js
export const TYPE = 'mcq';        // unique identifier
export const LABEL = 'Multiple Choice';
export const ORDER = 1;            // display order

export function render(data) {
  // Returns HTML string
  // data = exercises.mcq
}

export function init(container) {
  // Binds event listeners (if needed)
  // Called after render inserts HTML into DOM
}

export function getScore() {
  // Returns { correct: N, wrong: N } or null if not scored
}
```

## Registry

```js
// registry.js
const registry = new Map();

export function register(mod) {
  registry.set(mod.TYPE, mod);
}

export function get(type) { return registry.get(type); }
export function getAll() { return [...registry.values()].sort((a, b) => a.ORDER - b.ORDER); }

// Lazy loader
export async function loadType(type) {
  if (registry.has(type)) return registry.get(type);
  const mod = await import(`./${type}.js`);
  register(mod);
  return mod;
}
```

## Loading Strategy

### Phase 1 (Current): Synchronous, all-in-viewer.js
- All 22 exercises in one file
- No lazy loading
- Simple but not scalable

### Phase 2 (Next): Lazy loading by section visibility
- Exercises render only when the "Exercises" section enters viewport
- Use `IntersectionObserver` on `#exercises` section
- Improves initial page load time

### Phase 3 (Future): Module-per-file with dynamic import
```js
// In viewer.js:
async function renderExercises(data, vocab) {
  const types = getAllTypes();
  let html = '';
  for (const type of types) {
    const mod = await loadType(type);
    html += mod.render(data[type]);
  }
  container.innerHTML = html;
  // Initialize after all render
  for (const type of types) {
    const mod = await loadType(type);
    if (mod.init) mod.init(container);
  }
}
```

## Migration Path

| Step | What | When |
|------|------|------|
| 1 | Create `registry.js` + `base.js` | Now (skeleton) |
| 2 | Extract 3 simplest exercises (MCQ, TF, Fill) | Phase 2 |
| 3 | Add IntersectionObserver for lazy render | Phase 2 |
| 4 | Extract remaining 19 exercises | Phase 3 |
| 5 | Add dynamic import + code splitting | Phase 3 (needs build step) |

## Preventing Monolith in viewer.js

Rules for `viewer.js` going forward:
1. `Exercises` object: only render dispatching + score
2. No individual exercise logic in viewer.js after migration
3. New exercise types = new file, not new code in viewer.js
4. Exercise files never import from viewer.js (one-way dependency)

## Current Monolith Analysis

In `viewer.js` v1, the `Exercises` object contains:

```
Method                     Lines   Type
─────────────────────────────────────────
render(ex, vocab)            8    dispatcher
renderMCQ                    6    template
mcq()                        2    interaction
renderTF                     6    template
tf()                         5    interaction
renderFill                   4    template
checkFill()                 10    interaction
renderDrag                   6    template
renderMatching               6    template
match()                     14    interaction
renderOrder                  4    template
renderCorrectError           3    template
renderRewrite                3    template
renderGuidedWriting          2    template
renderListening              4    template
renderSpeed                  3    template
renderMultiStep              8    template
renderParagraph              4    template + interaction mix
renderContext                4    template
renderScenario               5    template
renderVisual                 3    template
renderSentenceTransform      2    template
renderChallenge              4    template + interaction mix
renderSelectWords            2    template
tapSelect()                  3    interaction
renderDialogueFill           5    template
renderPatternFill            4    template
renderSpeaking              14    template
calcScore()                 15    pure function
resetDialogue()              2    interaction
revealNext()                 3    interaction
startSpeed()                17    interaction + timer
showSpeedQ()                10    interaction
checkOrder()                 6    interaction
─────────────────────────────────────────
Total: ~185 lines rendering + ~95 lines interaction
```

This is manageable now but will grow. The modularization plan keeps it clean as the system scales.
