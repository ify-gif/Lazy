import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// Configure electron-log
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Set log file path in the user's app data directory
log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs', 'main.log');

// Add a custom format
log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}';

// Export the logger
export const logger = log.scope('Main');
export const aiLogger = log.scope('AI');
export const dbLogger = log.scope('DB');

export default log;
