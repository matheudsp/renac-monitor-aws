import type {
    ISolarProvider,
    IStandardStation,
    ISolarmanLoginResponse,
    ISolarmanStationSearchResponse,
    ISolarmanStationItem,
} from '../types';
import { CONFIG } from '../app';
import { resolveTurnstile } from '../captcha';

const PAGE_SIZE = 50;

export class SolarmanService implements ISolarProvider {
    async getStations(): Promise<IStandardStation[]> {
        try {
            const accessToken = await this.login();
            const allStations = await this.fetchAllStations(accessToken);

            console.log(`[SOLARMAN] ${allStations.length} estações carregadas`);
            return allStations;
        } catch (error) {
            console.error('[SOLARMAN] Falha ao processar conta', error);
            return [];
        }
    }

    // ─── Busca todas as páginas de estações ───────────────────────

    private async fetchAllStations(accessToken: string): Promise<IStandardStation[]> {
        const firstPage = await this.fetchStationPage(accessToken, 1);
        const total = firstPage.total;
        const totalPages = Math.ceil(total / PAGE_SIZE);

        console.log(`[SOLARMAN] Total de estações: ${total} — ${totalPages} página(s)`);

        const allItems: ISolarmanStationItem[] = [...firstPage.data];

        if (totalPages > 1) {
            const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
            const results = await Promise.all(remainingPages.map((page) => this.fetchStationPage(accessToken, page)));
            results.forEach((r) => allItems.push(...r.data));
        }

        return allItems.map((item) => this.mapToStandardStation(item));
    }

    private async fetchStationPage(accessToken: string, page: number): Promise<ISolarmanStationSearchResponse> {
        const params = new URLSearchParams({
            page: String(page),
            size: String(PAGE_SIZE),
            'order.direction': 'ASC',
            'order.property': 'name',
        });

        const res = await fetch(`${CONFIG.SOLARMAN.AGG_API_URL}/maintain-s/operating/station/v2/search?${params}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json;charset=utf-8',
                Accept: 'application/json, text/plain, */*',
                Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({}),
        });

        if (!res.ok) {
            throw new Error(`[SOLARMAN] Erro ao buscar estações (página ${page}): HTTP ${res.status}`);
        }

        return res.json() as Promise<ISolarmanStationSearchResponse>;
    }

    // ─── Mapeia item da API para IStandardStation ─────────────────

    private mapToStandardStation(item: ISolarmanStationItem): IStandardStation {
        const s = item.station;

        // networkStatus: "NORMAL" | "ALL_OFFLINE" | "PARTIAL_OFFLINE"
        const isOnline = s.networkStatus === 'NORMAL' || s.networkStatus === 'PARTIAL_OFFLINE';

        return {
            id: s.id,
            name: s.name.trim(),
            capacity: s.installedCapacity ?? 0,
            dayEnergy: s.generationValue ?? 0,
            isOnline,
            provider: 'SOLARMAN',
        };
    }

    // ─── Login com Turnstile via 2captcha ─────────────────────────

    private async login(): Promise<string> {
        console.log('[SOLARMAN] Resolvendo Turnstile via 2captcha...');

        const turnstileToken = await resolveTurnstile(
            CONFIG.SOLARMAN.TWO_CAPTCHA_API_KEY,
            CONFIG.SOLARMAN.LOGIN_PAGE_URL,
            CONFIG.SOLARMAN.TURNSTILE_SITE_KEY,
        );

        const body = new URLSearchParams({
            grant_type: 'mdc_password',
            identity_type: '2',
            username: CONFIG.SOLARMAN.ACCOUNT.user,
            password: CONFIG.SOLARMAN.ACCOUNT.pass,
            client_id: 'test',
            password_type: '',
            system: 'SOLARMAN',
            businessArea: 'FOREIGN_1',
            businessSubArea: 'SA',
            token: turnstileToken,
            appKey: CONFIG.SOLARMAN.TURNSTILE_SITE_KEY,
            _type: 'cloudflare',
            verificationType: 'cloudflare',
        });

        const res = await fetch(`${CONFIG.SOLARMAN.API_URL}/oauth2-s/oauth/token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Accept: 'application/json, text/plain, */*',
                'log-platform-code': 'SOLARMAN_BUSINESS',
                'log-channel': 'Web',
                'log-client-version': '1.11.0',
                'log-lan': 'en',
                'log-area': 'SA',
                Origin: CONFIG.SOLARMAN.LOGIN_PAGE_URL,
                Referer: `${CONFIG.SOLARMAN.LOGIN_PAGE_URL}/login`,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0',
            },
            body,
        });

        if (!res.ok) {
            throw new Error(`[SOLARMAN] Login falhou: HTTP ${res.status} - ${await res.text()}`);
        }

        const data: ISolarmanLoginResponse = await res.json();

        if (!data.access_token) {
            throw new Error('[SOLARMAN] Login não retornou access_token');
        }

        console.log(`[SOLARMAN] Login OK — token expira em ${data.expires_in}s`);
        return data.access_token;
    }
}
