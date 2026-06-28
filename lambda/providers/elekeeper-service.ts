import crypto from 'crypto';
import axios, { type AxiosInstance } from 'axios';
import type { ISolarProvider, IStandardStation } from '../types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = 'https://iop.saj-electric.com/dev-api';
const APP_PROJECT_NAME = 'elekeeper';
const CLIENT_ID = 'esolar-monitor-admin';
const LANG = 'pt';
const PAGE_SIZE = 50;
const MAX_PAGES = 20; // safety cap against infinite pagination

// ─── Response shapes ──────────────────────────────────────────────────────────

interface ApiResponse<T> {
    data: T;
    errCode: number;
    errMsg: string;
}

interface LoginData {
    token: string;
    tokenHead: string; // "Bearer "
    expiresIn: number;
}

interface PlantItem {
    plantUid: string;
    plantName: string;
    systemPower: number; // kWp (capacity)
    todayEnergy: number; // kWh
    isOnline: string; // "Y" | "N"
    powerNow: number; // kW (current output)
}

interface PlantListData {
    list: PlantItem[];
    hasNextPage: boolean;
    total: number;
    pages: number;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ElekeeperService implements ISolarProvider {
    private readonly user: string;
    private readonly pass: string;
    private readonly http: AxiosInstance;

    constructor() {
        this.user = process.env.ELEKEEPER_USER!;
        this.pass = process.env.ELEKEEPER_PASS!;

        this.http = axios.create({
            baseURL: BASE_URL,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:152.0) Gecko/20100101 Firefox/152.0',
                Accept: 'application/json, text/plain, */*',
                'Content-Language': 'zh_CN',
                lang: LANG,
                enableSign: 'false',
            },
        });
    }

    // ─── Crypto ───────────────────────────────────────────────────────────────

    private md5(str: string): string {
        return crypto.createHash('md5').update(str).digest('hex');
    }

    /**
     * SHA1 uppercase — matches the observed signature format in the platform.
     * Algorithm: SHA1(signParamKey1=val1&signParamKey2=val2&...) in signParams order.
     */
    private sha1(str: string): string {
        return crypto.createHash('sha1').update(str).digest('hex').toUpperCase();
    }

    // ─── Param helpers ────────────────────────────────────────────────────────

    private generateRandom(length = 32): string {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        return Array.from({ length }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    /**
     * Returns YYYY-MM-DD in America/Sao_Paulo time.
     * Works because TZ=America/Sao_Paulo is set in the Lambda environment,
     * so Date local methods reflect BR time automatically.
     */
    private getClientDate(): string {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    /**
     * Builds a params object with all common fields + signature.
     *
     * signParams order: [extra keys in insertion order] + [common keys]
     * This mirrors the pattern observed in all three API calls:
     *   captcha  → loginName, type, <common>
     *   login    → <common only>
     *   plants   → pageNo, pageSize, <common>
     */
    private buildParams(extra: Record<string, string> = {}): Record<string, string> {
        const timeStamp = Date.now().toString();
        const random = this.generateRandom();
        const clientDate = this.getClientDate();

        const common: Record<string, string> = {
            appProjectName: APP_PROJECT_NAME,
            clientDate,
            lang: LANG,
            timeStamp,
            random,
            clientId: CLIENT_ID,
        };

        const all: Record<string, string> = { ...extra, ...common };

        const signParamsKeys = [...Object.keys(extra), ...Object.keys(common)];
        const signStr = signParamsKeys.map((k) => `${k}=${all[k]}`).join('&');
        const signature = this.sha1(signStr);

        return {
            ...all,
            signParams: signParamsKeys.join(','),
            signature,
        };
    }

    /**
     * Builds a raw query string, preserving commas in `signParams`
     * (axios encodes commas as %2C by default which can confuse the server).
     */
    private toQueryString(params: Record<string, string>): string {
        return Object.entries(params)
            .map(([k, v]) =>
                k === 'signParams'
                    ? `${k}=${v}` // keep commas literal
                    : `${k}=${encodeURIComponent(v)}`,
            )
            .join('&');
    }

    // ─── Auth ─────────────────────────────────────────────────────────────────

    /**
     * Authenticates against Elekeeper.
     *
     * Note: the getCaptchaBase64 preflight is skipped — observed responses
     * always return an empty captchaKey, meaning captcha is not required.
     * If the server starts returning a captchaKey, add that step back here.
     */
    private async login(): Promise<string> {
        const timeStamp = Date.now().toString();
        const random = this.generateRandom();
        const clientDate = this.getClientDate();

        // Login signParams intentionally excludes username/password
        // (matches the observed cURL — credentials go in body but not in signature scope)
        const signParamsKeys = ['appProjectName', 'clientDate', 'lang', 'timeStamp', 'random', 'clientId'];
        const signValues: Record<string, string> = {
            appProjectName: APP_PROJECT_NAME,
            clientDate,
            lang: LANG,
            timeStamp,
            random,
            clientId: CLIENT_ID,
        };

        const signStr = signParamsKeys.map((k) => `${k}=${signValues[k]}`).join('&');
        const signature = this.sha1(signStr);

        const body = new URLSearchParams({
            lang: LANG,
            password: this.md5(this.pass), // platform expects MD5-hashed password
            rememberMe: 'true',
            username: this.user,
            loginType: '1',
            ...signValues,
            signParams: signParamsKeys.join(','),
            signature,
        });

        const { data } = await this.http.post<ApiResponse<LoginData>>('/api/v1/sys/login', body.toString(), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        });

        if (data.errCode !== 0) {
            throw new Error(`[Elekeeper] Login falhou (errCode ${data.errCode}): ${data.errMsg}`);
        }

        console.log('[Elekeeper] Login bem-sucedido.');
        return `${data.data.tokenHead}${data.data.token}`;
    }

    // ─── Data fetching ────────────────────────────────────────────────────────

    private async fetchAllPlants(authToken: string): Promise<PlantItem[]> {
        const plants: PlantItem[] = [];
        let pageNo = 1;

        while (pageNo <= MAX_PAGES) {
            const params = this.buildParams({
                pageNo: pageNo.toString(),
                pageSize: PAGE_SIZE.toString(),
            });

            const { data } = await this.http.get<ApiResponse<PlantListData>>(
                `/api/v1/monitor/plant/getPlantList?${this.toQueryString(params)}`,
                { headers: { Authorization: authToken } },
            );

            if (data.errCode !== 0) {
                throw new Error(`[Elekeeper] getPlantList falhou (errCode ${data.errCode}): ${data.errMsg}`);
            }

            plants.push(...data.data.list);
            console.log(`[Elekeeper] Página ${pageNo}/${data.data.pages} — ${data.data.list.length} planta(s).`);

            if (!data.data.hasNextPage) break;
            pageNo++;
        }

        return plants;
    }

    // ─── ISolarProvider ───────────────────────────────────────────────────────

    async getStations(): Promise<IStandardStation[]> {
        console.log('[Elekeeper] Autenticando...');
        const authToken = await this.login();

        console.log('[Elekeeper] Buscando plantas...');
        const plants = await this.fetchAllPlants(authToken);

        console.log(`[Elekeeper] Total: ${plants.length} planta(s) encontrada(s).`);

        return plants.map((p) => ({
            id: p.plantUid,
            name: p.plantName,
            capacity: p.systemPower, // kWp — mesma unidade esperada pelo GENERATION_FACTOR
            dayEnergy: p.todayEnergy, // kWh
            isOnline: p.isOnline === 'Y',
            provider: 'ELEKEEPER' as const,
        }));
    }
}
