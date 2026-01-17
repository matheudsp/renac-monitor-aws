import type { Handler } from 'aws-lambda';
import axios, { type AxiosError } from 'axios';
import { sendEmail } from './mailer';

interface ILoginResponse {
    code: number;
    msg: string;
    data: number;
    user: { token: string; user_name: string };
}

interface IListStationsResponse {
    code: number;
    msg: string;
    data: {
        total: number;
        list: {
            station_name: string;
            station_id: number;
            day_energy: number;
            sum_energy: number;
            station_capacity: number;
            status: number; // 0 = Normal/Gerando e 1 = Sem geração/Offline
            grid_time: string;
        }[];
    };
}

const CONFIG = {
    ACCOUNTS: [
        { user: process.env.RENAC_USER!, pass: process.env.RENAC_PASS! },
        { user: process.env.RENAC_USER2!, pass: process.env.RENAC_PASS2! },
    ],
    API_URL: 'https://sec.bg.renacpower.cn:8084/api',
    SENDER_EMAIL: process.env.SENDER_EMAIL,
    RECIPIENTS_EMAILS: process.env.RECIPIENTS_EMAILS,
    GENERATION_FACTOR: 4.6,
};

export const lambdaHandler: Handler = async (): Promise<void> => {
    try {
        if (!CONFIG.SENDER_EMAIL || !CONFIG.RECIPIENTS_EMAILS) {
            throw new Error('E-mails não configurados. ');
        }

        const promises = CONFIG.ACCOUNTS.map(async (acc) => {
            console.log(`Iniciando busca para usuário: ${acc.user}`);

            const loginRes = await axios.post<ILoginResponse>(`${CONFIG.API_URL}/user/login`, {
                login_name: acc.user,
                pwd: acc.pass,
            });

            if (loginRes.data.code !== 1) {
                console.error(`Erro login conta ${acc.user}: ${loginRes.data.msg}`);
                return []; // retornar [] vazio para não quebrar o fluxo de login da outra conta
            }

            const token = loginRes.data.user.token;
            const userId = loginRes.data.data;

            const listRes = await axios.post<IListStationsResponse>(
                `${CONFIG.API_URL}/station/list`,
                {
                    user_id: userId,
                    station_name: '',
                    status: null,
                    rows: 50,
                    offset: 0,
                },
                { headers: { 'Content-Type': 'application/json', Token: token } },
            );

            if (listRes.data.code !== 1) {
                console.error(`Erro ao listar plantas do ${acc.user}: ${listRes.data.msg}`);
                return []; // retornar [] vazio para não quebrar o fluxo de login da outra conta
            }

            return listRes.data.data.list || [];
        });

        const results = await Promise.all(promises);
        const allStations = results.flat();

        console.log(`Total de plantas encontradas: ${allStations.length}`);

        const reportDataToEmail = allStations.map((s) => {
            const isConnected = s.status === 0;
            const expected = s.station_capacity * CONFIG.GENERATION_FACTOR;
            return {
                name: s.station_name,
                id: s.station_id,
                expected_energy: expected,
                day_energy: s.day_energy,
                statusText: isConnected ? '🟢 Operando' : '🔴 Atenção/Offline', // 0 = Normal/Gerando e 1 = Sem geração/Offline
            };
        });

        if (reportDataToEmail.length > 0) {
            console.log(`Enviando e-mail para ${CONFIG.RECIPIENTS_EMAILS}`);
            await sendEmail(reportDataToEmail);
        } else {
            console.log('Nenhuma planta encontrada nas contas. ');
        }
    } catch (err) {
        const error = err as Error | AxiosError;
        console.error('Algo deu errado: ', error);
    }
};
