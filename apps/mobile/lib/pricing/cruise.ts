/**
 * 크루즈 요금 계산기 (cruise_rate_card + cruise_holiday_surcharge + cruise_tour_options)
 */
import type { SupabaseClient as TypedSupabaseClient } from '@supabase/supabase-js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SupabaseLike = TypedSupabaseClient<any, any, any>;

export const SCHEDULE_MAP: Record<string, string> = {
  '1박2일': '1N2D',
  '2박3일': '2N3D',
  '3박4일': '3N4D',
  당일: 'DAY',
};

export interface CruiseRateCard {
  id: string;
  cruise_name: string;
  schedule_type: string;
  room_type: string;
  room_type_en: string | null;
  price_adult: number;
  price_child: number | null;
  price_child_extra_bed: number | null;
  price_child_older: number | null;
  price_infant: number | null;
  price_extra_bed: number | null;
  price_single: number | null;
  valid_year: number;
  valid_from: string | null;
  valid_to: string | null;
  extra_bed_available: boolean;
  includes_vehicle: boolean;
  vehicle_type: string | null;
  infant_policy: string | null;
  season_name: string | null;
  is_promotion: boolean;
  child_age_range: string | null;
  single_available: boolean;
  display_order: number;
  is_active: boolean;
}

export interface CruiseHolidaySurcharge {
  id: string;
  cruise_name: string;
  schedule_type: string | null;
  holiday_date: string;
  holiday_date_end: string | null;
  holiday_name: string | null;
  surcharge_per_person: number;
  surcharge_child: number | null;
  surcharge_type: string;
  valid_year: number;
  is_confirmed: boolean;
  notes: string | null;
}

export interface CruiseTourOption {
  option_id: string | number;
  id?: string | number;
  cruise_name: string;
  schedule_type: string;
  option_name: string;
  option_name_en: string | null;
  option_price: number;
  option_type: string;
  description: string | null;
  is_active: boolean;
}

export interface SelectedTourOption {
  option_id: string;
  option_name: string;
  quantity: number;
  unit_price: number;
}

export interface CruisePriceInput {
  cruise_name: string;
  schedule: string;
  room_type: string;
  checkin_date: string;
  adult_count: number;
  child_count?: number;
  child_extra_bed_count?: number;
  infant_count?: number;
  extra_bed_count?: number;
  single_count?: number;
  selected_options?: SelectedTourOption[];
}

export interface PriceLineItem {
  label: string;
  count: number;
  unit_price: number;
  total: number;
}

export interface SurchargeLineItem {
  holiday_name: string;
  holiday_date: string;
  surcharge_adult: number;
  surcharge_child: number;
  adult_count: number;
  child_count: number;
  infant_count?: number;
  total: number;
  is_confirmed: boolean;
}

export interface CruisePriceResult {
  rate_card: CruiseRateCard;
  items: PriceLineItem[];
  surcharges: SurchargeLineItem[];
  tour_options: PriceLineItem[];
  subtotal: number;
  surcharge_total: number;
  option_total: number;
  grand_total: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  price_breakdown: Record<string, any>;
  has_unconfirmed_surcharge: boolean;
  is_day_tour: boolean;
}

export interface CruiseFilterInput {
  schedule?: string;
  checkin_date?: string;
  cruise_name?: string;
}

function toScheduleType(schedule: string): string {
  return SCHEDULE_MAP[schedule] || schedule;
}

function getYear(dateStr: string): number {
  return new Date(dateStr).getFullYear();
}

function isInfantOnlySurcharge(surcharge: CruiseHolidaySurcharge): boolean {
  const text = `${surcharge.holiday_name || ''} ${surcharge.notes || ''}`.toLowerCase();
  return /유아|infant|2세\s*미만|3번째|2인째/.test(text);
}

