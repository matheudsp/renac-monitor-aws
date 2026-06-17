import axios from 'axios';
import crypto from 'crypto';
import type { IRenacListResponse, IRenacLoginResponse, ISolarProvider, IStandardStation } from '../types';
import { CONFIG } from '../app';

// Algoritmo extraído do frontend: MD5(token + timestamp + SECRET)
const RENAC_SIGN_SECRET = '9P@3kF7sD2&zX5cV8bNm1qR4tY6uI0o';

function buildAuthHeaders(token: string): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000);
    const sign = crypto.createHash('md5').update(`${token}${timestamp}${RENAC_SIGN_SECRET}`).digest('hex');

    return {
        'Content-Type': 'application/json;charset=utf-8',
        Accept: 'application/json, text/plain, */*',
        Token: token,
        timestamp: String(timestamp),
        sign,
    };
}

export class RenacService implements ISolarProvider {
    async getStations(): Promise<IStandardStation[]> {
        const results: IStandardStation[] = [];

        const accounts = CONFIG.RENAC.ACCOUNTS.filter((a) => a.user && a.pass);

        for (const acc of accounts) {
            try {
                // 1. Login — sem autenticação adicional
                const loginRes = await axios.post<IRenacLoginResponse>(
                    `${CONFIG.RENAC.API_URL}/user/login`,
                    { login_name: acc.user, pwd: acc.pass },
                    { headers: { 'Content-Type': 'application/json' } },
                );

                if (loginRes.data.code !== 1) {
                    console.error(
                        `[RENAC] Erro login ${acc.user}: code=${loginRes.data.code} msg=${loginRes.data.msg}`,
                    );
                    continue;
                }

                const { token } = loginRes.data.user;
                const userId = loginRes.data.data;

                // 2. Lista de estações — token + timestamp + sign gerados frescos
                const listRes = await axios.post<IRenacListResponse>(
                    `${CONFIG.RENAC.API_URL}/station/list`,
                    {
                        user_id: userId,
                        station_name: '',
                        equ_sn: '',
                        status: null,
                        station_type: null,
                        offset: 0,
                        rows: 50,
                        installer_name: '',
                        user_name: '',
                        export_type: 0,
                        order: '',
                        sort: '',
                        model_sn: '',
                    },
                    { headers: buildAuthHeaders(token) },
                );

                if (listRes.data.code !== 1) {
                    console.error(
                        `[RENAC] Erro ao listar estações ${acc.user}: code=${listRes.data.code} msg=${listRes.data.msg}`,
                    );
                    continue;
                }

                const stations = (listRes.data.data.list ?? []).map((s) => ({
                    id: s.station_id,
                    name: s.station_name,
                    capacity: s.station_capacity,
                    dayEnergy: s.day_energy,
                    isOnline: s.status === 0, // 0 = Normal/Gerando, 1 = Offline
                    provider: 'RENAC' as const,
                }));

                console.log(`[RENAC] ${acc.user}: ${stations.length} estação(ões) carregada(s)`);
                results.push(...stations);
            } catch (error) {
                console.error(`[RENAC] Falha ao processar conta ${acc.user}`, error);
            }
        }

        return results;
    }
}
