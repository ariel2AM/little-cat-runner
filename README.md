# Little Cat 🐾

**A mini game made for vibe coding practice.** Built iteratively with AI assistance to explore game mechanics, pixel animation, and simple browser development. This is a learning project, not an official Google game.

An endless runner inspired by [Chrome’s Dinosaur Game](https://en.wikipedia.org/wiki/Dinosaur_Game), featuring a monochrome pixel cat, rocks, and birds. Written in plain HTML, CSS, and JavaScript with no dependencies or build step.

## Play locally

Download and extract the project, then open `index.html` in Chrome. Keep `game.js` and `style.css` alongside it. No installation or server is needed.

- **Space / ↑:** jump. Tap for a short hop; hold for a higher jump.
- **↓:** duck or fall faster.
- **P:** pause/resume.
- After game over, enter a name and save your score, or choose **Play again**.

Only one jump is allowed before landing. The cat has short legs, pointed ears, and a fluffy tail that responds to actions. The game includes increasing speed, day/night transitions, optional synthesized sounds, and local player records.

Repeated names share one leaderboard row; each saved run is retained and the highest score wins. Names and scores stay in your browser, not on a server. Moving from local play to the hosted site creates a separate set of records. Clearing browser data removes saved scores.

## Host on GitHub Pages

1. Push these files to the repository root.
2. Open **Settings → Pages**.
3. Select **Deploy from a branch**, choose the branch containing the game, and select **/(root)**.
4. Save and wait for GitHub to publish the site.

The `.nojekyll` file allows direct static hosting. All asset paths are relative, so the game works under a repository URL without a build step.

[GitHub Pages setup documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Files

- `index.html` — game page and score form
- `style.css` — responsive layout
- `game.js` — gameplay, pixel sprites, sound, and saved records
- `.nojekyll` — static GitHub Pages marker

## Testing

JavaScript logic checks have covered movement, collisions, score saving, duplicate-name handling, and storage/audio fallbacks. The local page loaded in Chrome. Full visual, sound, and responsive browser testing remains incomplete; the latest sprite refinements have not had a full browser regression pass.

For a manual check, play through jumping, ducking, collision, saving a named score, replaying, and reloading. Confirm a lower score does not replace a personal best. Check sound, night mode, and a narrow window.
