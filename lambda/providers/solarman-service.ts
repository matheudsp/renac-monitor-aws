import axios from 'axios';
import { createHash } from 'crypto';
import { CONFIG } from '../app';
import { resolveTurnstile } from '../captcha';
import type { ISolarProvider, IStandardStation, ISolarmanStationSearchResponse } from '../types';

const OAUTH_URL = 'https://pro.solarmanpv.com/oauth2-s/oauth/token';
const LOGIN_PAGE_URL = 'https://pro.solarmanpv.com'; // Domínio do Turnstile (para o 2captcha)
const LOGIN_PAGE_PATH = 'https://pro.solarmanpv.com/login'; // Preflight para obter cookie anti-bot

const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:150.0) Gecko/20100101 Firefox/150.0';

// Headers de browser exigidos pelo Solarman no endpoint de login
const BASE_LOGIN_HEADERS = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'content-type': 'application/x-www-form-urlencoded',
    origin: 'https://pro.solarmanpv.com',
    referer: 'https://pro.solarmanpv.com/login',
    'user-agent': BROWSER_UA,
    'log-scene': 'LOGIN',
    'log-country': 'BR',
    'log-platform-code': 'SOLARMAN_BUSINESS',
    'log-channel': 'Web',
    'log-client-version': '1.11.0',
    'log-area': 'SA',
    'log-lan': 'pt',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
};

export class SolarmanService implements ISolarProvider {
    /**
     * Solarman exige a senha em SHA-256 hex, não em plain text.
     */
    private hashPassword(password: string): string {
        return createHash('sha256').update(password).digest('hex');
    }

    /**
     * Faz um GET na página de login para obter o cookie anti-bot `acw_tc`
     * que o WAF do Solarman seta e exige em requisições subsequentes.
     * Sem ele o servidor retorna 412 AUTH_SLIDE_ERROR.
     */
    private async getAntibotCookie(): Promise<string> {
        const res = await axios.get<string>(LOGIN_PAGE_PATH, {
            headers: {
                'user-agent': BROWSER_UA,
                accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
            },
            maxRedirects: 5,
        });

        const setCookie = res.headers['set-cookie'] ?? [];
        const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];

        // Base cookies que o browser sempre envia
        const cookieMap: Record<string, string> = {
            language: 'pt',
            firstPrivacy: 'true',
            accountFirstUse: 'eMail',
        };

        for (const c of cookies) {
            const [pair] = c.split(';');
            const eqIdx = pair.indexOf('=');
            if (eqIdx === -1) continue;
            const name = pair.slice(0, eqIdx).trim();
            const value = pair.slice(eqIdx + 1).trim();
            if (name) cookieMap[name] = value;
        }

        const cookieString = Object.entries(cookieMap)
            .map(([k, v]) => `${k}=${v}`)
            .join('; ');

