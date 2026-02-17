import { app, safeStorage } from 'electron';
import path from 'path';
import fs from 'fs';

const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

interface Config {
    openaiApiKey?: string;
    selectedMic?: string;
    theme?: string;
}

function readConfig(): Config {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error("Failed to read config", err);
    }
    return {};
}

function writeConfig(config: Config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
    } catch (err) {
        console.error("Failed to write config", err);
    }
}

export const Store = {
    setApiKey(key: string) {
        const config = readConfig();
        if (safeStorage.isEncryptionAvailable()) {
            const encrypted = safeStorage.encryptString(key);
            config.openaiApiKey = encrypted.toString('base64');
        } else {
            config.openaiApiKey = key; // Fallback for some linux environments, though usually available on Windows
        }
        writeConfig(config);
    },

    getApiKey(): string {
        const config = readConfig();
        if (!config.openaiApiKey) return '';

        if (safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(config.openaiApiKey, 'base64');
                return safeStorage.decryptString(buffer);
            } catch (err) {
                console.error("Failed to decrypt API key", err);
                return '';
            }
        }
        return config.openaiApiKey;
    },

    set(key: keyof Config, value: string) {
        const config = readConfig();
        (config as any)[key] = value;
        writeConfig(config);
    },

    get(key: keyof Config): string {
        const config = readConfig();
        return (config as any)[key] || '';
    }
};
