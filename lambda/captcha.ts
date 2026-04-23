const TWO_CAPTCHA_API_URL = 'https://api.2captcha.com';
const POLL_INTERVAL_MS = 3_000;
const MAX_ATTEMPTS = 30; // ~90s timeout

interface CreateTaskResponse {
    errorId: number;
    taskId?: number;
    errorCode?: string;
    errorDescription?: string;
}

interface GetTaskResultResponse {
    errorId: number;
    status: 'processing' | 'ready';
    solution?: {
        token: string;
        userAgent: string;
    };
    errorCode?: string;
}

async function createTurnstileTask(apiKey: string, websiteURL: string, websiteKey: string): Promise<number> {
    const res = await fetch(`${TWO_CAPTCHA_API_URL}/createTask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            clientKey: apiKey,
            task: {
                type: 'TurnstileTaskProxyless',
                websiteURL,
                websiteKey,
            },
        }),
    });

    const data: CreateTaskResponse = await res.json();

    if (data.errorId !== 0 || !data.taskId) {
        throw new Error(`[2captcha] createTask falhou: ${data.errorCode} - ${data.errorDescription}`);
    }

    return data.taskId;
}

async function pollTaskResult(apiKey: string, taskId: number): Promise<string> {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

        const res = await fetch(`${TWO_CAPTCHA_API_URL}/getTaskResult`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientKey: apiKey, taskId }),
        });

        const data: GetTaskResultResponse = await res.json();

        if (data.errorId !== 0) {
            throw new Error(`[2captcha] getTaskResult falhou: ${data.errorCode}`);
        }

        if (data.status === 'ready' && data.solution?.token) {
            console.log(`[2captcha] Token resolvido na tentativa ${attempt}/${MAX_ATTEMPTS}`);
            return data.solution.token;
        }

        console.log(`[2captcha] Tentativa ${attempt}/${MAX_ATTEMPTS} — processando...`);
    }

    throw new Error('[2captcha] Timeout: Turnstile não foi resolvido a tempo');
}

export async function resolveTurnstile(apiKey: string, websiteURL: string, websiteKey: string): Promise<string> {
    const taskId = await createTurnstileTask(apiKey, websiteURL, websiteKey);
    console.log(`[2captcha] Tarefa criada: taskId=${taskId}`);
    return pollTaskResult(apiKey, taskId);
}
