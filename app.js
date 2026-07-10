export function validateDelaySeconds(value) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Delay must be a non-negative number.');
  }

  return parsed;
}

// Kept for API/backwards compatibility, but no longer used to trigger audio
// playback. iOS Safari revokes "user gesture" permission for play() calls
// made inside a setTimeout callback, which is what caused the original bug.
export function schedulePlayback(delayMs, action) {
  const timeoutId = window.setTimeout(action, delayMs);

  return {
    cancel() {
      window.clearTimeout(timeoutId);
    }
  };
}

// Now accepts an explicit start time on the AudioContext's own clock instead
// of always starting immediately. Scheduling through the Web Audio API clock
// (rather than a JS timer) is what keeps this allowed on iOS Safari even when
// the actual sound starts seconds after the tap that unlocked it.
export function createTone(audioContext, startTime = audioContext.currentTime) {
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = 660;
  gainNode.gain.value = 0.12;

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);

  oscillator.start(startTime);
  oscillator.stop(startTime + 0.4);

  return { oscillator, gainNode };
}

export function stopPlayback(activePlayback) {
  if (!activePlayback) {
    return;
  }

  if (activePlayback.source) {
    try {
      activePlayback.source.stop();
    } catch (error) {
      // Calling stop() on a node that hasn't started yet or already
      // finished can throw in some browsers; safe to ignore.
    }
  }

  if (activePlayback.tone) {
    try {
      activePlayback.tone.oscillator.stop();
    } catch (error) {
      // Same as above.
    }
  }
}

export function getPlaybackStartTime(percent, duration) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  return safeDuration ? (safePercent / 100) * safeDuration : 0;
}

const DELAY_STORAGE_KEY = 'delayedAudioPlayer:defaultDelaySeconds';

function loadStoredDelaySeconds() {
  try {
    const stored = window.localStorage.getItem(DELAY_STORAGE_KEY);
    return stored === null ? null : validateDelaySeconds(stored);
  } catch (error) {
    return null;
  }
}

function persistDelaySeconds(value) {
  try {
    window.localStorage.setItem(DELAY_STORAGE_KEY, String(value));
  } catch (error) {
    // Ignore storage failures (e.g. private browsing mode).
  }
}

