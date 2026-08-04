# GUI Text Formatting Fix

## Issue
The GUI dialogs were showing literal `\n` characters instead of line breaks, and bullet points weren't rendering properly in Windows MessageBox dialogs.

## Root Cause
Windows PowerShell MessageBox requires PowerShell's backtick notation (`` `n ``) for newlines, not standard escape sequences (`\n`).

## Solution
Replaced all `\n` with `` `n `` in message strings throughout the GUI module.

## Changes Made

### 1. Navigation Dialog Messages
Changed from:
```rust
format!("Previous answers:\n• Name: {}\n\n", employee_name)
```

To:
```rust
format!("Previous answers:`n  - Name: {}`n`n", employee_name)
```

### 2. Bullet Points
Changed from `•` (Unicode bullet) to `-` (dash) for better compatibility:
- Before: `• Name: John`
- After: `  - Name: John`

### 3. All Dialog Messages Updated

**Setup Dialog (4 steps):**
- Step 1: Employee name prompt
- Step 2: Employee ID prompt with previous name
- Step 3: Password prompt with previous name and ID
- Step 4: OTP prompt with all previous answers

**Settings Dialog (4 steps):**
- Same structure as setup dialog
- Shows current values instead of previous answers

**About Dialog:**
- Employee information display
- Version information

**Error Messages:**
- OTP request failures
- OTP verification failures
- Password verification failures
- Save/update failures

## Technical Details

### PowerShell Escape Sequences
In PowerShell strings:
- `` `n `` = newline
- `` `t `` = tab
- `` `r `` = carriage return
- `\n` = literal backslash + n (not a newline!)

### MessageBox Formatting
Windows MessageBox (System.Windows.Forms.MessageBox) interprets PowerShell escape sequences when the string is passed through PowerShell's `-Command` parameter.

## Example Before/After

### Before (Broken):
```
Previous answers:\n• Name: Shreyas\n\nEnter your employee ID:\n\n[Current value: VIB_001]\n\nPress OK to keep or enter new value:
```

### After (Fixed):
```
Previous answers:
  - Name: Shreyas

Enter your employee ID:

[Current value: VIB_001]

Press OK to keep or enter new value:
```

## Files Modified
- `monitoring-client-rust/src/modules/gui.rs`
  - `show_setup_dialog()` - All 4 steps
  - `show_settings_dialog()` - All 4 steps
  - `show_about_dialog()` - Info display
  - `prompt_input_with_navigation()` - Message formatting

## Testing Checklist
- [x] Code compiles without errors
- [ ] Step 1 displays correctly
- [ ] Step 2 shows previous name correctly
- [ ] Step 3 shows previous name and ID correctly
- [ ] Step 4 shows all previous answers correctly
- [ ] Error messages display with proper line breaks
- [ ] About dialog displays correctly
- [ ] Settings dialog displays current values correctly

## Notes
- All newlines must use `` `n `` in PowerShell MessageBox strings
- Bullet points changed to dashes for better readability
- Indentation added (2 spaces) for list items
- Format strings properly include all variables (fixed missing `{}` placeholders)
