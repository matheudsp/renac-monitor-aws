import axios from 'axios';
import type { IRenacListResponse, IRenacLoginResponse, ISolarProvider, IStandardStation } from '../types';
import { CONFIG } from '../app';

export class RenacService implements ISolarProvider {
    async getStations(): Promise<IStandardStation[]> {
        const results: IStandardStation[] = [];

        const accounts = CONFIG.RENAC.ACCOUNTS.filter((a) => a.user && a.pass);

        for (const acc of accounts) {
            try {
                const loginRes = await axios.post<IRenacLoginResponse>(`${CONFIG.RENAC.API_URL}/user/login`, {
                    login_name: acc.user,
                    pwd: acc.pass,
                });

                if (loginRes.data.code !== 1) {
                    console.error(`[RENAC] Erro login ${acc.user}: ${loginRes.data.msg}`);
                    continue;
                }

                const { token } = loginRes.data.user;
                const userId = loginRes.data.data;

                const listRes = await axios.post<IRenacListResponse>(
                    `${CONFIG.RENAC.API_URL}/station/list`,
                    { user_id: userId, rows: 50, offset: 0 },
                    { headers: { 'Content-Type': 'application/json', Token: token } },
                );

                if (listRes.data.code !== 1) continue;

                const stations = (listRes.data.data.list || []).map((s) => ({
                    id: s.station_id,
                    name: s.station_name,
                    capacity: s.station_capacity,
                    dayEnergy: s.day_energy,
                    isOnline: s.status === 0, // 0 = Normal na RENAC
                    provider: 'RENAC' as const,
                }));

                results.push(...stations);
            } catch (error) {
                console.error(`[RENAC] Falha ao processar conta ${acc.user}`, error);
            }
        }
        return results;
    }
}
