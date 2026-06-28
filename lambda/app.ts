import type { Handler } from 'aws-lambda';
import { type AxiosError } from 'axios';
import { sendEmail } from './mailer';
import type { ISolarProvider, ReportItem } from './types';
import { SolarmanService } from './providers/solarman-service';
import { ElekeeperService } from './providers/elekeeper-service';

export const CONFIG = {
    SOLARMAN: {
        API_URL: 'https://globalpro.solarmanpv.com',
        LOGIN_PAGE_URL: 'https://globalpro.solarmanpv.com',
        TURNSTILE_SITE_KEY: '0x4AAAAAAB3NtEA9guZfcVPY',
        TWO_CAPTCHA_API_KEY: process.env.TWO_CAPTCHA_API_KEY!,
        ORG_ID: process.env.SOLARMAN_ORG_ID!,
        ACCOUNT: {
            user: process.env.SOLARMAN_USER!,
            pass: process.env.SOLARMAN_PASS!,
        },
    },
    ELEKEEPER: {
        API_URL: 'https://iop.saj-electric.com',
        ACCOUNT: {
            user: process.env.ELEKEEPER_USER!,
            pass: process.env.ELEKEEPER_PASS!,
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

        // const providers: ISolarProvider[] = [new SolarmanService(), new ElekeeperService()];
        const providers: ISolarProvider[] = [new SolarmanService()];

        console.log('Buscando dados de todas as APIs...');

        const results = await Promise.all(providers.map((p) => p.getStations()));

        const allStations = results.flat();

        console.log(`Total de plantas encontradas: ${allStations.length}`);

        if (allStations.length === 0) {
            console.log('Nenhuma planta encontrada.');
            return;
        }

        const reportDataToEmail: ReportItem[] = allStations.map((s) => {
            const expected = s.capacity * CONFIG.GENERATION_FACTOR;

            const providerTag =
                s.provider === 'SOLARMAN' ? '[SOLARMAN]' : s.provider === 'ELEKEEPER' ? '[ELEKEEPER]' : '[UNKNOWN]';

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
