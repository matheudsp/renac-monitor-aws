export interface IStandardStation {
    id: string | number;
    name: string;
    capacity: number; // Potência instalada (kW)
    dayEnergy: number; // Geração do dia (kWh)
    isOnline: boolean;
    provider: 'RENAC' | 'PHB' | 'SOLARMAN';
}

export interface ISolarProvider {
    getStations(): Promise<IStandardStation[]>;
}

export interface IRenacLoginResponse {
    code: number;
    msg: string;
    data: number;
    user: { token: string; user_name: string };
}

export interface IRenacListResponse {
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

export interface IPhbLoginResponse {
    code: string;
    data: {
        api: string; // URL da API
        token: string;
        uid: string;
        timestamp: string;
        client: string;
        // Outros campos úteis para o header (region, languague)
        [key: string]: any;
    };
}
export interface IPhbListResponse {
    code: string;
    data: {
        dataList: {
            id: string;
            name: string;
            installedPower: number;
            productionToday: number;
            status: number; // 0 = Sem geração/Offline e 1 = Normal/Gerando
        }[];
    };
}

export interface ISolarmanLoginResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

export interface ISolarmanDevice {
    id: number;
    siteId: number;
    systemId: number; // ID único da estação (usado para agrupar)
    systemName: string; // Nome da estação (fallback)
    stationName: string | null; // Nome da estação (preferencial)
    deviceSn: string;
    type: string; // "INVERTER"
    netState: number; // 1 = Online | 0 = Offline (comunicação do coletor)
    deviceState: number; // 1 = Normal | 2 = Alerta | 3 = Offline/Sem comunicação
    alertState: number; // -1 = Sem alerta | 1 = Com alerta
    generationPower: number; // Potência atual (W)
    dailyPowerGeneration: number; // Geração do dia (kWh)
    installedCapacity: number | null; // Capacidade instalada (kW) — null neste endpoint
    timeZone: string;
}

export interface ISolarmanDeviceListResponse {
    total: number;
    data: ISolarmanDevice[];
}

export interface ReportItem {
    name: string;
    id: string | number;
    day_energy: number;
    expected_energy: number;
    statusText: string;
}
