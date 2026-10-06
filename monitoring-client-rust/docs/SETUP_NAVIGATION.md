# Setup Dialog Navigation Guide

## Overview

The setup and settings dialogs now support full navigation, allowing users to review previous answers and go back to edit them at any step.

## Features

### 1. Previous Answer Display
Each step shows a summary of all previous answers, so you always know what you've entered:

```
Previous answers:
• Name: John Doe
• Employee ID: EMP123

Enter admin password:
```

### 2. Back Navigation
At any step (except the first), you can go back to the previous step to modify your answer:
- Click "Back" or "No" button to return to the previous step
- Your previous answer is preserved and shown as the default value
- You can edit it or keep it as-is

### 3. Value Preservation
When you navigate back and forth:
- All your previous answers are preserved
- Default values are shown in the input fields
- You can press OK/Enter to keep the current value
- Or type a new value to change it

## User Flow

### Initial Setup (First Time)

**Step 1/4: Employee Name**
- Enter your full name
- If you've entered it before (by going back), it shows: `[Previous answer: John Doe]`
- Buttons: Next | Cancel

**Step 2/4: Employee ID**
- Shows: `Previous answers: • Name: John Doe`
- Enter your employee ID
- If you've entered it before, it shows: `[Previous answer: EMP123]`
- Buttons: Back | Next | Cancel

**Step 3/4: Admin Password**
- Shows: `Previous answers: • Name: John Doe • Employee ID: EMP123`
- Enter admin password for verification
- Password is validated immediately
- If incorrect, you stay on this step to try again
- Buttons: Back | Next | Cancel

**Step 4/4: OTP Verification**
- Shows: `Previous answers: • Name: John Doe • Employee ID: EMP123 • Password: ✓ Verified`
- OTP is automatically requested from the server
- Enter the OTP code sent to admin email
- If OTP fails, you can go back to step 3 to request a new one
- Buttons: Back | Next | Cancel

### Settings Update

Same flow as initial setup, but:
- Current values are pre-filled as defaults
- You can keep current values by pressing OK without typing
- Summary shows current values at each step

## Navigation Controls

### Button Mapping
- **Yes/OK** → Next (proceed to next step)
- **No** → Back (return to previous step)
- **Cancel** → Exit (cancel the entire process)

### Special Cases

1. **First Step**: Back button shows info message "This is the first step"
2. **Password Failure**: Stays on password step, allows retry or back navigation
3. **OTP Request Failure**: Returns to password step with error message
4. **OTP Verification Failure**: Returns to password step to request new OTP

## Benefits

1. **Error Recovery**: Made a typo? Just go back and fix it
2. **Review**: See all your answers before final submission
3. **Confidence**: Know exactly what you're submitting
4. **Flexibility**: Change your mind at any step
5. **No Restart**: Don't have to start over if you make a mistake

## Technical Implementation

The navigation system uses:
- State machine pattern with step tracking
- Value preservation across navigation
- `NavigationResult` enum for flow control
- Windows MessageBox for Back/Next/Cancel buttons
- Visual Basic InputBox for text entry

## Example Session

```
Step 1: Enter name → "John Doe" → Next
Step 2: Enter ID → "EMP123" → Next
Step 3: Enter password → "wrong" → Error, try again
Step 3: Enter password → "correct" → Next
Step 4: OTP sent → "123456" → Wrong OTP
        Go Back to Step 3
Step 3: Enter password → "correct" → Next (new OTP sent)
Step 4: Enter OTP → "789012" → Success!
```

## User Tips

1. **Review Before Proceeding**: Check the "Previous answers" summary at each step
2. **Use Back Freely**: Don't worry about going back - your answers are saved
3. **Default Values**: If you see your previous answer, just press OK to keep it
4. **Cancel Anytime**: You can cancel at any step if needed
5. **OTP Issues**: If OTP fails, go back to request a new one

## Developer Notes

- Navigation state is maintained in local variables within the dialog loop
- Each step is a separate match arm in the state machine
- Back navigation decrements step counter
- Forward navigation increments step counter
- Values persist across navigation cycles
- OTP failures automatically return to password step for retry
