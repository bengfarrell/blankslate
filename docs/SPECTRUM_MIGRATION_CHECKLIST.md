# Spectrum Web Components Migration Checklist

This document provides a comprehensive checklist to ensure complete migration from custom UI elements to Adobe Spectrum Web Components. Use this to avoid missing patterns during migration.

## Pre-Migration Audit

### 1. Inventory All UI Patterns

Run a comprehensive search for all UI elements that need migration:

```bash
# Find all buttons
grep -r "button" src/components --include="*.ts" | grep -v ".styles.ts"

# Find all inputs
grep -r "input" src/components --include="*.ts" | grep -v ".styles.ts"

# Find all dropdowns/menus
grep -r "dropdown\|menu" src/components --include="*.ts" | grep -v ".styles.ts"

# Find all existing data-spectrum-pattern attributes
grep -r "data-spectrum-pattern" src/components --include="*.ts"
```

### 2. Component Categories Checklist

Go through each category systematically:

#### ✅ Buttons & Actions
- [ ] Primary buttons (`<button>` → `<sp-button variant="accent">`)
- [ ] Secondary buttons (`<button>` → `<sp-button variant="secondary">`)
- [ ] Negative/destructive buttons (`<button>` → `<sp-button variant="negative">`)
- [ ] Icon buttons (`<button>` → `<sp-action-button quiet>`)
- [ ] Toggle buttons
- [ ] Button groups

#### ✅ Form Controls
- [ ] Text inputs (`<input type="text">` → `<sp-textfield>`)
- [ ] Number inputs (`<input type="number">` → `<sp-textfield type="number">`)
- [ ] Textareas (`<textarea>` → `<sp-textfield multiline>`)
- [ ] Checkboxes (`<input type="checkbox">` → `<sp-checkbox>`)
- [ ] Radio buttons (`<input type="radio">` → `<sp-radio>`)
- [ ] Switches/toggles (`<input type="checkbox">` → `<sp-switch>`)
- [ ] Field labels (`<label>` → `<sp-field-label>`)
- [ ] Help text (`<span>` → `<sp-help-text>`)

#### ✅ Menus & Dropdowns
- [ ] Dropdown menus (custom → `<sp-action-menu>` + `<sp-menu>` + `<sp-menu-item>`)
- [ ] Context menus
- [ ] Select dropdowns (`<select>` → `<sp-picker>`)
- [ ] Combo boxes

#### ✅ Navigation
- [ ] Tabs (`<div>` → `<sp-tabs>` + `<sp-tab>`)
- [ ] Side navigation
- [ ] Breadcrumbs

#### ✅ Overlays
- [ ] Modals/dialogs (`<div>` → `<sp-dialog>`)
- [ ] Popovers (`<div>` → `<sp-popover>`)
- [ ] Tooltips (`title` → `<sp-tooltip>`)
- [ ] Toast notifications

#### ✅ Progress & Status
- [ ] Progress bars (`<div>` → `<sp-progress-bar>`)
- [ ] Progress circles (`<div>` → `<sp-progress-circle>`)
- [ ] Meters
- [ ] Status indicators

#### ✅ Data Display
- [ ] Tables (`<table>` → `<sp-table>`)
- [ ] Lists
- [ ] Cards
- [ ] Dividers (`<hr>` → `<sp-divider>`)

#### ✅ Theme & Layout
- [ ] Theme wrapper (`<sp-theme>` at app root)
- [ ] Color scheme (light/dark)
- [ ] Scale (medium/large)

## Migration Process

### Step 1: Add Theme Wrapper

**CRITICAL**: Always start by wrapping your app in `<sp-theme>`:

```typescript
import '@spectrum-web-components/theme/sp-theme.js';
import '@spectrum-web-components/theme/src/themes.js';

render() {
  return html`
    <sp-theme theme="spectrum" color="light" scale="medium">
      <!-- Your app content -->
    </sp-theme>
  `;
}
```

### Step 2: Import Required Components

For each component type, add the appropriate import:

```typescript
// Buttons
import '@spectrum-web-components/button/sp-button.js';
import '@spectrum-web-components/action-button/sp-action-button.js';

// Forms
import '@spectrum-web-components/textfield/sp-textfield.js';
import '@spectrum-web-components/field-label/sp-field-label.js';

// Menus
import '@spectrum-web-components/action-menu/sp-action-menu.js';
import '@spectrum-web-components/menu/sp-menu.js';
import '@spectrum-web-components/menu/sp-menu-item.js';
```

### Step 3: Replace Elements Systematically

Work through each category in order, testing after each:

1. Theme wrapper (test immediately)
2. Buttons (most common, easiest to test)
3. Form inputs
4. Menus/dropdowns
5. Navigation
6. Overlays
7. Everything else

### Step 4: Update Event Handlers

Some Spectrum components use different events:

```typescript
// Old: button click
<button @click=${this.handler}>

// New: same
<sp-button @click=${this.handler}>

// Old: input change
<input @input=${this.handler}>

// New: same
<sp-textfield @input=${this.handler}>

// Old: dropdown menu
<button @click=${this.toggleMenu}>
${this.showMenu ? html`<div>...</div>` : ''}

// New: action-menu with @change
<sp-action-menu @change=${(e) => {
  const selectedItem = e.target.selectedItem;
  // handle selection
}}>
```

## Common Pitfalls

### 1. Missing Theme Wrapper
**Problem**: Components render but have no styling
**Solution**: Add `<sp-theme>` wrapper at app root

### 2. Forgetting Dropdowns
**Problem**: Custom dropdowns not converted
**Solution**: Search for `data-spectrum-pattern="menu"` and convert to `<sp-action-menu>`

### 3. Incomplete Event Handler Updates
**Problem**: Interactions don't work after migration
**Solution**: Test each component type thoroughly

### 4. Missing Imports
**Problem**: Components don't render
**Solution**: Ensure all `@spectrum-web-components/*` imports are present

## Validation

After migration, verify:

```bash
# Build should succeed
npm run build

# No data-spectrum-pattern attributes should remain (except in tests/docs)
grep -r "data-spectrum-pattern" src/components --include="*.ts"

# All custom buttons should be replaced
grep -r '<button' src/components --include="*.ts" | grep -v "sp-button"

# All custom inputs should be replaced  
grep -r '<input' src/components --include="*.ts" | grep -v "sp-textfield"
```

## Documentation Additions for Spectrumizer

Add this section to `AGENTIC_SPECTRUM_DESIGN_GUIDE.md`:

### Pre-Migration Checklist

Before starting migration, create a comprehensive inventory:

1. **Run pattern discovery**: Use grep/ripgrep to find all UI elements
2. **Create checklist**: Use the categories above
3. **Prioritize**: Start with theme, then buttons, then forms, then menus
4. **Test incrementally**: Build and test after each category
5. **Validate completion**: Run validation commands to ensure nothing was missed

### Common Missed Patterns

Based on real migrations, these are commonly overlooked:

- **Dropdowns/Menus**: Often custom-built with state management
- **Icon buttons**: May be styled differently than regular buttons
- **Field labels**: Often just `<label>` tags
- **Help text**: Often just `<span>` or `<p>` tags
- **Theme wrapper**: Critical but easy to forget

### Migration Order

Always follow this order:

1. ✅ Theme wrapper (test immediately - nothing will look right without this!)
2. ✅ Buttons (most visible, easiest to verify)
3. ✅ Form inputs (test form submission)
4. ✅ Dropdowns/menus (test interactions)
5. ✅ Navigation (test routing)
6. ✅ Overlays (test open/close)
7. ✅ Everything else

