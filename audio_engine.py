import sounddevice as sd
import numpy as np
import soundfile as sf
import tempfile
import os
import threading
from typing import Optional, Callable

class AudioEngine:
    def __init__(self, samplerate: int = 44100):
        self.samplerate = samplerate
        self.recording = False
        self.paused = False
        self.audio_data = []
        self.stream: Optional[sd.InputStream] = None
        self._temp_files: list[str] = []
        self.on_data: Optional[Callable[[np.ndarray], None]] = None

    def get_audio_devices(self):
        return sd.query_devices()

    def start_recording(self, device_id: Optional[int] = None):
        self.recording = True
        self.audio_data = []
        
        def callback(indata, frames, time, status):
            if status:
                print(status)
            if self.recording and not self.paused:
                self.audio_data.append(indata.copy())
                if self.on_data:
                    self.on_data(indata)

        self.stream = sd.InputStream(
            samplerate=self.samplerate,
            channels=1,
            device=device_id,
            callback=callback
        )
        self.stream.start()

    def pause_recording(self):
        """Pause data accumulation without stopping the stream."""
        if self.recording:
            self.paused = True

    def resume_recording(self):
        """Resume data accumulation."""
        if self.recording:
            self.paused = False

    def stop_recording(self) -> str:
        self.recording = False
        if self.stream:
            self.stream.stop()
            self.stream.close()
            self.stream = None

        if not self.audio_data:
            return ""

        # Concatenate all chunks
        full_audio = np.concatenate(self.audio_data, axis=0)
        
        # Save to a temporary webm-like file (Whisper likes .wav or .mp3, let's use .wav for safety)
        fd, path = tempfile.mkstemp(suffix='.wav')
        os.close(fd)

        sf.write(path, full_audio, self.samplerate)
        self._temp_files.append(path)
        return path

    def cleanup_temp_file(self, path: str):
        """Remove a specific temp file after it's been processed."""
        try:
            if path in self._temp_files:
                self._temp_files.remove(path)
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            pass

    def cleanup_all_temp_files(self):
        """Remove all tracked temp files."""
        for path in self._temp_files[:]:
            self.cleanup_temp_file(path)

    def is_recording(self) -> bool:
        return self.recording and not self.paused

    def is_paused(self) -> bool:
        return self.paused
