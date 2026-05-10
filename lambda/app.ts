import type { Handler } from 'aws-lambda';
import { type AxiosError } from 'axios';
import { sendEmail } from './mailer';
import type { ISolarProvider, ReportItem } from './types';
import { RenacService } from './providers/renac-service';
import { PhbService } from './providers/phb-service';
import { SolarmanService } from './providers/solarman-service';

export const CONFIG = {
    RENAC: {
        API_URL: 'https://sec.bg.renacpower.cn:8084/api',
        ACCOUNTS: [
            { user: process.env.RENAC_USER!, pass: process.env.RENAC_PASS! },
            { user: process.env.RENAC_USER2!, pass: process.env.RENAC_PASS2! },
        ],
    },
    PHB: {
        LOGIN_URL: 'https://solarportalplus.com/web/sems/sems-user/api/v1/auth/cross-login',
        ACCOUNT: { user: process.env.PHB_USER!, pass: process.env.PHB_PASS! },
    },
    SOLARMAN: {
        API_URL: 'https://globalpro.solarmanpv.com',
        LOGIN_PAGE_URL: 'https://globalpro.solarmanpv.com',
        TURNSTILE_SITE_KEY: '0x4AAAAAAB3NtEA9guZfcVPY',
        TWO_CAPTCHA_API_KEY: process.env.TWO_CAPTCHA_API_KEY!,
        ACCOUNT: {
            user: process.env.SOLARMAN_USER!,
            pass: process.env.SOLARMAN_PASS!,
        },
    },
    GENERATION_FACTOR: 4.6,
    EMAIL: {
        SENDER: process.env.SENDER_EMAIL,
        RECIPIENTS: process.env.RECIPIENTS_EMAILS,
    },
};
export const lambdaHandler: Handler = async (): Promise<void> => {
    try {
        if (!CONFIG.EMAIL.SENDER || !CONFIG.EMAIL.RECIPIENTS) {
            throw new Error('E-mails não configurados.');
        }

        const providers: ISolarProvider[] = [new RenacService(), new PhbService(), new SolarmanService()];

        console.log('Buscando dados de todas as APIs...');

        const results = await Promise.all(providers.map((p) => p.getStations()));

        // "Flat" junta o array de arrays em um array único de IStandardStation
        const allStations = results.flat();

        console.log(`Total de plantas encontradas: ${allStations.length}`);

        if (allStations.length === 0) {
            console.log('Nenhuma planta encontrada.');
            return;
        }

        const reportDataToEmail: ReportItem[] = allStations.map((s) => {
            const expected = s.capacity * CONFIG.GENERATION_FACTOR;

            const providerTag = s.provider === 'RENAC' ? '[RENAC]' : '[PHB]';

            return {
                name: `${providerTag} ${s.name}`,
                id: s.id,
                expected_energy: expected,
                day_energy: s.dayEnergy,
                statusText: s.isOnline ? '🟢 Operando' : '🔴 Atenção/Offline',
            };
        });

        console.log(`Enviando e-mail para ${CONFIG.EMAIL.RECIPIENTS}`);
        await sendEmail(reportDataToEmail);
    } catch (err) {
        const error = err as Error | AxiosError;
        console.error('CRITICAL ERROR:', error);
    }
};
