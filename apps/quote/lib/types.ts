// 견적 시스템 타입 정의
export interface Quote {
  id: string;
  user_id: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed' | 'confirmed';
  title?: string;
  description?: string;
  total_price: number;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
  approved_at?: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  service_type: 'cruise' | 'airport' | 'hotel' | 'tour' | 'rentcar';
  service_ref_id: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  options?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CruiseService {
  id: string;
  cruise_name: string;
  departure_date: string;
  return_date: string;
  departure_port?: string;
  room_type?: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  special_requests?: string;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export interface AirportService {
  id: string;
  service_type: 'pickup' | 'dropoff' | 'transfer';
  flight_number?: string;
  arrival_date?: string;
  departure_date?: string;
  pickup_location?: string;
  dropoff_location?: string;
  passenger_count: number;
  vehicle_type?: string;
  special_requests?: string;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export interface HotelService {
  id: string;
  hotel_name: string;
  check_in_date: string;
  check_out_date: string;
  room_type?: string;
  room_count: number;
  adult_count: number;
  child_count: number;
  special_requests?: string;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export interface TourService {
  id: string;
  tour_name: string;
  tour_date: string;
  duration_hours?: number;
  participant_count: number;
  pickup_location?: string;
  tour_type?: string;
  language: string;
  special_requests?: string;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export interface RentcarService {
  id: string;
  car_model: string;
  pickup_date: string;
  return_date: string;
  pickup_location?: string;
  return_location?: string;
  driver_age?: number;
  has_driver: boolean;
  insurance_type?: string;
  special_requests?: string;
  base_price: number;
  created_at: string;
  updated_at: string;
}

export type ServiceType = 'cruise' | 'airport' | 'hotel' | 'tour' | 'rentcar';

export type ServiceData = CruiseService | AirportService | HotelService | TourService | RentcarService;

// 견적 아이템과 서비스 데이터를 합친 타입
export interface QuoteItemWithService extends QuoteItem {
  service_data?: ServiceData;
}

// 견적과 아이템들을 합친 타입
export interface QuoteWithItems extends Quote {
  items: QuoteItemWithService[];
}

// 폼 데이터 타입들
export interface CruiseFormData {
  cruise_name: string;
  departure_date: string;
  return_date: string;
  departure_port?: string;
  room_type?: string;
  adult_count: number;
  child_count: number;
  infant_count: number;
  special_requests?: string;
  // 올드 페이지 호환성을 위한 추가 필드들
  schedule_code?: string;
  cruise_code?: string;
  payment_code?: string;
  discount_rate?: number;
  rooms_detail?: string; // JSON string
  vehicle_detail?: string; // JSON string
}

export interface AirportFormData {
  service_type: 'pickup' | 'dropoff' | 'transfer';
  flight_number?: string;
  arrival_date?: string;
  departure_date?: string;
  pickup_location?: string;
  dropoff_location?: string;
  passenger_count: number;
  vehicle_type?: string;
  special_requests?: string;
}

export interface HotelFormData {
  hotel_name: string;
  check_in_date: string;
  check_out_date: string;
  room_type?: string;
  room_count: number;
  adult_count: number;
  child_count: number;
  special_requests?: string;
}

export interface TourFormData {
  tour_name: string;
  tour_date: string;
  duration_hours?: number;
  participant_count: number;
  pickup_location?: string;
  tour_type?: string;
  language: string;
  special_requests?: string;
}

export interface RentcarFormData {
  car_model: string;
  pickup_date: string;
  return_date: string;
  pickup_location?: string;
  return_location?: string;
  driver_age?: number;
  has_driver: boolean;
  insurance_type?: string;
  special_requests?: string;
}

// 패키지 상품 관련 타입
export interface PackageMaster {
  id: string;
  package_code: string;
  name: string;
  description?: string;
  base_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PackageItem {
  id: string;
  package_id: string;
  service_type: ServiceType | 'car_sht';
  description?: string;
  item_order: number;
  default_data?: Record<string, any>;
  created_at: string;
}

export interface PackageWithItems extends PackageMaster {
  items: PackageItem[];
}
