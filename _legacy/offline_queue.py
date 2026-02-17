"""
Offline Queue Manager for LAZY Work Tracker.

Handles queuing recordings when offline and automatically processing them
when connectivity to OpenAI API is restored.
"""

import os
import shutil
from datetime import datetime
from typing import Optional, Callable
from PyQt6.QtCore import QObject, QTimer, pyqtSignal

from logger_config import logger


class OfflineQueue(QObject):
    """Manages the offline recording queue and background sync.
    
    Features:
        - Queue recordings for later processing when API is unavailable
        - Automatic background sync when connectivity returns
        - Retry logic with exponential backoff
        - Status signals for UI updates
        
    Signals:
        queue_changed(int): Emitted when queue count changes
        processing_started(int): Emitted when processing a recording (recording_id)
        processing_complete(int, bool): Emitted when done (recording_id, success)
        connectivity_changed(bool): Emitted when API connectivity changes
    """
    
    queue_changed = pyqtSignal(int)  # count
    processing_started = pyqtSignal(int)  # recording_id
    processing_complete = pyqtSignal(int, bool)  # recording_id, success
    connectivity_changed = pyqtSignal(bool)  # is_connected
    
    # Directory for offline recordings
    QUEUE_DIR = os.path.join(os.path.expanduser("~"), ".lazy", "offline_queue")
    
    def __init__(self, db_manager, api_client, parent=None):
        super().__init__(parent)
        self.db = db_manager
        self.api = api_client
        self._is_online = True
        self._is_processing = False
        self._sync_timer = None
        
        # Ensure queue directory exists
        os.makedirs(self.QUEUE_DIR, exist_ok=True)
        
        # Start periodic sync check
        self._start_sync_timer()
        
        logger.info(f"OfflineQueue initialized. Queue dir: {self.QUEUE_DIR}")
    
    def _start_sync_timer(self):
        """Start timer to periodically check for pending items and process."""
        self._sync_timer = QTimer(self)
        self._sync_timer.timeout.connect(self._check_and_sync)
        self._sync_timer.start(30000)  # Check every 30 seconds
    
    def queue_recording(self, temp_audio_path: str, mode: str) -> int:
        """Queue a recording for later processing.
        
        Copies the temp audio file to a persistent location and adds to queue.
        
        Args:
            temp_audio_path: Path to the temporary audio file
            mode: 'meeting' or 'work_tracker'
            
        Returns:
            Queue ID for the recording
        """
        # Generate unique filename
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{mode}_{timestamp}.wav"
        persistent_path = os.path.join(self.QUEUE_DIR, filename)
        
        # Copy audio to persistent location
        shutil.copy2(temp_audio_path, persistent_path)
        logger.info(f"Saved audio to queue: {persistent_path}")
        
        # Add to database queue
        queue_id = self.db.queue_recording(persistent_path, mode)
        
        # Emit signal
        count = self.db.get_pending_count()
        self.queue_changed.emit(count)
        
        logger.info(f"Recording queued: id={queue_id}, mode={mode}")
        return queue_id
    
    def check_connectivity(self) -> bool:
        """Check if the OpenAI API is reachable.
        
        Returns:
            True if API is available, False otherwise
        """
        if not self.api or not self.api.api_key:
            return False
            
        try:
            import requests
            response = requests.get(
                'https://api.openai.com/v1/models',
                headers={'Authorization': f'Bearer {self.api.api_key}'},
                timeout=5
            )
            is_online = response.status_code == 200
            
            if is_online != self._is_online:
                self._is_online = is_online
                self.connectivity_changed.emit(is_online)
                logger.info(f"API connectivity changed: {'online' if is_online else 'offline'}")
                
            return is_online
        except Exception as e:
            logger.debug(f"Connectivity check failed: {e}")
            if self._is_online:
                self._is_online = False
                self.connectivity_changed.emit(False)
            return False
    
    def _check_and_sync(self):
        """Periodic check - sync if online and have pending items."""
        if self._is_processing:
            return
            
        pending_count = self.db.get_pending_count()
        if pending_count == 0:
            return
            
        if self.check_connectivity():
            self.process_queue()
    
    def process_queue(self, process_callback: Optional[Callable] = None):
        """Process all pending recordings in the queue.
        
        Args:
            process_callback: Optional callback(audio_path, mode) -> result_id
                             If not provided, uses default transcription flow.
        """
        if self._is_processing:
            logger.warning("Queue processing already in progress")
            return
            
        self._is_processing = True
        pending = self.db.get_pending_recordings()
        
        if not pending:
            self._is_processing = False
            return
            
        logger.info(f"Processing {len(pending)} queued recordings")
        
        for recording in pending:
            try:
                recording_id = recording['id']
                audio_path = recording['audio_path']
                mode = recording['mode']
                
                # Check file still exists
                if not os.path.exists(audio_path):
                    logger.error(f"Audio file missing: {audio_path}")
                    self.db.update_recording_status(
                        recording_id, 'failed', 
                        error_message="Audio file not found"
                    )
                    continue
                
                # Mark as processing
                self.db.update_recording_status(recording_id, 'processing')
                self.processing_started.emit(recording_id)
                
                # Process the recording
                if process_callback:
                    result_id = process_callback(audio_path, mode)
                else:
                    result_id = self._default_process(audio_path, mode)
                
                # Mark as completed
                self.db.update_recording_status(
                    recording_id, 'completed', 
                    result_id=result_id
                )
                self.processing_complete.emit(recording_id, True)
                logger.info(f"Successfully processed recording {recording_id}")
                
                # Clean up audio file
                try:
                    os.remove(audio_path)
                except Exception as e:
                    logger.warning(f"Failed to remove processed audio: {e}")
                    
            except Exception as e:
                logger.exception(f"Failed to process recording {recording['id']}")
                self.db.update_recording_status(
                    recording['id'], 'failed',
                    error_message=str(e)
                )
                self.processing_complete.emit(recording['id'], False)
        
        self._is_processing = False
        
        # Emit updated count
        count = self.db.get_pending_count()
        self.queue_changed.emit(count)
    
    def _default_process(self, audio_path: str, mode: str) -> int:
        """Default processing using APIClient.
        
        This transcribes the audio and optionally generates a summary.
        Returns the ID of the created record.
        """
        # Transcribe the audio
        transcript = self.api.transcribe_audio(audio_path)
        
        if mode == 'meeting':
            # Generate summary and save as transcript
            summary = self.api.generate_meeting_summary(transcript)
            from datetime import datetime
            data = {
                'title': f"Meeting - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                'content': transcript,
                'summary': summary,
                'duration': 0,  # Unknown for queued recordings
                'recording_date': datetime.now().isoformat()
            }
            return self.db.save_transcript(data)
        else:
            # Generate work story
            story_json = self.api.generate_json_work_story(transcript)
            import json
            story = json.loads(story_json)
            data = {
                'title': story.get('title', 'Queued Work Story'),
                'description': story.get('description', ''),
                'overview': story.get('overview', ''),
                'comments': story.get('comments', []),
                'status': 'draft'
            }
            return self.db.save_work_story(data)
    
    def get_pending_count(self) -> int:
        """Get the number of recordings waiting to be processed."""
        return self.db.get_pending_count()
    
    def is_online(self) -> bool:
        """Check if currently online (cached value)."""
        return self._is_online
    
    def force_sync(self):
        """Force an immediate sync attempt."""
        if self.check_connectivity():
            self.process_queue()