function init() {
  const delayInput = document.getElementById('delayInput');
  const fileInput = document.getElementById('fileInput');
  const startButton = document.getElementById('startButton');
  const playNowButton = document.getElementById('playNowButton');
  const stopButton = document.getElementById('stopButton');
  const progressSlider = document.getElementById('progressSlider');
  const timeLabel = document.getElementById('timeLabel');
  const status = document.getElementById('status');
  const fileName = document.getElementById('fileName');

  let selectedFileUrl = '';
  let audioContext = null;
  let audioBuffer = null;      // decoded PCM data for the selected file
  let decodePromise = null;    // in-flight fetch+decode, awaited before playback
  let activePlayback = null;   // { source, kind: 'file' | 'tone', contextStartTime, offset, timerId }
  let currentDuration = 0;
  let seekPercent = 0;
  let progressTimerId = null;

  const storedDelaySeconds = loadStoredDelaySeconds();
  if (storedDelaySeconds !== null) {
    delayInput.value = String(storedDelaySeconds);
  }

  delayInput.addEventListener('input', () => {
    try {
      persistDelaySeconds(validateDelaySeconds(delayInput.value));
    } catch (error) {
      // Invalid value; don't persist bad input.
    }
  });

  function formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) {
      return '0:00';
    }

    const totalSeconds = Math.floor(seconds);
    const minutes = Math.floor(totalSeconds / 60);
    const remainingSeconds = totalSeconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function updateTimeLabel(currentTime) {
    timeLabel.textContent = `${formatTime(currentTime)} / ${formatTime(currentDuration)}`;
  }

  function setStatus(message) {
    status.textContent = message;
  }

  function ensureAudioContext() {
    if (!audioContext) {
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return audioContext;
  }

  // Decoding doesn't require the context to be running, so we can kick this
  // off as soon as a file is chosen instead of waiting for Start/Play Now.
  // That way, by the time the user taps Start, the buffer is usually ready
  // and there's no extra delay hiding inside the "user gesture" window.
  function decodeSelectedFile(url) {
    const context = ensureAudioContext();

    return fetch(url)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => context.decodeAudioData(arrayBuffer))
      .then((decoded) => {
        audioBuffer = decoded;
        currentDuration = decoded.duration;
        progressSlider.max = String(currentDuration || 100);
        updateTimeLabel(0);
        return decoded;
      })
      .catch(() => {
        audioBuffer = null;
        setStatus('Could not decode the selected audio file. Try a different file.');
      });
  }

  function handleFileSelection(event) {
    const file = event.target.files?.[0];

    if (selectedFileUrl) {
      URL.revokeObjectURL(selectedFileUrl);
    }

    audioBuffer = null;
    decodePromise = null;

    if (!file) {
      selectedFileUrl = '';
      currentDuration = 0;
      progressSlider.value = '0';
      updateTimeLabel(0);
      fileName.textContent = 'No file selected. A simple tone will play instead.';
      setStatus('No audio file selected.');
      return;
    }

    const supportedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/m4a', 'audio/x-m4a', 'audio/wav', 'audio/x-wav', 'audio/aac', 'video/mp4'];
    const isSupported = supportedTypes.includes(file.type) || /\.(mp3|m4a|aac|wav|mp4)$/i.test(file.name);

    if (!isSupported) {
      selectedFileUrl = '';
      currentDuration = 0;
      progressSlider.value = '0';
      updateTimeLabel(0);
      fileName.textContent = 'Selected file type is not supported. Try an MP3, M4A, AAC, or WAV file.';
      setStatus('Unsupported audio file.');
      return;
    }

    selectedFileUrl = URL.createObjectURL(file);
    currentDuration = 0;
    progressSlider.value = '0';
    updateTimeLabel(0);
    fileName.textContent = `Selected: ${file.name}`;
    setStatus(`Decoding ${file.name}...`);

    decodePromise = decodeSelectedFile(selectedFileUrl).then(() => {
      setStatus(`Ready to play ${file.name} after the delay.`);
    });
  }

  function stopProgressLoop() {
    if (progressTimerId !== null) {
      window.cancelAnimationFrame(progressTimerId);
      progressTimerId = null;
    }
  }

  // AudioBufferSourceNode has no 'timeupdate' event, so we poll the
  // AudioContext's own clock to keep the slider and time label in sync.
  function startProgressLoop() {
    stopProgressLoop();

    const step = () => {
      if (!activePlayback || activePlayback.kind !== 'file' || !currentDuration) {
        progressTimerId = null;
        return;
      }

      const elapsedSincePlayStarted = audioContext.currentTime - activePlayback.contextStartTime;

      if (elapsedSincePlayStarted < 0) {
        // Still waiting out the initial delay; nothing to show yet.
        progressTimerId = window.requestAnimationFrame(step);
        return;
      }

      const playbackPosition = activePlayback.offset + elapsedSincePlayStarted;

      if (playbackPosition >= currentDuration) {
        progressSlider.value = '100';
        updateTimeLabel(currentDuration);
        activePlayback = null;
        progressTimerId = null;
        setStatus('Playback finished.');
        return;
      }

      progressSlider.value = String((playbackPosition / currentDuration) * 100);
      updateTimeLabel(playbackPosition);
      progressTimerId = window.requestAnimationFrame(step);
    };

    progressTimerId = window.requestAnimationFrame(step);
  }

  // Schedules either the decoded file or the fallback tone to start at
  // `contextStartTime`, a timestamp on audioContext's own clock. This is the
  // part that actually fixes the iOS bug: the browser only cares that the
  // AudioContext was created/resumed inside a user gesture, not that the
  // sound starts immediately.
  function schedulePlaybackAtContextTime(contextStartTime) {
    if (audioBuffer) {
      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      const offset = getPlaybackStartTime(seekPercent, currentDuration);
      source.start(contextStartTime, offset);

      activePlayback = { source, kind: 'file', contextStartTime, offset };
      startProgressLoop();
    } else {
      const tone = createTone(audioContext, contextStartTime);
      activePlayback = { source: tone.oscillator, tone, kind: 'tone', contextStartTime, offset: 0 };
    }
  }

  async function withReadyAudioContext(callback) {
    try {
      ensureAudioContext();

      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      if (selectedFileUrl && !audioBuffer) {
        setStatus('Still preparing the audio file, one moment...');
        await decodePromise;
      }

      callback();
    } catch (error) {
      setStatus(error.message || 'Something went wrong starting playback.');
    }
  }

  function startPlayback() {
    withReadyAudioContext(() => {
      const delaySeconds = validateDelaySeconds(delayInput.value);

      stopPlayback(activePlayback);
      stopProgressLoop();
      activePlayback = null;

      setStatus(`Playback scheduled in ${delaySeconds.toFixed(1)} seconds.`);
      schedulePlaybackAtContextTime(audioContext.currentTime + delaySeconds);
    });
  }

  function playNow() {
    withReadyAudioContext(() => {
      stopPlayback(activePlayback);
      stopProgressLoop();
      activePlayback = null;

      setStatus(audioBuffer ? 'Playing audio now.' : 'Playing a simple tone now.');
      schedulePlaybackAtContextTime(audioContext.currentTime);
    });
  }

  function stopCurrentPlayback() {
    stopPlayback(activePlayback);
    stopProgressLoop();
    activePlayback = null;
    progressSlider.value = '0';
    updateTimeLabel(0);
    setStatus('Playback stopped.');
  }

  function handleSeek(event) {
    const value = Number(event.target.value);
    seekPercent = value;

    const newTime = currentDuration ? (value / 100) * currentDuration : 0;
    progressSlider.value = String(value);
    updateTimeLabel(newTime);

    // AudioBufferSourceNodes can't be repositioned in place; restart at the
    // new offset if something is already playing (not mid-delay).
    if (activePlayback?.kind === 'file' && audioContext.currentTime >= activePlayback.contextStartTime) {
      stopPlayback(activePlayback);
      stopProgressLoop();
      schedulePlaybackAtContextTime(audioContext.currentTime);
    }
  }

  startButton.addEventListener('click', startPlayback);
  playNowButton.addEventListener('click', playNow);
  stopButton.addEventListener('click', stopCurrentPlayback);
  progressSlider.addEventListener('input', handleSeek);
  fileInput.addEventListener('change', handleFileSelection);
}

if (typeof document !== 'undefined') {
  init();
}