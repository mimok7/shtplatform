export type ProductFieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'boolean' | 'select';

export type ProductField = {
  key: string;
  label: string;
  type: ProductFieldType;
  required?: boolean;
  options?: Array<{ value: string; label: string }>;
  relation?: { dataset: string; valueField: string; labelField: string };
};

export type ProductDataset = {
  id: string;
  label: string;
  table: string;
  primaryKey: string;
  generatedPrimaryKey?: boolean;
  orderBy: string;
  orderAscending?: boolean;
  columns: string[];
  fields: ProductField[];
  insertDefaults?: Record<string, unknown>;
  touchesUpdatedAt?: boolean;
};

export type ProductService = {
  id: string;
  label: string;
  datasets: ProductDataset[];
};

const yesNoOptions = [
  { value: 'true', label: '사용' },
  { value: 'false', label: '미사용' },
];

const currentYear = new Date().getFullYear();

export const SERVICE_PRODUCT_CATALOG: ProductService[] = [
  {
    id: 'cruise', label: '크루즈', datasets: [
      {
        id: 'rooms', label: '상품·객실', table: 'cruise_info', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'cruise_name', columns: ['cruise_name', 'room_name', 'cruise_code', 'room_area', 'max_guests', 'display_order'], touchesUpdatedAt: true,
        insertDefaults: { cruise_images: [], room_images: [], base_price: 0, max_adults: 2, max_guests: 2, display_order: 0 },
        fields: [
          { key: 'cruise_name', label: '크루즈명', type: 'text', required: true },
          { key: 'name', label: '영문명', type: 'text', required: true },
          { key: 'cruise_code', label: '객실 코드', type: 'text', required: true },
          { key: 'room_name', label: '객실명', type: 'text', required: true },
          { key: 'category', label: '카테고리', type: 'text' },
          { key: 'description', label: '크루즈 설명', type: 'textarea' },
          { key: 'cruise_image', label: '크루즈 이미지 URL', type: 'text' },
          { key: 'room_image', label: '객실 이미지 URL', type: 'text' },
          { key: 'room_area', label: '객실 면적', type: 'text' },
          { key: 'room_description', label: '객실 설명', type: 'textarea' },
          { key: 'bed_type', label: '침대 유형', type: 'text' },
          { key: 'max_adults', label: '최대 성인', type: 'number', required: true },
          { key: 'max_guests', label: '최대 인원', type: 'number', required: true },
          { key: 'base_price', label: '기본 가격', type: 'number' },
          { key: 'display_order', label: '표시 순서', type: 'number' },
          { key: 'has_balcony', label: '발코니', type: 'boolean', options: yesNoOptions },
          { key: 'is_vip', label: 'VIP 객실', type: 'boolean', options: yesNoOptions },
          { key: 'is_recommended', label: '추천 객실', type: 'boolean', options: yesNoOptions },
          { key: 'connecting_available', label: '커넥팅 가능', type: 'boolean', options: yesNoOptions },
          { key: 'extra_bed_available', label: '엑스트라베드 가능', type: 'boolean', options: yesNoOptions },
          { key: 'special_amenities', label: '특별 어메니티', type: 'textarea' },
          { key: 'warnings', label: '주의사항', type: 'textarea' },
        ],
      },
      {
        id: 'rates', label: '객실 요금', table: 'cruise_rate_card', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'cruise_name', columns: ['cruise_name', 'schedule_type', 'room_type', 'price_adult', 'valid_from', 'valid_to', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { valid_year: currentYear, currency: 'VND', is_active: true, display_order: 0 },
        fields: [
          { key: 'cruise_name', label: '크루즈명', type: 'text', required: true, relation: { dataset: 'rooms', valueField: 'cruise_name', labelField: 'cruise_name' } },
          { key: 'schedule_type', label: '일정', type: 'select', required: true, options: [{ value: 'DAY', label: '당일' }, { value: '1N2D', label: '1박 2일' }, { value: '2N3D', label: '2박 3일' }] },
          { key: 'room_type', label: '객실명', type: 'text', required: true },
          { key: 'room_type_en', label: '객실 영문명', type: 'text' },
          { key: 'price_adult', label: '성인 요금', type: 'number', required: true },
          { key: 'price_child', label: '아동 요금', type: 'number' },
          { key: 'price_infant', label: '유아 요금', type: 'number' },
          { key: 'price_extra_bed', label: '엑스트라베드', type: 'number' },
          { key: 'price_single', label: '싱글 요금', type: 'number' },
          { key: 'valid_year', label: '적용 연도', type: 'number', required: true },
          { key: 'valid_from', label: '적용 시작', type: 'date' },
          { key: 'valid_to', label: '적용 종료', type: 'date' },
          { key: 'season_name', label: '시즌', type: 'text' },
          { key: 'currency', label: '통화', type: 'text', required: true },
          { key: 'display_order', label: '표시 순서', type: 'number' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
          { key: 'notes', label: '비고', type: 'textarea' },
        ],
      },
      {
        id: 'content', label: '홈페이지 소개', table: 'homepage_cruise_content', primaryKey: 'cruise_name',
        orderBy: 'name_ko', columns: ['cruise_name', 'name_ko', 'name_en', 'category', 'star_rating', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { is_active: true },
        fields: [
          { key: 'cruise_name', label: '플랫폼 크루즈명', type: 'text', required: true, relation: { dataset: 'rooms', valueField: 'cruise_name', labelField: 'cruise_name' } },
          { key: 'name_ko', label: '한글 표시명', type: 'text', required: true },
          { key: 'name_en', label: '영문 표시명', type: 'text' },
          { key: 'description', label: '소개', type: 'textarea' },
          { key: 'category', label: '카테고리', type: 'text' },
          { key: 'star_rating', label: '성급', type: 'number' },
          { key: 'hero_image', label: '대표 이미지 URL', type: 'text' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
      {
        id: 'itineraries', label: '홈페이지 일정', table: 'homepage_cruise_itineraries', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'cruise_name', columns: ['cruise_name', 'schedule_type', 'description', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { is_active: true },
        fields: [
          { key: 'cruise_name', label: '크루즈명', type: 'text', required: true, relation: { dataset: 'rooms', valueField: 'cruise_name', labelField: 'cruise_name' } },
          { key: 'schedule_type', label: '일정', type: 'select', required: true, options: [{ value: 'DAY', label: '당일' }, { value: '1N2D', label: '1박 2일' }, { value: '2N3D', label: '2박 3일' }] },
          { key: 'description', label: '일정 설명', type: 'textarea' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
      {
        id: 'tags', label: '홈페이지 추천 태그', table: 'homepage_cruise_tags', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'cruise_name', columns: ['cruise_name', 'tag', 'evidence', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { is_active: true },
        fields: [
          { key: 'cruise_name', label: '크루즈명', type: 'text', required: true, relation: { dataset: 'rooms', valueField: 'cruise_name', labelField: 'cruise_name' } },
          { key: 'tag', label: '태그', type: 'select', required: true, options: [{ value: 'family', label: '가족' }, { value: 'couple', label: '커플' }, { value: 'balcony', label: '발코니' }, { value: 'quiet', label: '조용함' }, { value: 'activity', label: '액티비티' }, { value: 'value', label: '가성비' }, { value: 'luxury', label: '럭셔리' }] },
          { key: 'evidence', label: '추천 근거', type: 'textarea', required: true },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
    ],
  },
  {
    id: 'airport', label: '공항', datasets: [
      {
        id: 'airports', label: '공항명', table: 'airport_name', primaryKey: 'airport_id', generatedPrimaryKey: true,
        orderBy: 'airport_name', columns: ['airport_code', 'airport_name'],
        fields: [
          { key: 'airport_code', label: '공항 코드', type: 'text', required: true },
          { key: 'airport_name', label: '공항명', type: 'text', required: true },
        ],
      },
      {
        id: 'rates', label: '공항 요금', table: 'airport_price', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'route', columns: ['airport_code', 'service_type', 'vehicle_type', 'route', 'price', 'year', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { year: currentYear, is_active: true },
        fields: [
          { key: 'airport_code', label: '요금 코드', type: 'text', required: true },
          { key: 'service_type', label: '서비스 유형', type: 'text', required: true },
          { key: 'vehicle_type', label: '차량 유형', type: 'text', required: true },
          { key: 'vehicle_examples', label: '차량 예시', type: 'text' },
          { key: 'recommended_capacity', label: '권장 인원', type: 'number' },
          { key: 'max_capacity', label: '최대 인원', type: 'number' },
          { key: 'route', label: '노선', type: 'text', required: true },
          { key: 'route_from', label: '출발지', type: 'text', required: true },
          { key: 'route_to', label: '도착지', type: 'text', required: true },
          { key: 'duration', label: '소요시간', type: 'text' },
          { key: 'price', label: '요금', type: 'number', required: true },
          { key: 'year', label: '적용 연도', type: 'number' },
          { key: 'valid_from', label: '적용 시작', type: 'date' },
          { key: 'valid_to', label: '적용 종료', type: 'date' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
    ],
  },
  {
    id: 'hotel', label: '호텔', datasets: [
      {
        id: 'hotels', label: '호텔 기본 정보', table: 'hotel_info', primaryKey: 'hotel_code',
        orderBy: 'hotel_name', columns: ['hotel_code', 'hotel_name', 'location', 'star_rating', 'currency', 'active'], touchesUpdatedAt: true,
        insertDefaults: { product_type: 'HOTEL', currency: 'VND', active: true },
        fields: [
          { key: 'hotel_code', label: '호텔 코드', type: 'text', required: true },
          { key: 'hotel_name', label: '호텔명', type: 'text', required: true },
          { key: 'product_type', label: '상품 유형', type: 'text', required: true },
          { key: 'location', label: '위치', type: 'text' },
          { key: 'star_rating', label: '성급', type: 'number' },
          { key: 'check_in_time', label: '체크인', type: 'time' },
          { key: 'check_out_time', label: '체크아웃', type: 'time' },
          { key: 'phone', label: '연락처', type: 'text' },
          { key: 'currency', label: '통화', type: 'text' },
          { key: 'notes', label: '비고', type: 'textarea' },
          { key: 'active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
      {
        id: 'rooms', label: '객실·요금', table: 'hotel_price', primaryKey: 'hotel_price_code',
        orderBy: 'hotel_name', columns: ['hotel_price_code', 'hotel_name', 'room_name', 'base_price', 'start_date', 'end_date'], touchesUpdatedAt: true,
        insertDefaults: { include_breakfast: false, occupancy_max: 2 },
        fields: [
          { key: 'hotel_price_code', label: '객실 요금 코드', type: 'text', required: true },
          { key: 'hotel_code', label: '호텔 코드', type: 'select', required: true, relation: { dataset: 'hotels', valueField: 'hotel_code', labelField: 'hotel_name' } },
          { key: 'hotel_name', label: '호텔명', type: 'text', required: true },
          { key: 'room_type', label: '객실 유형', type: 'text', required: true },
          { key: 'room_name', label: '객실명', type: 'text', required: true },
          { key: 'room_category', label: '객실 구분', type: 'text' },
          { key: 'occupancy_max', label: '최대 투숙', type: 'number' },
          { key: 'include_breakfast', label: '조식 포함', type: 'boolean', options: yesNoOptions },
          { key: 'base_price', label: '기본 요금', type: 'number', required: true },
          { key: 'extra_person_price', label: '추가 인원 요금', type: 'number' },
          { key: 'child_policy', label: '아동 정책', type: 'textarea' },
          { key: 'season_name', label: '시즌', type: 'text' },
          { key: 'start_date', label: '적용 시작', type: 'date', required: true },
          { key: 'end_date', label: '적용 종료', type: 'date', required: true },
          { key: 'weekday_type', label: '요일 구분', type: 'text' },
          { key: 'notes', label: '비고', type: 'textarea' },
        ],
      },
    ],
  },
  {
    id: 'tour', label: '투어', datasets: [
      {
        id: 'tours', label: '투어 기본 정보', table: 'tour', primaryKey: 'tour_id', generatedPrimaryKey: true,
        orderBy: 'tour_name', columns: ['tour_code', 'tour_name', 'category', 'location', 'group_type', 'status', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { group_type: 'private', status: 'active', is_active: true, review_count: 0, rating: 0 },
        fields: [
          { key: 'tour_code', label: '투어 코드', type: 'text', required: true },
          { key: 'tour_name', label: '투어명', type: 'text', required: true },
          { key: 'category', label: '카테고리', type: 'text', required: true },
          { key: 'description', label: '설명', type: 'textarea' },
          { key: 'overview', label: '개요', type: 'textarea' },
          { key: 'duration', label: '소요시간', type: 'text' },
          { key: 'group_type', label: '그룹 유형', type: 'select', required: true, options: [{ value: 'private', label: '단독' }, { value: 'group', label: '그룹' }, { value: 'hybrid', label: '혼합' }] },
          { key: 'location', label: '지역', type: 'text' },
          { key: 'starting_point', label: '집결지', type: 'text' },
          { key: 'meeting_time', label: '집결 시간', type: 'time' },
          { key: 'image_url', label: '대표 이미지 URL', type: 'text' },
          { key: 'thumbnail_url', label: '썸네일 URL', type: 'text' },
          { key: 'status', label: '상태', type: 'select', options: [{ value: 'active', label: '활성' }, { value: 'inactive', label: '비활성' }, { value: 'discontinued', label: '판매 종료' }, { value: 'seasonal', label: '시즌 운영' }] },
          { key: 'program_type', label: '프로그램 유형', type: 'text' },
          { key: 'payment_notes', label: '결제 안내', type: 'textarea' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
      {
        id: 'rates', label: '투어 요금', table: 'tour_pricing', primaryKey: 'pricing_id', generatedPrimaryKey: true,
        orderBy: 'tour_id', columns: ['tour_id', 'min_guests', 'max_guests', 'price_per_person', 'valid_from', 'valid_until', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { is_active: true, balance_currency: 'VND' },
        fields: [
          { key: 'tour_id', label: '투어', type: 'select', required: true, relation: { dataset: 'tours', valueField: 'tour_id', labelField: 'tour_name' } },
          { key: 'min_guests', label: '최소 인원', type: 'number', required: true },
          { key: 'max_guests', label: '최대 인원', type: 'number', required: true },
          { key: 'price_per_person', label: '1인 요금', type: 'number', required: true },
          { key: 'adult_price', label: '성인 요금', type: 'number' },
          { key: 'child_price', label: '아동 요금', type: 'number' },
          { key: 'vehicle_type', label: '차량 유형', type: 'text' },
          { key: 'deposit_amount', label: '예약금', type: 'number' },
          { key: 'deposit_rate', label: '예약금 비율', type: 'number' },
          { key: 'valid_from', label: '적용 시작', type: 'date' },
          { key: 'valid_until', label: '적용 종료', type: 'date' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
    ],
  },
  {
    id: 'rentcar', label: '렌트카', datasets: [
      {
        id: 'rates', label: '렌트카 요금', table: 'rentcar_price', primaryKey: 'id', generatedPrimaryKey: true,
        orderBy: 'route', columns: ['rent_code', 'category', 'vehicle_type', 'route', 'way_type', 'price', 'capacity', 'is_active'], touchesUpdatedAt: true,
        insertDefaults: { year: currentYear, is_active: true },
        fields: [
          { key: 'rent_code', label: '렌트 코드', type: 'text', required: true },
          { key: 'category', label: '카테고리', type: 'text' },
          { key: 'car_category_code', label: '차량 분류 코드', type: 'text' },
          { key: 'vehicle_type', label: '차량 유형', type: 'text' },
          { key: 'route', label: '노선', type: 'text' },
          { key: 'route_from', label: '출발지', type: 'text' },
          { key: 'route_to', label: '도착지', type: 'text' },
          { key: 'way_type', label: '운행 방식', type: 'text' },
          { key: 'price', label: '요금', type: 'number' },
          { key: 'capacity', label: '정원', type: 'number' },
          { key: 'duration_hours', label: '이용 시간', type: 'number' },
          { key: 'rental_type', label: '대여 유형', type: 'text' },
          { key: 'year', label: '적용 연도', type: 'number' },
          { key: 'description', label: '설명', type: 'textarea' },
          { key: 'cruise', label: '연결 크루즈', type: 'text' },
          { key: 'memo', label: '비고', type: 'textarea' },
          { key: 'is_active', label: '사용 여부', type: 'boolean', options: yesNoOptions },
        ],
      },
    ],
  },
];

export function findProductService(serviceId: string | null | undefined) {
  return SERVICE_PRODUCT_CATALOG.find((service) => service.id === serviceId) || null;
}

export function findProductDataset(serviceId: string | null | undefined, datasetId: string | null | undefined) {
  return findProductService(serviceId)?.datasets.find((dataset) => dataset.id === datasetId) || null;
}