        console.log(`[Solarman] Preflight OK — acw_tc presente: ${cookieString.includes('acw_tc')}`);
        return cookieString;
    }

    /**
     * Etapa 1: autenticação com captcha (grant_type=mdc_password).
     * Retorna um access_token de escopo zero (organizationId=0) que só
     * serve para o switch_org da etapa 2.
     */
    private async loginStep1(captchaToken: string, cookie: string): Promise<string> {
        const { user, pass } = CONFIG.SOLARMAN.ACCOUNT;

        const params = new URLSearchParams();
        params.set('grant_type', 'mdc_password');
        params.set('identity_type', '2');
        params.set('username', user);
        params.set('password', this.hashPassword(pass));
        params.set('client_id', 'test');
        params.set('password_type', '');
        params.set('system', 'SOLARMAN');
        params.set('businessArea', 'FOREIGN_1');
        params.set('businessSubArea', 'SA');
        params.set('token', captchaToken);
        params.set('appKey', CONFIG.SOLARMAN.TURNSTILE_SITE_KEY);
        params.set('_type', 'cloudflare');
        params.set('verificationType', 'cloudflare'); // grafia correta (não "cloudfare")
        params.set('captchaType', 'cloudflare'); // grafia correta (não "cloudfare")
        params.set('id', '257');
        params.set('country', 'BR');
        params.set('channel', 'Web');
        params.set('platform', 'SOLARMAN_BUSINESS');
        params.set('index', '1');
        params.set('channelEnable', '0');
        params.set('logEnable', '0');
        // Campos extras que o browser inclui e o servidor valida
        params.set('createdDate', new Date().toISOString());
        params.set('lastModifiedDate', new Date().toISOString());

        const { data } = await axios.post<{ access_token?: string }>(OAUTH_URL, params, {
            headers: {
                ...BASE_LOGIN_HEADERS,
                cookie, // cookie anti-bot obtido no preflight
            },
        });

        if (!data.access_token) {
            throw new Error(`[Solarman] Step 1 (mdc_password) falhou: ${JSON.stringify(data)}`);
        }

        console.log('[Solarman] Step 1 (mdc_password) OK');
        return data.access_token;
    }

    /**
     * Etapa 2: troca de organização (grant_type=switch_org).
     * Retorna o token final com organizationId preenchido, válido para
     * chamadas à API globalpro.solarmanpv.com.
     */
    private async loginStep2(step1Token: string): Promise<string> {
        const { user, pass } = CONFIG.SOLARMAN.ACCOUNT;

        const params = new URLSearchParams();
        params.set('grant_type', 'switch_org');
        params.set('identity_type', '2');
        params.set('username', user);
        params.set('password', this.hashPassword(pass));
        params.set('access_token', step1Token);
        params.set('client_id', 'test');
        params.set('org_id', CONFIG.SOLARMAN.ORG_ID);
        params.set('system', 'SOLARMAN');

        const { data } = await axios.post<{ access_token?: string }>(OAUTH_URL, params, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json, text/plain, */*',
                'user-agent': BROWSER_UA,
                authorization: `Bearer ${step1Token}`,
            },
        });

        if (!data.access_token) {
            throw new Error(`[Solarman] Step 2 (switch_org) falhou: ${JSON.stringify(data)}`);
        }

        console.log('[Solarman] Step 2 (switch_org) OK');
        return data.access_token;
    }

    /**
     * Busca todas as plantas PV com paginação automática.
     * A API retorna até 50 itens por página; itera até esgotar.
     */
    private async fetchAllStations(token: string): Promise<ISolarmanStationSearchResponse['data']> {
        const PAGE_SIZE = 50;
        let page = 1;
        const allItems: ISolarmanStationSearchResponse['data'] = [];

        while (true) {
            const { data } = await axios.post<ISolarmanStationSearchResponse>(
                `${CONFIG.SOLARMAN.API_URL}/maintain-s/operating/station/v2/search`,
                { station: { powerTypeList: ['PV'] } },
                {
                    params: {
                        page: String(page),
                        size: String(PAGE_SIZE),
                        'order.direction': 'ASC',
                        'order.property': 'name',
                    },
                    headers: {
                        'content-type': 'application/json;charset=utf-8',
                        accept: 'application/json, text/plain, */*',
                        'user-agent': BROWSER_UA,
                        authorization: `Bearer ${token}`,
                    },
                },
            );

            allItems.push(...data.data);
            console.log(`[Solarman] Página ${page}: ${data.data.length} plantas (total API: ${data.total})`);

            if (allItems.length >= data.total || data.data.length < PAGE_SIZE) break;
            page++;
        }

        return allItems;
    }

    async getStations(): Promise<IStandardStation[]> {
        console.log('[Solarman] Iniciando login...');

        // Obtém cookie anti-bot e token Turnstile em paralelo para economizar tempo
        const [cookie, captchaToken] = await Promise.all([
            this.getAntibotCookie(),
            resolveTurnstile(CONFIG.SOLARMAN.TWO_CAPTCHA_API_KEY, LOGIN_PAGE_URL, CONFIG.SOLARMAN.TURNSTILE_SITE_KEY),
        ]);

        const step1Token = await this.loginStep1(captchaToken, cookie);
        const finalToken = await this.loginStep2(step1Token);

        const stations = await this.fetchAllStations(finalToken);
        console.log(`[Solarman] Total de plantas: ${stations.length}`);

        return stations.map((item): IStandardStation => {
            const { station } = item;
            return {
                id: station.id,
                name: station.name,
                capacity: station.installedCapacity ?? 0,
                dayEnergy: station.generationValue ?? 0,
                // NORMAL = gerando; ALL_OFFLINE / PARTIAL_OFFLINE = atenção
                isOnline: station.networkStatus === 'NORMAL',
                provider: 'SOLARMAN',
            };
        });
    }
}
