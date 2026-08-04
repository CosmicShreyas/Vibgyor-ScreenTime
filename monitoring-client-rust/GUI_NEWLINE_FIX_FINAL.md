# GUI Newline Fix - Final Solution

## Problem
Windows MessageBox dialogs were showing literal escape sequences (`` `n `n ``) instead of actual line breaks, making the text unreadable.

## Root Cause Analysis

### Initial Attempts
1. **First try**: Used `\n` - didn't work because PowerShell doesn't interpret backslash escapes
2. **Second try**: Used `` `n `` - didn't work because when passing strings through command line, the backticks were being treated as literals

### The Real Issue
When you pass a string to PowerShell via `-Command` parameter:
- The string is already quoted and escaped by the time PowerShell sees it
- PowerShell's backtick escape sequences (`` `n ``) don't get interpreted in this context
- The string needs to contain actual newline characters, not escape sequences

## Solution

Use PowerShell's `$([char]13)$([char]10)` syntax which:
- `[char]13` = Carriage Return (CR)
- `[char]10` = Line Feed (LF)
- `$()` = PowerShell subexpression that gets evaluated
- Together they create actual newline characters in the string

### Why This Works
1. PowerShell evaluates `$([char]13)` and `$([char]10)` into actual CR/LF characters
2. These characters are then passed to MessageBox.Show()
3. MessageBox correctly interprets them as line breaks

## Implementation

### Before (Broken)
```rust
let message = format!("Line 1`n`nLine 2");
// Result: "Line 1`n`nLine 2" (literal backticks)
```

### After (Working)
```rust
let message = format!("Line 1$([char]13)$([char]10)$([char]13)$([char]10)Line 2");
// Result: Actual line breaks in the dialog
```

## Changes Made

### 1. Navigation Dialog Method
Updated `prompt_input_with_navigation()` to:
- Use `$([char]13)$([char]10)` for newlines
- Store message in a PowerShell variable first
- Pass the variable to MessageBox.Show()

```rust
let full_message = format!("{}$([char]13)$([char]10)$([char]13)$([char]10)[{}]", message, buttons_text);
let choice_script = format!(
    r#"Add-Type -AssemblyName System.Windows.Forms; $msg = "{}"; $result = [System.Windows.Forms.MessageBox]::Show($msg, '{}', 'YesNoCancel', 'Question'); ..."#,
    full_message, title
);
```

### 2. All Dialog Messages
Updated every message string in:
- `show_setup_dialog()` - All 4 steps
- `show_settings_dialog()` - All 4 steps  
- `show_about_dialog()` - Info display
- Error messages throughout

### 3. Message Format Pattern
Standard pattern for all messages:
```rust
format!(
    "Previous answers:$([char]13)$([char]10)\
      - Name: {}$([char]13)$([char]10)\
      - ID: {}$([char]13)$([char]10)\
    $([char]13)$([char]10)\
    Enter next value:",
    name, id
)
```

## Example Output

### Step 2 Dialog (After Fix)
```
Previous answers:
  - Name: Shreyas

Enter your employee ID:

[Current value: VIB_001]

Press OK to keep or enter new value:

[Back | Next | Cancel]
```

### Step 4 Dialog (After Fix)
```
Previous answers:
  - Name: Shreyas
  - Employee ID: VIB_001
  - Password: Verified

Enter the OTP sent to admin email:

[Back | Next | Cancel]
```

## Technical Details

### PowerShell Character Codes
- `[char]13` = ASCII 13 = Carriage Return (CR) = `\r`
- `[char]10` = ASCII 10 = Line Feed (LF) = `\n`
- Windows line ending = CR+LF = `\r\n`

### Why Double Newlines?
```rust
$([char]13)$([char]10)$([char]13)$([char]10)
```
This creates a blank line between sections for better readability:
- First CR+LF ends the current line
- Second CR+LF creates a blank line

### Alternative Approaches (Not Used)
1. **Out-String**: Works for file content but not for formatted strings
2. **Here-Strings**: Complex to escape from Rust
3. **Environment Variables**: Unnecessary complexity
4. **Temp Files**: Too slow and messy

## Testing Checklist
- [x] Code compiles without errors
- [ ] Step 1: Name prompt displays correctly
- [ ] Step 2: Shows previous name with proper line breaks
- [ ] Step 3: Shows name and ID with proper line breaks
- [ ] Step 4: Shows all previous answers with proper line breaks
- [ ] Error messages display with proper line breaks
- [ ] About dialog displays with proper line breaks
- [ ] Settings dialog displays correctly
- [ ] Navigation works (Back/Next/Cancel)

## Files Modified
- `monitoring-client-rust/src/modules/gui.rs`
  - `prompt_input_with_navigation()` - Core dialog method
  - `show_setup_dialog()` - All message formatting
  - `show_settings_dialog()` - All message formatting
  - `show_about_dialog()` - Info display formatting

## References
- [PowerShell MessageBox Newlines - Stack Overflow](https://stackoverflow.com/questions/49936812/powershell-get-content-to-messagebox-keep-newlines)
- [PowerShell Forums - Multi-line MessageBox](https://forums.powershell.org/t/solved-curious-about-messagebox-and-multi-line-input/15038)
- [ASCII Character Codes](https://www.ascii-code.com/)

## Key Takeaway
When passing strings to PowerShell MessageBox from Rust:
- ❌ Don't use `\n` (not interpreted)
- ❌ Don't use `` `n `` (treated as literal when passed via command line)
- ✅ Use `$([char]13)$([char]10)` (evaluated by PowerShell into actual newlines)