function getChargeableInfantCount(infantCount: number, surcharge: CruiseHolidaySurcharge): number {
  const text = `${surcharge.holiday_name || ''} ${surcharge.notes || ''}`.toLowerCase();
  if (/3번째/.test(text)) return Math.max(0, infantCount - 2);
  if (/2인째/.test(text)) return Math.max(0, infantCount - 1);
  return Math.max(0, infantCount);
}

export class CruisePriceCalculator {
  private supabase: SupabaseLike;

  constructor(supabase: SupabaseLike) {
    this.supabase = supabase;
  }

  async getCruiseNames(filter: CruiseFilterInput): Promise<string[]> {
    if (!filter.schedule || !filter.checkin_date) return [];
    const scheduleType = toScheduleType(filter.schedule);
    const year = getYear(filter.checkin_date);
    const checkinDate = filter.checkin_date;

    const { data, error } = await this.supabase
      .from('cruise_rate_card')
      .select('cruise_name')
      .eq('schedule_type', scheduleType)
      .eq('valid_year', year)
      .eq('is_active', true)
      .or(
        `and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkinDate},valid_to.gte.${checkinDate})`,
      )
      .order('cruise_name');

    if (error || !data) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...new Set((data as any[]).map((d) => d.cruise_name as string))];
  }

  async getRoomTypes(filter: CruiseFilterInput): Promise<CruiseRateCard[]> {
    if (!filter.schedule || !filter.checkin_date || !filter.cruise_name) return [];
    const scheduleType = toScheduleType(filter.schedule);
    const year = getYear(filter.checkin_date);
    const checkinDate = filter.checkin_date;

    const { data, error } = await this.supabase
      .from('cruise_rate_card')
      .select('*')
      .eq('cruise_name', filter.cruise_name)
      .eq('schedule_type', scheduleType)
      .eq('valid_year', year)
      .eq('is_active', true)
      .or(
        `and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkinDate},valid_to.gte.${checkinDate})`,
      )
      .order('price_adult', { ascending: true })
      .order('display_order', { ascending: true });

    if (error || !data) return [];
    return data as CruiseRateCard[];
  }

  async getRateCard(
    cruise_name: string,
    schedule: string,
    room_type: string,
    checkin_date: string,
  ): Promise<CruiseRateCard | null> {
    const scheduleType = toScheduleType(schedule);
    const year = getYear(checkin_date);

    const { data, error } = await this.supabase
      .from('cruise_rate_card')
      .select('*')
      .eq('cruise_name', cruise_name)
      .eq('schedule_type', scheduleType)
      .eq('room_type', room_type)
      .eq('valid_year', year)
      .eq('is_active', true)
      .or(
        `and(valid_from.is.null,valid_to.is.null),and(valid_from.lte.${checkin_date},valid_to.gte.${checkin_date})`,
      )
      .order('is_promotion', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return data as CruiseRateCard;
  }

  async getHolidaySurcharges(
    cruise_name: string,
    schedule: string,
    checkin_date: string,
  ): Promise<CruiseHolidaySurcharge[]> {
    const scheduleType = toScheduleType(schedule);
    const year = getYear(checkin_date);

    const { data, error } = await this.supabase
      .from('cruise_holiday_surcharge')
      .select('*')
      .eq('cruise_name', cruise_name)
      .eq('valid_year', year)
      .or(`schedule_type.eq.${scheduleType},schedule_type.is.null`);

    if (error || !data) return [];

    const checkin = new Date(checkin_date);
    return (data as CruiseHolidaySurcharge[]).filter((surcharge) => {
      const holidayStart = new Date(surcharge.holiday_date);
      const holidayEnd = surcharge.holiday_date_end
        ? new Date(surcharge.holiday_date_end)
        : holidayStart;
      return checkin >= holidayStart && checkin <= holidayEnd;
    });
  }

  async getTourOptions(cruise_name: string, schedule: string): Promise<CruiseTourOption[]> {
    const scheduleType = toScheduleType(schedule);
    const { data, error } = await this.supabase
      .from('cruise_tour_options')
      .select('*')
      .eq('cruise_name', cruise_name)
      .eq('schedule_type', scheduleType)
      .eq('is_active', true)
      .order('option_price');
    if (error || !data) return [];
    return data as CruiseTourOption[];
  }

  async calculate(input: CruisePriceInput): Promise<CruisePriceResult | null> {
    const rateCard = await this.getRateCard(
      input.cruise_name,
      input.schedule,
      input.room_type,
      input.checkin_date,
    );
    if (!rateCard) return null;

    const items: PriceLineItem[] = [];

    if (input.adult_count > 0) {
      items.push({
        label: '성인',
        count: input.adult_count,
        unit_price: rateCard.price_adult,
        total: rateCard.price_adult * input.adult_count,
      });
    }

    const childCount = input.child_count || 0;
    if (childCount > 0 && rateCard.price_child != null) {
      items.push({
        label: '아동 (5~11세)',
        count: childCount,
        unit_price: rateCard.price_child,
        total: rateCard.price_child * childCount,
      });
    }

    const childExtraBedCount = input.child_extra_bed_count || 0;
    if (childExtraBedCount > 0 && rateCard.price_child_extra_bed != null) {
      items.push({
        label: '아동 엑스트라베드',
        count: childExtraBedCount,
        unit_price: rateCard.price_child_extra_bed,
        total: rateCard.price_child_extra_bed * childExtraBedCount,
      });
    }

    const infantCount = input.infant_count || 0;
    if (infantCount > 0 && rateCard.price_infant != null) {
      const chargeableInfantCount = Math.max(0, infantCount - 1);
      items.push({
        label: '유아 (0~4세) - 1명 무료',
        count: infantCount,
        unit_price: rateCard.price_infant,
        total: rateCard.price_infant * chargeableInfantCount,
      });
    }

    const extraBedCount = input.extra_bed_count || 0;
    if (extraBedCount > 0 && rateCard.price_extra_bed != null && rateCard.extra_bed_available) {
      items.push({
        label: '엑스트라베드',
        count: extraBedCount,
        unit_price: rateCard.price_extra_bed,
        total: rateCard.price_extra_bed * extraBedCount,
      });
    }

    const singleCount = input.single_count || 0;
    if (singleCount > 0 && rateCard.price_single != null && rateCard.single_available) {
      items.push({
        label: '싱글차지 (1인 사용)',
        count: singleCount,
        unit_price: rateCard.price_single,
        total: rateCard.price_single * singleCount,
      });
    }

    const subtotal = items.reduce((sum, item) => sum + item.total, 0);

    const holidaySurcharges = await this.getHolidaySurcharges(
      input.cruise_name,
      input.schedule,
      input.checkin_date,
    );

    const surcharges: SurchargeLineItem[] = [];
    for (const surcharge of holidaySurcharges) {
      const adultSurcharge = surcharge.surcharge_per_person;
      const childSurcharge = surcharge.surcharge_child ?? surcharge.surcharge_per_person;
      const totalChildForSurcharge = childCount + childExtraBedCount;

      const isInfantOnly = isInfantOnlySurcharge(surcharge);
      const chargeableInfantCount = getChargeableInfantCount(infantCount, surcharge);

      const surchargeTotal = isInfantOnly
        ? adultSurcharge * chargeableInfantCount
        : adultSurcharge * input.adult_count + childSurcharge * totalChildForSurcharge;

      surcharges.push({
        holiday_name: surcharge.holiday_name || '추가요금',
        holiday_date: surcharge.holiday_date,
        surcharge_adult: adultSurcharge,
        surcharge_child: childSurcharge,
        adult_count: isInfantOnly ? 0 : input.adult_count,
        child_count: isInfantOnly ? 0 : totalChildForSurcharge,
        infant_count: isInfantOnly ? chargeableInfantCount : 0,
        total: surchargeTotal,
        is_confirmed: surcharge.is_confirmed,
      });
    }

    const surchargeTotal = surcharges
      .filter((s) => s.is_confirmed)
      .reduce((sum, s) => sum + s.total, 0);

    const isDayTour = toScheduleType(input.schedule) === 'DAY';
    const tourOptionItems: PriceLineItem[] = [];
    let optionTotal = 0;

    if (isDayTour && input.selected_options && input.selected_options.length > 0) {
      for (const opt of input.selected_options) {
        if (opt.quantity > 0) {
          const total = opt.unit_price * opt.quantity;
          tourOptionItems.push({
            label: opt.option_name,
            count: opt.quantity,
            unit_price: opt.unit_price,
            total,
          });
          optionTotal += total;
        }
      }
    }

    const grandTotal = subtotal + surchargeTotal + optionTotal;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const priceBreakdown: Record<string, any> = {
      cruise_name: input.cruise_name,
      schedule: input.schedule,
      room_type: input.room_type,
      checkin_date: input.checkin_date,
      rate_card_id: rateCard.id,
      season_name: rateCard.season_name,
      is_promotion: rateCard.is_promotion,
    };

    if (input.adult_count > 0) {
      priceBreakdown.adult = {
        count: input.adult_count,
        unit_price: rateCard.price_adult,
        total: rateCard.price_adult * input.adult_count,
      };
    }
    if (childCount > 0) {
      priceBreakdown.child = {
        count: childCount,
        unit_price: rateCard.price_child,
        total: (rateCard.price_child || 0) * childCount,
      };
    }
    if (childExtraBedCount > 0) {
      priceBreakdown.child_extra_bed = {
        count: childExtraBedCount,
        unit_price: rateCard.price_child_extra_bed,
        total: (rateCard.price_child_extra_bed || 0) * childExtraBedCount,
      };
    }
    if (infantCount > 0) {
      const chargeableInfantCount = Math.max(0, infantCount - 1);
      priceBreakdown.infant = {
        count: infantCount,
        unit_price: rateCard.price_infant,
        total: (rateCard.price_infant || 0) * chargeableInfantCount,
      };
    }
    if (extraBedCount > 0) {
      priceBreakdown.extra_bed = {
        count: extraBedCount,
        unit_price: rateCard.price_extra_bed,
        total: (rateCard.price_extra_bed || 0) * extraBedCount,
      };
    }
    if (singleCount > 0) {
      priceBreakdown.single = {
        count: singleCount,
        unit_price: rateCard.price_single,
        total: (rateCard.price_single || 0) * singleCount,
      };
    }

    if (surcharges.length > 0) {
      priceBreakdown.surcharges = surcharges.map((s) => ({
        holiday_name: s.holiday_name,
        holiday_date: s.holiday_date,
        surcharge_adult: s.surcharge_adult,
        surcharge_child: s.surcharge_child,
        total: s.total,
        is_confirmed: s.is_confirmed,
      }));
    }
    if (tourOptionItems.length > 0) {
      priceBreakdown.tour_options = tourOptionItems.map((opt) => ({
        option_name: opt.label,
        quantity: opt.count,
        unit_price: opt.unit_price,
        total: opt.total,
      }));
    }

    priceBreakdown.subtotal = subtotal;
    priceBreakdown.surcharge_total = surchargeTotal;
    priceBreakdown.option_total = optionTotal;
    priceBreakdown.grand_total = grandTotal;
    priceBreakdown.is_day_tour = isDayTour;

    return {
      rate_card: rateCard,
      items,
      surcharges,
      tour_options: tourOptionItems,
      subtotal,
      surcharge_total: surchargeTotal,
      option_total: optionTotal,
      grand_total: grandTotal,
      price_breakdown: priceBreakdown,
      has_unconfirmed_surcharge: surcharges.some((s) => !s.is_confirmed),
      is_day_tour: isDayTour,
    };
  }
}

export function formatVND(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + '₫';
}

export function formatVNDKorean(amount: number): string {
  if (amount >= 1000000) {
    const man = Math.floor(amount / 10000);
    return `${man.toLocaleString()}동`;
  }
  return `${amount.toLocaleString()}동`;
}
