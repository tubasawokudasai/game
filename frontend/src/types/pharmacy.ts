export interface PharmacyDoctor {
  name: string;
  title: string;
  dialogue: string;
  avatar: string;
}

export interface PharmacyFacilityMeta {
  name: string;
  sub: string;
  desc: string;
  action: string;
  icon: string;
  color: string;
  doctor: PharmacyDoctor;
}

export interface PharmacyGood {
  itemId: string;
  name: string;
  quality: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  type: string;
  priceCopper: number;
  description: string;
  effectDesc: string;
  icon: string;
}

export interface AlchemyRecipe {
  id: string;
  name: string;
  outputItemId: string;
  outputItemName: string;
  outputCount: number;
  costCopper: number;
  costExp: number;
  quality: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
  description: string;
  icon: string;
}

export interface PharmacyPartyMember {
  id: string;
  name: string;
  title: string;
  avatar: string;
  role: 'LEADER' | 'DPS' | 'HEALER' | 'TANK';
  realm: string;
  level: number;
  isLeader: boolean;
  isActive: boolean;
}

export interface PharmacyInfoResponse {
  facility: PharmacyFacilityMeta;
  healCost: number;
  canHeal: boolean;
  needHeal: boolean;
  player: {
    id: string;
    nickname: string;
    level: number;
    realm: string;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    copper: number;
    silver: number;
    ingot: number;
  };
  party: PharmacyPartyMember[];
  goods: PharmacyGood[];
  recipes: AlchemyRecipe[];
}

export interface PharmacyHealResponse {
  success: boolean;
  cost: number;
  hpRecovered: number;
  mpRecovered: number;
  message: string;
  player: {
    id: string;
    hp: number;
    maxHp: number;
    mp: number;
    maxMp: number;
    copper: number;
  };
  party: PharmacyPartyMember[];
}

export interface PharmacyBuyResponse {
  success: boolean;
  message: string;
  cost: number;
  good: PharmacyGood;
  count: number;
  player: {
    copper: number;
  };
}

export interface PharmacyCraftResponse {
  success: boolean;
  message: string;
  recipe: AlchemyRecipe;
  outputCount: number;
  player: {
    copper: number;
    exp: number;
  };
}
