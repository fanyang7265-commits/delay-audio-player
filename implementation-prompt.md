# Delay Audio Player Implementation Prompt

Create a simple, mobile-friendly web app that plays audio after a user-defined delay. The app should be built with plain HTML, CSS, and JavaScript only, with no framework.

## Goal
Build a single-page app that allows a user to:
- enter a delay in seconds
- choose an audio file from their device
- start playback after the delay
- stop playback at any time
- scrub through the audio using a progress slider
- see the current playback time and total duration as a timestamp
- start playback from the slider position if the slider is moved before playback starts

## Requirements

### 1. UI layout
Create a centered card-style interface with:
- a title: "Delay Audio Player"
- a delay input field labeled "Delay (seconds)"
- an audio file input labeled "Audio file"
- a Start delay button
- a Stop button
- a playback progress slider labeled "Playback progress"
- a timestamp label showing "current / total"
- a status message area
- a file name display area

### 2. Core behavior
- The app should accept a non-negative numeric delay value.
- When the user clicks Start delay, the app should wait for the specified number of seconds and then start playback.
- If the user selects an audio file, playback should use that file.
- If no file is selected, the app should fall back to a simple tone generated using the Web Audio API.
- The Stop button should cancel a pending delayed start and stop any active playback.

### 3. Playback progress and seeking
- The app should show a slider that represents playback progress.
- The slider should update while audio is playing.
- The user should be able to drag the slider to a new position to seek to a different point in the audio.
- The timestamp label should update immediately when the user moves the slider.
- If the slider is moved before playback starts, the delayed playback should begin from that selected position.

### 4. Timestamp formatting
Show playback time in a simple format such as:
- 0:00 for zero seconds
- 1:23 for one minute and 23 seconds

### 5. Technical implementation details
- Use an HTML input of type range for the slider.
- Use the HTMLAudioElement for audio-file playback.
- Use the Web Audio API for the fallback tone.
- Keep the code organized with small helper functions.
- Handle browser autoplay restrictions gracefully and show a useful status message if playback is blocked.

### 6. Styling
- Use a modern, dark, mobile-friendly design.
- Add rounded corners, spacing, and a polished button layout.
- Make the slider visually appealing with a bright accent color.

## Suggested file structure
- index.html
- styles.css
- app.js

## Expected behavior summary
When the user:
1. enters a delay
2. selects an audio file or leaves it empty
3. moves the slider to a chosen position if desired
4. clicks Start delay

Then the app should:
- wait for the chosen delay
- start playback from the selected slider position if an audio file is present
- show progress and timestamps while audio plays
- allow stopping playback immediately

## Implementation notes
- Make the app robust to invalid delay values.
- Reset the slider and timestamp when playback stops or a new file is selected.
- Avoid memory leaks by revoking object URLs when replacing files.
- Keep the app simple and easy to understand.
