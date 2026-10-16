import { getCountries, getCountryCallingCode, type CountryCode } from "libphonenumber-js/min";

const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "region" }) : null;

export type Country = { code: CountryCode; name: string; dial: string };

export const COUNTRIES: Country[] = getCountries()
  .map((code) => ({ code, name: names?.of(code) ?? code, dial: `+${getCountryCallingCode(code)}` }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const COUNTRY_CODES = new Set<string>(COUNTRIES.map((c) => c.code));
export const DEFAULT_COUNTRY: CountryCode = "IN";
