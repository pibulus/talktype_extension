# TalkType Extension Guidelines for Claude

## Development Environment
- **Load Extension**: Open Chrome extensions page (chrome://extensions/), enable Developer mode, click "Load unpacked" and select the `src` folder
- **Testing**: Manually test in browser by installing the unpacked extension
- **Build**: Zip the `src` directory contents for distribution (update version in manifest.json first)

## Code Style Guidelines
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **DOM Manipulation**: Keep z-index values between 1-10 for better page integration
- **CSS**: Warm cream/ink palette via CSS variables (see UI/UX Standards below)
- **Animations**: Prefer CSS transitions over JavaScript animations for smoother performance
- **Error Handling**: Add feedback mechanisms when operations fail with specific messages
- **Architecture**: Use message passing between extension components
- **Input Detection**: Use targeted CSS selectors rather than generic querySelector
- **Theme Support**: Use window.matchMedia for dark mode detection
- **Documentation**: Add comments for complex logic and component connections

## UI/UX Standards
- **One palette, three surfaces**: the extension, talktype.app and the TalkType Mac app
  share ONE palette, sourced from `talktype/src/app.css` — never eyeballed.
- **Paper**: `#fff6e6`, as a radial `#fff8ed 0% → #fff6e6 52% → #fff3df 82% → #ffefda 100%`
- **Ink**: `#1e1714` (warm near-black), secondary `#463f3a`
- **Dark mode**: warm near-black `#1e1714` surfaces with cream ink — never cold blue-black
- **NEVER `#fff` or `#000`** anywhere, on any surface or any ink. Cream and warm ink always.
- **Brand duo**: pink `#ff82ca` → tangerine `#ffb060`
- **Ghost gradient** (from `talktype/src/lib/components/ghost/gradients.js`):
  `#ff60e0 → #ff82ca → #ff9a85 → #ffb060 → #ffcf40`
- **The ghost** is a gradient-filled body with ink linework and eyes — two layers,
  never outline-only.
- **Semantic status colours** (red / green / amber) are meaning, not brand. Leave them.
- **Notifications**: Position in top-right on warm cream with a soft pink→tangerine accent
- **Animations**: Use subtle transitions including gradientBg, float, and pulse effects
- **Status Indicators**: Include animated pulse dots with appropriate status colors
- **Button Styling**: Apply subtle shine/glow effects on hover with scale transforms

## Copy & Tone Guidelines
- **Reference Document**: See [Tone and Style Guide](/docs/TONE_AND_STYLE_GUIDE.md) for comprehensive guidelines
- **Core Tone**: Confident but not cocky, smart but never smug, friendly but not patronizing
- **Philosophy**: "Chonk & Charm" - bold and simple exterior with rich, soulful depth
- **Typography**: Large, bold headings with generous spacing; monospace for transcriptions
- **Personality**: Breezy, clever, whimsical but professional
- **Copywriting**: Short, direct phrases with personality; avoid corporate jargon
- **Voice**: Write as if you're a helpful friend giving advice, not a corporate entity
- **Tagline**: "You click the ghost, we do the most."

## Best Practices
- Test across multiple sites (especially Gmail, Facebook, Reddit) before each release
- Keep status messages concise (≤2 words) for consistent UI
- Verify extension functions properly in both light and dark modes
- Apply subtle shadows and borders to improve element definition
- Use MutationObserver for detecting dynamic DOM changes
- Include delicate particle backgrounds for depth (subtle-drift animation)
- Ensure all interactive elements have appropriate hover/active states
- Add subtle inner shadows for inset elements to enhance the glass effect
- Follow the Soft Stack philosophy for all UI and copy decisions