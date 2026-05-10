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

export interface ISolarmanStationItem {
    station: {
        id: number;
        name: string;
        installedCapacity: number | null; // kW
        generationValue: number | null; // kWh do dia
        generationPower: number | null; // W atual
        // "NORMAL" | "ALL_OFFLINE" | "PARTIAL_OFFLINE"
        networkStatus: string | null;
        businessWarningStatus: string | null;
        consumerWarningStatus: string | null;
        locationAddress: string | null;
        regionTimezone: string | null;
    };
}

export interface ISolarmanStationSearchResponse {
    total: number;
    data: ISolarmanStationItem[];
}

export interface ReportItem {
    name: string;
    id: string | number;
    day_energy: number;
    expected_energy: number;
    statusText: string;
}
