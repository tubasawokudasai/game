import { SceneRecord } from '../models/types';

export interface SceneDto {
  mapId: string;
  name: string;
  region: string;
  level: number;
  parentId: string | null;
  icon: string;
  coords: [number, number];
  statusDesc: string;
  tag: string;
  subtitle: string;
  thumb: string;
  backgroundUrl: string;
  desc: string;
  feature: string;
  cost: string;
  btnText: string;
  onlineCount: number;
}

/**
 * 将 scenes 表中的原始记录转换为统一的前端 SceneDto
 */
export function toSceneDto(s: SceneRecord, onlineCount: number = 1): SceneDto {
  return {
    mapId: s.id,
    name: s.name,
    region: s.region,
    level: s.level ?? 3,
    parentId: s.parent_id ?? null,
    icon: s.icon || (s.level === 1 ? 'fort' : s.level === 2 ? 'castle' : 'flag'),
    coords: [s.coord_x, s.coord_y], // 512×512 世界坐标（非画布百分比），由前端统一换算
    statusDesc: s.status_desc,
    tag: s.tag || '',
    subtitle: s.subtitle || '',
    thumb: s.thumb || '',
    backgroundUrl: s.background_url || '',
    desc: s.description || '',
    feature: s.feature || '',
    cost: s.cost_desc || '',
    btnText: s.btn_text || '前往',
    onlineCount,
  };
}
