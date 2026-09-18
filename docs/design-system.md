# The design system: IBM Carbon, themed

The console is built from `@carbon/react`. This document covers the three
decisions that make Carbon coexist with the Tailwind layer underneath it, and
what to do when you add a component.

---

## 1. What Carbon owns

| Area | Carbon components |
|---|---|
| Shell | `Header`, `HeaderName`, `HeaderMenuButton`, `HeaderGlobalBar`, `HeaderGlobalAction`, `SideNav`, `SideNavItems`, `SideNavLink`, `SideNavDivider` |
| Actions | `Button` (primary / tertiary / ghost / danger), `ContentSwitcher` + `Switch` |
| Data | `Table`, `TableHead`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `Tile` |
| Status | `Tag`, `InlineNotification`, `ToastNotification` |
| Input | `TextInput`, `PasswordInput`, `Select` + `SelectItem`, `Search`, `Checkbox`, `Form`, `Stack`, `FileUploaderDropContainer` |
| Feedback | `Loading`, `InlineLoading`, `SkeletonText`, `SkeletonPlaceholder`, `Modal` |
| Navigation | `Breadcrumb`, `BreadcrumbItem` |
| Icons | `@carbon/icons-react` (there is no other icon library) |
| Type | IBM Plex Sans / Mono, loaded once through `next/font` |

Tailwind is still here, doing layout: grid, flex, spacing and the few
control-room affordances Carbon has no equivalent for — the severity rail on a
KPI tile, the fill bar under a figure, the floating copilot panel.

---

## 2. Three things that make it work

### No global emissions

`@carbon/styles/css/styles.css` is 1.1 MB and ships an Eric-Meyer-style reset
plus rules on `html`, `body`, `h1`–`h6`, `p`, `a`, `ul`, `code`, `table` and
`*`. Loading it restyles the entire application, not just the Carbon components
in it. `styles/carbon.scss` therefore configures:

```scss
@use '@carbon/styles/scss/config' with (
  $css--reset: false,          // would fight Tailwind's preflight
  $css--body: false,           // globals.css already owns body
  $css--font-face: false,      // next/font already loads IBM Plex
  $css--default-type: false    // Carbon's type lands on bare elements
);
```

The result is 404 KB in which **zero selectors escape the `.cds--` namespace**
(the only exception is one Firefox `input:-moz-ui-invalid` rule from the form
partial, which suppresses a native shadow). Carbon owns its components; the
existing layer keeps owning the page.

Component partials are imported one at a time. Adding a Carbon component to a
page means adding its `@use` line — deliberate, because most of that 1.1 MB is
for components this console has no use for.

`@carbon/styles/scss/layout`, `spacing` and `motion` are **not** optional:
components size themselves from `--cds-layout-*` custom properties. Without
them every button and field renders at its content height, which is the kind of
bug that looks like a layout mistake for an hour.

### A custom theme, which is Carbon's own API for this

Every Carbon component reads `--cds-*` custom properties, so the theme map in
`styles/carbon.scss` points them at this console's measured palette. Carbon
components arrive in control-room colours instead of IBM blue, and the contrast
ratios stated in `globals.css` still hold — they are the same colours reached
through a different API. The severity ramp stays the only saturated colour on
screen, and Carbon's tag palette is remapped so a tag in this app can only ever
be achromatic or one of the four severity colours.

### Component tokens are not theme tokens

This is the one genuinely non-obvious part.

`button-primary`, every `tag-*` and every `notification-*` token live in a
separate **component**-token set. Putting `button-primary` in the theme map
looks correct and does nothing — the button stays `#0f62fe`.

They are also not simply the second argument to `theme()`. That mixin emits the
groups you pass it and *then* re-emits every component token each partial
registered through `add-component-tokens`, so Carbon's defaults land after
yours in the same `:root` block and win. Hence:

```scss
:root { @include theme.theme($grid-console); }

:root {
  @each $token, $value in $grid-console-components {
    --cds-#{$token}: #{$value};
  }
}
```

The second block is emitted last and is the only one that takes effect.

---

## 3. The build step

Carbon's SCSS is compiled by `npm run carbon:css`, not by Next:

```bash
sass --load-path=node_modules --no-source-map --no-charset \
     --style=compressed styles/carbon.scss app/carbon.generated.css
```

Turbopack's Sass pipeline resolves Carbon's internal bare `@use
'@carbon/styles/...'` forwards against the importing file rather than the
package root, so even `@use '@carbon/styles/scss/components/button'` fails
inside `@carbon/styles`. `--load-path=node_modules` resolves them correctly.
`--no-charset` matters too: Dart Sass otherwise writes a UTF-8 BOM that
Turbopack's CSS parser rejects on the first `@keyframes`.

`prebuild` and `predev` run the compile, so editing `styles/carbon.scss` and
running either command is enough. The generated CSS is committed so a clean
checkout can `next start` without a build step.

---

## 4. Adding a component

1. Import it from `@carbon/react` in the page or component.
2. Add its partial to `styles/carbon.scss` if it is not already there.
3. `npm run carbon:css`.

If it needs a colour Carbon does not have, add the token to `$grid-console`
(theme) or `$grid-console-components` (button / tag / notification / content
switcher / status) — not a hardcoded hex in a `className`.

---

## 5. What is deliberately not Carbon

* **The landing page's call-to-action buttons** carry `.cds--btn` classes on
  real `<Link>` elements. That page is a server component on purpose — it is
  the one page a cold visitor or a crawler sees — so it cannot mount Carbon's
  client components. The classes are the same CSS those components emit, with
  no JavaScript.
* **The three header menus** (export, alerts, operator) are hand-rolled
  poppers. Carbon's `HeaderPanel` is a full-height right-hand slab, which is
  the wrong shape for a five-item list and puts the alert list a long way from
  the bell that opened it. Their triggers are Carbon `HeaderGlobalAction`s and
  their contents are Carbon, so the shell's focus behaviour is Carbon's.
* **The side nav's collapse** is explicit and persisted rather than Carbon's
  hover-to-expand rail. The rail width is a CSS variable the breadcrumb, main
  column and metrics drawer all read; a width that changed when the pointer
  passed over it would shift the page under the operator's cursor.
* **The metrics drawer** is a bottom dock, not a `Modal`. These are reference
  figures an operator wants beside the page they are reading, not instead of
  it.
* **The copilot's markdown renderer** handles bold, code, headings, bullets,
  rules and callouts in ~40 lines rather than pulling in a markdown library. It
  never injects HTML, so a model-authored string cannot become markup.
