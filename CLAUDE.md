# TalkType Extension Guidelines for Claude

## Development Environment
- **Load Extension**: Open Chrome extensions page (chrome://extensions/), enable Developer mode, click "Load unpacked" and select the `src` folder
- **Testing**: Manually test in browser by installing the unpacked extension
- **Build**: Zip the `src` directory contents for distribution (update version in manifest.json first)

## Code Style Guidelines
- **Naming**: Use camelCase for variables/functions, PascalCase for classes
- **DOM Manipulation**: Keep z-index values between 1-10 for better page integration
- **CSS**: Use glass morphism design with CSS variables for theming
- **Animations**: Prefer CSS transitions over JavaScript animations for smoother performance
- **Error Handling**: Add feedback mechanisms when operations fail with specific messages
- **Architecture**: Use message passing between extension components
- **Input Detection**: Use targeted CSS selectors rather than generic querySelector
- **Theme Support**: Use window.matchMedia for dark mode detection
- **Documentation**: Add comments for complex logic and component connections

## UI/UX Standards
- **Glass Morphism**: Use backdrop-filter: blur(12px) with rgba backgrounds
- **Color Scheme**: Use purple/pink/tangerine gradients for branded elements
- **Primary Gradient**: linear-gradient(135deg, rgba(111, 66, 193, 0.85), rgba(70, 174, 247, 0.75))
- **Progress Gradient**: linear-gradient(135deg, rgba(111, 66, 193, 0.9), rgba(247, 70, 180, 0.8), rgba(255, 152, 0, 0.85))
- **Notifications**: Position in top-right with gentle purple/blue gradient backgrounds
- **Animations**: Use subtle transitions including gradientBg, float, and pulse effects
- **Status Indicators**: Include animated pulse dots with appropriate status colors
- **Button Styling**: Apply subtle shine/glow effects on hover with scale transforms

## Best Practices
- Test across multiple sites (especially Gmail, Facebook, Reddit) before each release
- Keep status messages concise (≤2 words) for consistent UI
- Verify extension functions properly in both light and dark modes
- Apply subtle shadows and borders to improve element definition
- Use MutationObserver for detecting dynamic DOM changes
- Include delicate particle backgrounds for depth (subtle-drift animation)
- Ensure all interactive elements have appropriate hover/active states
- Add subtle inner shadows for inset elements to enhance the glass effect