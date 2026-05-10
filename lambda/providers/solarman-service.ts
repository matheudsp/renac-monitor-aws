import type {
    ISolarProvider,
    IStandardStation,
    ISolarmanLoginResponse,
    ISolarmanDeviceListResponse,
    ISolarmanDevice,
} from '../types';
import { CONFIG } from '../app';
import { resolveTurnstile } from '../captcha';

const PAGE_SIZE = 100;

export class SolarmanService implements ISolarProvider {
    async getStations(): Promise<IStandardStation[]> {
        try {
            const accessToken = await this.login();
            const allDevices = await this.fetchAllDevices(accessToken);
            return this.groupDevicesByStation(allDevices);
        } catch (error) {
            console.error('[SOLARMAN] Falha ao processar conta', error);
            return [];
        }
    }

    // ─── Busca todas as páginas de dispositivos ───────────────────

    private async fetchAllDevices(accessToken: string): Promise<ISolarmanDevice[]> {
        const firstPage = await this.fetchDevicePage(accessToken, 1);
        const total = firstPage.total;
        const totalPages = Math.ceil(total / PAGE_SIZE);

        console.log(`[SOLARMAN] Total de dispositivos: ${total} — ${totalPages} página(s)`);

        const allDevices: ISolarmanDevice[] = [...firstPage.data];

        if (totalPages > 1) {
            const remainingPages = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
            const results = await Promise.all(remainingPages.map((page) => this.fetchDevicePage(accessToken, page)));
            results.forEach((r) => allDevices.push(...r.data));
        }

        return allDevices;
    }

    private async fetchDevicePage(accessToken: string, page: number): Promise<ISolarmanDeviceListResponse> {
        const params = new URLSearchParams({
            page: String(page),
            size: String(PAGE_SIZE),
            'snorder.direction': 'ASC',
            'snorder.property': 'name',
            powerTypeList: 'PV',
        });

        const res = await fetch(
            `${CONFIG.SOLARMAN.API_URL}/maintain-s/operating/system/device/INVERTER/list?${params}`,
            {
                method: 'GET',
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    Authorization: `Bearer ${accessToken}`,
                },
            },
        );

        if (!res.ok) {
            throw new Error(`[SOLARMAN] Erro ao buscar dispositivos (página ${page}): HTTP ${res.status}`);
        }

        return res.json() as Promise<ISolarmanDeviceListResponse>;
    }

    // ─── Agrupa inversores por estação, somando geração ───────────

    private groupDevicesByStation(devices: ISolarmanDevice[]): IStandardStation[] {
        const stationMap = new Map<
            number,
            { name: string; dayEnergy: number; hasOnlineDevice: boolean; capacity: number }
        >();

        for (const device of devices) {
            const stationId = device.systemId;
            const existing = stationMap.get(stationId);

            // deviceState: 1 = Normal/Gerando | 2 = Alerta | 3 = Offline/Sem comunicação
            const isDeviceOnline = device.deviceState === 1;

            if (existing) {
                existing.dayEnergy += device.dailyPowerGeneration ?? 0;
                existing.hasOnlineDevice = existing.hasOnlineDevice || isDeviceOnline;
            } else {
                stationMap.set(stationId, {
                    name: device.stationName ?? device.systemName ?? String(stationId),
                    dayEnergy: device.dailyPowerGeneration ?? 0,
                    // installedCapacity vem null neste endpoint — capacity ficará 0
                    // e a geração esperada não será calculada até outro endpoint ser mapeado
                    capacity: device.installedCapacity ?? 0,
                    hasOnlineDevice: isDeviceOnline,
                });
            }
        }

        const stations: IStandardStation[] = [];

        stationMap.forEach((value, stationId) => {
            stations.push({
                id: stationId,
                name: value.name,
                capacity: value.capacity,
                dayEnergy: Number(value.dayEnergy.toFixed(2)),
                isOnline: value.hasOnlineDevice,
                provider: 'SOLARMAN',
            });
        });

        console.log(`[SOLARMAN] ${stations.length} estações agrupadas de ${devices.length} dispositivos`);
        return stations;
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
