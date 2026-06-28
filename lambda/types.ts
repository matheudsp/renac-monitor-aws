export interface IStandardStation {
    id: string | number;
    name: string;
    capacity: number; // Potência instalada (kW)
    dayEnergy: number; // Geração do dia (kWh)
    isOnline: boolean;
    provider: 'SOLARMAN' | 'ELEKEEPER';
}

export interface ISolarProvider {
    getStations(): Promise<IStandardStation[]>;
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
