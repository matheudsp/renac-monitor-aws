import axios from 'axios';
import type { IPhbListResponse, IPhbLoginResponse, ISolarProvider, IStandardStation } from '../types';
import { CONFIG } from '../app';
import * as crypto from 'crypto';

function encryptPhbPassword(password: string): string {
    const md5Hash = crypto.createHash('md5').update(password).digest('hex');
    return Buffer.from(md5Hash).toString('base64');
}

export class PhbService implements ISolarProvider {
    async getStations(): Promise<IStandardStation[]> {
        if (!CONFIG.PHB.ACCOUNT.user) return [];

        try {
            console.log(`[PHB] Iniciando login para ${CONFIG.PHB.ACCOUNT.user}`);
            const encryptedPassword = encryptPhbPassword(CONFIG.PHB.ACCOUNT.pass);
            const loginPayload = {
                account: CONFIG.PHB.ACCOUNT.user,
                pwd: encryptedPassword,
                agreement: 1,
                isLocal: false,
                isChinese: false,
            };

            const loginRes = await axios.post<IPhbLoginResponse>(CONFIG.PHB.LOGIN_URL, loginPayload);

            if (loginRes.data.code !== '00000') {
                console.error(`[PHB] Erro login: ${loginRes.data.code}`);
                return [];
            }

            const authData = loginRes.data.data;
            const apiBaseUrl = authData.api;

            const headerToken = JSON.stringify(authData);

            const listUrl = `${apiBaseUrl}/sems-plant/api/stations/page`;

            const listRes = await axios.post<IPhbListResponse>(
                listUrl,
                { current: 1, size: 50 },
                {
                    headers: {
                        token: headerToken,
                        'Content-Type': 'application/json',
                    },
                },
            );

            if (listRes.data.code !== '00000') {
                console.error(`[PHB] Erro listagem: ${listRes.data.code}`);
                return [];
            }

            return listRes.data.data.dataList.map((s) => ({
                id: s.id,
                name: s.name,
                capacity: s.installedPower,
                dayEnergy: s.productionToday,
                isOnline: s.status === 1, // 0 = Sem geração/Offline e 1 = Normal/Gerando
                provider: 'PHB' as const,
            }));
        } catch (error) {
            console.error('[PHB] Falha geral no serviço', error);
            return [];
        }
    }
}
