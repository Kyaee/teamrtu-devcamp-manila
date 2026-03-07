export type WeatherConditionType =
  | "CLEAR"
  | "MOSTLY_CLEAR"
  | "PARTLY_CLOUDY"
  | "MOSTLY_CLOUDY"
  | "CLOUDY"
  | "FOG"
  | "LIGHT_RAIN"
  | "RAIN"
  | "HEAVY_RAIN"
  | "THUNDERSTORM"
  | "HAIL"
  | string;

export type TemperatureReading = {
  degrees: number;
  unit: "CELSIUS" | "FAHRENHEIT";
};

export type PrecipitationInfo = {
  probability: {
    percent: number;
    type: string;
  };
  qpf: {
    quantity: number;
    unit: string;
  };
};

export type WindInfo = {
  direction: {
    degrees: number;
    cardinal: string;
  };
  speed: {
    value: number;
    unit: string;
  };
  gust: {
    value: number;
    unit: string;
  };
};

export type CurrentConditionsResponse = {
  currentTime: string;
  timeZone: { id: string };
  isDaytime: boolean;
  weatherCondition: {
    iconBaseUri: string;
    description: { text: string; languageCode: string };
    type: WeatherConditionType;
  };
  temperature: TemperatureReading;
  feelsLikeTemperature: TemperatureReading;
  relativeHumidity: number;
  uvIndex: number;
  precipitation: PrecipitationInfo;
  thunderstormProbability: number;
  airPressure: { meanSeaLevelMillibars: number };
  wind: WindInfo;
  visibility: { distance: number; unit: string };
  cloudCover: number;
};

export type HourlyForecastEntry = {
  interval: { startTime: string; endTime: string };
  weatherCondition: {
    iconBaseUri: string;
    description: { text: string; languageCode: string };
    type: WeatherConditionType;
  };
  temperature: TemperatureReading;
  precipitation: PrecipitationInfo;
  thunderstormProbability: number;
  wind: WindInfo;
};

export type HourlyForecastResponse = {
  forecastHours: HourlyForecastEntry[];
};

export type WeatherData = {
  current: CurrentConditionsResponse | null;
  forecast: HourlyForecastEntry[];
  fetchedAt: string;
};
