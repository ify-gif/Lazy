import { test, expect, type Page } from '@playwright/test';

async function installElectronMock(page: Page) {
    await page.addInitScript(() => {
        type Meeting = { id: number; title: string; transcript: string; summary: string; created_at: string };
        type WorkStory = { id: number; type: 'story' | 'comment'; title?: string | null; overview: string; output: string; created_at: string; parent_id?: number | null };

        const state: {
            meetings: Meeting[];
            workStories: WorkStory[];
            nextId: number;
        } = {
            meetings: [
                {
                    id: 1,
                    title: 'Untitled Meeting',
                    transcript: 'Mock transcript from history',
                    summary: 'Mock summary from history',
                    created_at: '2026-02-19T00:00:00.000Z',
                },
            ],
            workStories: [],
            nextId: 2,
        };

        const nowIso = () => new Date().toISOString();
        const nextId = () => state.nextId++;

        (window as unknown as {
            electron: {
                windowControls: { minimize: () => void; maximize: () => void; close: () => void };
                settings: {
                    setApiKey: (key: string) => void;
                    getApiKey: () => Promise<string>;
                    set: (key: string, value: string) => void;
                    get: (key: string) => Promise<string>;
                    getVersion: () => Promise<string>;
                    sendStatus: (status: string, message?: string) => void;
                    onStatusChange: (cb: (data: { status: string; message?: string }) => void) => () => void;
                    validateApiKey: () => Promise<boolean>;
                };
                updates: {
                    check: () => Promise<null>;
                    download: () => Promise<void>;
                    install: () => void;
                    onUpdateEvent: (cb: (data: { event: string; data?: unknown }) => void) => () => void;
                };
                ai: {
                    transcribe: () => Promise<string>;
                    summarizeMeeting: () => Promise<string>;
                    generateStory: () => Promise<{ summary: string; description: string }>;
                    polishComment: () => Promise<string>;
                };
                db: {
                    saveMeeting: (title: string, transcript: string, summary: string) => Promise<number>;
                    getMeetings: () => Promise<Meeting[]>;
                    saveWorkStory: (type: 'story' | 'comment', overview: string, output: string, parentId?: number, title?: string) => Promise<number>;
                    getWorkStories: () => Promise<WorkStory[]>;
                    getComments: (storyId: number) => Promise<WorkStory[]>;
                    updateWorkStoryTitle: (id: number, title: string) => Promise<void>;
                    deleteItem: (table: 'meetings' | 'work_stories', id: number) => Promise<void>;
                };
                platform: string;
            };
        }).electron = {
            windowControls: {
                minimize: () => { },
                maximize: () => { },
                close: () => { },
            },
            settings: {
                setApiKey: () => { },
                getApiKey: async () => 'mock-api-key',
                set: () => { },
                get: async () => '',
                getVersion: async () => '0.1.8',
                sendStatus: () => { },
                onStatusChange: () => () => { },
                validateApiKey: async () => true,
            },
            updates: {
                check: async () => null,
                download: async () => { },
                install: () => { },
                onUpdateEvent: () => () => { },
            },
            ai: {
                transcribe: async () => 'Mock transcript',
                summarizeMeeting: async () => 'Mock meeting summary',
                generateStory: async () => ({
                    summary: 'Testing Story Title',
                    description: 'Generated markdown body',
                }),
                polishComment: async () => 'Polished comment',
            },
            db: {
                saveMeeting: async (title, transcript, summary) => {
                    const id = nextId();
                    state.meetings.unshift({ id, title, transcript, summary, created_at: nowIso() });
                    return id;
                },
                getMeetings: async () => state.meetings,
                saveWorkStory: async (type, overview, output, parentId, title) => {
                    const id = nextId();
                    state.workStories.push({
                        id,
                        type,
                        title: type === 'story' ? (title ?? null) : null,
                        overview,
                        output,
                        created_at: nowIso(),
                        parent_id: parentId ?? null,
                    });
                    return id;
                },
                getWorkStories: async () => state.workStories.filter((item) => item.type === 'story'),
                getComments: async (storyId) => state.workStories.filter((item) => item.type === 'comment' && item.parent_id === storyId),
                updateWorkStoryTitle: async (id, title) => {
                    const story = state.workStories.find((item) => item.id === id && item.type === 'story');
                    if (story) story.title = title;
                },
                deleteItem: async (table, id) => {
                    if (table === 'meetings') {
                        state.meetings = state.meetings.filter((item) => item.id !== id);
                        return;
                    }

                    state.workStories = state.workStories.filter((item) => item.id !== id && item.parent_id !== id);
                },
            },
            platform: 'win32',
        };
    });
}

test.describe('LAZY Core Flows', () => {
    test.beforeEach(async ({ page }) => {
        await installElectronMock(page);
        await page.goto('/');
    });

    test('navigates to tracker and shows core controls', async ({ page }) => {
        await page.click('text=Work Tracker');
        await expect(page).toHaveURL(/.*tracker/);
        await expect(page.getByRole('button', { name: 'Record' })).toBeVisible();
        await expect(page.getByRole('button', { name: 'Generate AI' })).toBeVisible();
    });

    test('meeting guard: save/copy blocked without valid meeting title', async ({ page }) => {
        await page.click('text=Meeting Transcription');
        await expect(page).toHaveURL(/.*meeting/);

        await page.getByRole('button', { name: 'History' }).click();
        await page.getByText('Untitled Meeting').first().click();

        await page.getByTitle('Save').click();
        await expect(page.getByText('Please create a meeting title before saving.')).toBeVisible();
        await page.getByRole('button', { name: 'OK' }).click();

        await page.getByTitle('Copy').click();
        await expect(page.getByText('Please create a meeting title before copying.')).toBeVisible();
    });

    test('tracker: generate, save story, and rename inline', async ({ page }) => {
        await page.click('text=Work Tracker');
        await expect(page).toHaveURL(/.*tracker/);

        await page.getByPlaceholder('Describe your session...').fill('User completed Delta AI assessment and needs action summary.');
        await page.getByRole('button', { name: 'Generate AI' }).click();
        await expect(page.getByText('Generated markdown body')).toBeVisible();

        await page.getByRole('button', { name: 'Save Story' }).click();
        await expect(page.getByText('Story saved!')).toBeVisible();
        await page.getByRole('button', { name: 'OK' }).click();

        await expect(page.getByText('Testing Story Title')).toBeVisible();

        await page.getByTitle('Rename').first().click();
        const renameInput = page.locator('aside').first().locator('input:not([placeholder])').first();
        await renameInput.fill('Renamed Tracker Item');
        await renameInput.press('Enter');
        await expect(page.getByText(/Renamed Tracker Item/)).toBeVisible();
    });
});
