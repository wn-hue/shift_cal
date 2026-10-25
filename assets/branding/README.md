# 교대 루틴 app icon

Updated 2026-10-26 from the calendar, routine arrows and check mark supplied by the user. Edited with the built-in image_gen tool, then exported with macOS sips to the required PNG sizes.

Design: blue calendar, two continuous clockwise semicircular arrows in blue and golden yellow, blue check, soft matte depth, full-bleed pale gray background. No inset tile or white outer frame. All PNGs are opaque squares; the OS supplies its own mask.

Master: `shift-routine-icon-1024.png`. Web: 512px / 192px, Apple touch: 180px. Both native Xcode icon catalogs use the 1024px master. Existing installed iOS apps need a new build to display the changed icon.

Prompt: Preserve the supplied calendar outline, two binding tabs, circular routine arrows and check; simplify for small sizes; replace rainbow purple with royal blue #3182F6 and golden yellow #FFCA45; subtle matte dimensional finish, straight-on square, pale gray full-bleed background, no text, no frame. Refinement: exactly two continuous clockwise semicircular arrows, blue ending rightward at 12 o’clock and gold ending leftward at 6 o’clock, with small gaps at those endpoints.

The earlier folded sun/moon artwork remains recoverable in Git history before this change.
